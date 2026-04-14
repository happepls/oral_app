import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Mic, WifiOff, X, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const BAR_COUNT = 32;

/** Generate waveform bar heights (0-100) driven by real audio level */
const generateBars = (level, prevBars) => {
  const t = Date.now() / 1000;
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    // Organic multi-frequency movement per bar
    const organic =
      Math.sin(t * 4.2 + i * 0.65) * 0.35 +
      Math.sin(t * 2.7 + i * 1.20) * 0.25 +
      Math.sin(t * 1.3 + i * 0.40) * 0.15 +
      0.75;                          // bias so organic ∈ [0.0, 1.5] approx

    const clamped = Math.max(0, Math.min(1, organic));
    const minH = 6;
    const maxH = 88;

    // At silence: tiny organic jitter (minH + small range)
    // When loud:  full-height bars scaled by organic per-bar variance
    const h = minH + (maxH - minH) * level * clamped + (1 - level) * clamped * 6;
    return Math.round(Math.max(minH, Math.min(maxH, h)));
  });
};

const RealTimeRecorder = forwardRef(({
  isConnected,
  onStart,
  onStop,
  onCancel,
  enableCompression = true,
  enableMetrics = false
}, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [waveformBars, setWaveformBars] = useState(Array(BAR_COUNT).fill(6));

  const audioContextRef       = useRef(null);
  const analyserRef           = useRef(null);
  const audioWorkletNodeRef   = useRef(null);
  const audioStreamRef        = useRef(null);
  const isCancelledRef        = useRef(false);
  const isStartingRef         = useRef(false);
  const recordingStartTimeRef = useRef(null);
  const timerIntervalRef      = useRef(null);
  const waveformRafRef        = useRef(null);   // dedicated RAF for waveform+level loop
  const audioBufferRef        = useRef([]);
  const recordingSessionIdRef = useRef(null);
  const audioLevelRef         = useRef(0);      // live level accessible inside RAF

  useEffect(() => {
    return () => {
      cleanupAudioResources();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (waveformRafRef.current) cancelAnimationFrame(waveformRafRef.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    startRecording:  () => { if (!isRecording && !isStartingRef.current) startRecording(); },
    stopRecording:   () => { if (isRecording) return getAndClearAudioBuffer(); },
    cancelRecording: () => { internalCancelRecording(); },
    getSessionId:    () => recordingSessionIdRef.current,
    setSessionId:    (id) => { recordingSessionIdRef.current = id; },
    clearSessionId:  () => { recordingSessionIdRef.current = null; }
  }));

  const cleanupAudioResources = () => {
    if (audioWorkletNodeRef.current) { audioWorkletNodeRef.current.disconnect(); audioWorkletNodeRef.current = null; }
    if (audioContextRef.current)     { audioContextRef.current.close();          audioContextRef.current = null; }
    if (audioStreamRef.current)      { audioStreamRef.current.getTracks().forEach(t => t.stop()); audioStreamRef.current = null; }
    analyserRef.current = null;
  };

  const getAndClearAudioBuffer = () => {
    const buf = [...audioBufferRef.current];
    audioBufferRef.current = [];
    return buf;
  };

  const formatTime = (ms) => {
    const s   = Math.floor(ms / 1000);
    const min = Math.floor(s / 60);
    const sec = s % 60;
    const cs  = Math.floor((ms % 1000) / 10);
    return `${min}:${sec.toString().padStart(2, '0')},${cs.toString().padStart(2, '0')}`;
  };

  const startTimer = () => {
    recordingStartTimeRef.current = Date.now();
    setRecordingTime(0);
    timerIntervalRef.current = setInterval(() => {
      setRecordingTime(Date.now() - recordingStartTimeRef.current);
    }, 10);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
  };

  /** Single RAF loop: reads audio level AND updates waveform bars */
  const startWaveformLoop = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    const loop = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const avg = sum / dataArray.length;
      const level = Math.min(1, avg / 80); // /80 makes it more sensitive than /128
      audioLevelRef.current = level;
      setAudioLevel(level);
      setWaveformBars(prev => generateBars(level, prev));

      waveformRafRef.current = requestAnimationFrame(loop);
    };

    waveformRafRef.current = requestAnimationFrame(loop);
  };

  const stopWaveformLoop = () => {
    if (waveformRafRef.current) {
      cancelAnimationFrame(waveformRafRef.current);
      waveformRafRef.current = null;
    }
    setAudioLevel(0);
    setWaveformBars(Array(BAR_COUNT).fill(6));
  };

  const startRecording = async () => {
    if (isStartingRef.current) return;
    if (!isConnected) { alert('AI 导师尚未连接，请稍后再试'); return; }

    isStartingRef.current = true;
    isCancelledRef.current = false;

    const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    recordingSessionIdRef.current = sessionId;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true, noiseSuppression: true, autoGainControl: true,
          channelCount: 1, sampleRate: 16000, latency: 0.01
        }
      });
      audioStreamRef.current = stream;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000, latencyHint: 'interactive'
      });
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75; // smooth out spikes
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      await audioContext.audioWorklet.addModule('/recorder-processor-optimized.js');
      const workletNode = new AudioWorkletNode(audioContext, 'recorder-processor-optimized', {
        processorOptions: { bufferSize: 800, energyThreshold: 0.02, enableVAD: true }
      });
      audioWorkletNodeRef.current = workletNode;
      analyser.connect(workletNode);

      workletNode.port.onmessage = (event) => {
        if (isCancelledRef.current) return;
        const { type, buffer } = event.data;
        if (type === 'audio_data') {
          audioBufferRef.current.push(buffer);
        }
      };

      // Start single unified waveform + level loop
      startWaveformLoop();

      setIsRecording(true);
      setShowControls(true);
      isStartingRef.current = false;
      startTimer();
      if (onStart) onStart();

    } catch (error) {
      isStartingRef.current = false;
      setShowControls(false);
      let msg = '无法启动录音';
      if (error.name === 'NotAllowedError') msg = '需要麦克风权限才能录音';
      else if (error.name === 'NotFoundError') msg = '未找到麦克风设备';
      else if (error.name === 'NotReadableError') msg = '麦克风被其他应用占用';
      alert(msg);
    }
  };

  const stopRecording = () => {
    stopWaveformLoop();
    cleanupAudioResources();
    stopTimer();
    setIsRecording(false);
    setShowControls(false);
    setRecordingTime(0);
    isStartingRef.current = false;
    const buffers = getAndClearAudioBuffer();
    if (onStop) onStop(buffers);
  };

  const internalCancelRecording = () => {
    isCancelledRef.current = true;
    recordingSessionIdRef.current = null;
    audioBufferRef.current = [];
    stopWaveformLoop();
    cleanupAudioResources();
    stopTimer();
    setIsRecording(false);
    setShowControls(false);
    setRecordingTime(0);
    isStartingRef.current = false;
  };

  // Bar color: interpolate from indigo-400 (silence) → rose-500 (loud)
  const barColor = (idx) => {
    const level = audioLevelRef.current;
    if (level < 0.15) return '#818cf8';      // indigo-400
    if (level < 0.45) return '#a78bfa';      // violet-400
    if (level < 0.70) return '#f472b6';      // pink-400
    return '#f43f5e';                        // rose-500
  };

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <AnimatePresence mode="wait">
        {isRecording && showControls ? (
          /* ── Recording state ── */
          <motion.div
            key="recording"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-2 w-full"
          >
            {/* Waveform + timer pill */}
            <div className="flex-1 bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-md overflow-hidden">
              {/* Pulse dot */}
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />

              {/* Waveform bars */}
              <div className="flex items-center gap-[2px] flex-1 h-9">
                {waveformBars.map((h, idx) => (
                  <div
                    key={idx}
                    style={{
                      height: `${h}%`,
                      minHeight: '3px',
                      backgroundColor: barColor(idx),
                      borderRadius: '9999px',
                      flex: '1',
                      transition: 'height 60ms ease-out, background-color 200ms ease',
                    }}
                  />
                ))}
              </div>

              {/* Timer */}
              <span className="text-sm font-mono font-semibold text-gray-700 tabular-nums shrink-0">
                {formatTime(recordingTime)}
              </span>
            </div>

            {/* Cancel */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.93 }}
              onClick={internalCancelRecording}
              className="w-12 h-12 bg-white border border-gray-200 rounded-2xl flex items-center justify-center shadow-md hover:border-red-300 hover:bg-red-50 transition-colors shrink-0"
              title="取消"
            >
              <X className="w-5 h-5 text-red-400" />
            </motion.button>

            {/* Send */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.93 }}
              onClick={stopRecording}
              className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-md transition-colors shrink-0"
              style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
              title="发送"
            >
              <Send className="w-5 h-5 text-white" />
            </motion.button>
          </motion.div>
        ) : (
          /* ── Idle state ── */
          <motion.button
            key="idle"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.18 }}
            whileHover={isConnected ? { scale: 1.06 } : {}}
            whileTap={isConnected ? { scale: 0.94 } : {}}
            onClick={startRecording}
            disabled={!isConnected}
            className="relative w-full h-14 rounded-2xl flex items-center justify-center gap-2 text-white font-medium shadow-lg transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isConnected
                ? 'linear-gradient(135deg, #637FF1, #a47af6)'
                : '#94A3B8',
            }}
          >
            {/* Ripple rings when connected */}
            {isConnected && (
              <>
                {[0, 1].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 rounded-2xl border-2 border-white/30"
                    animate={{ scale: [1, 1.12], opacity: [0.4, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }}
                  />
                ))}
              </>
            )}
            <div className="relative z-10 flex items-center gap-2">
              {isConnected ? (
                <Mic className="w-5 h-5" />
              ) : (
                <WifiOff className="w-5 h-5" />
              )}
              <span className="text-sm">{isConnected ? '点击说话' : '连接中...'}</span>
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {isRecording && showControls && (
        <p className="text-xs text-gray-400 text-center">点击取消或发送</p>
      )}
    </div>
  );
});

export default RealTimeRecorder;
