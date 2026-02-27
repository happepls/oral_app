import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

const RealTimeRecorder = forwardRef(({
  onAudioData,
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

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const audioStreamRef = useRef(null);
  const isCancelledRef = useRef(false);
  const isStartingRef = useRef(false);
  const recordingStartTimeRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const animationFrameRef = useRef(null);
  const onAudioDataRef = useRef(onAudioData);

  // Update onAudioData ref when prop changes
  useEffect(() => {
    onAudioDataRef.current = onAudioData;
  }, [onAudioData]);

  useImperativeHandle(ref, () => ({
    startRecording: () => {
      if (!isRecording && !isStartingRef.current) startRecording();
    },
    stopRecording: () => {
      if (isRecording) stopRecording();
    }
  }));

  useEffect(() => {
    return () => {
      cleanupAudioResources();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const cleanupAudioResources = () => {
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current = null;
    }
  };

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')},${centiseconds.toString().padStart(2, '0')}`;
  };

  const startTimer = () => {
    recordingStartTimeRef.current = Date.now();
    setRecordingTime(0);
    timerIntervalRef.current = setInterval(() => {
      setRecordingTime(Date.now() - recordingStartTimeRef.current);
    }, 10);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const monitorAudioLevel = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate average audio level
    const sum = dataArray.reduce((a, b) => a + b, 0);
    const average = sum / dataArray.length;
    const normalizedLevel = Math.min(1, average / 128);

    setAudioLevel(normalizedLevel);

    animationFrameRef.current = requestAnimationFrame(monitorAudioLevel);
  };

  const startRecording = async () => {
    if (isStartingRef.current) return;
    
    // Check if connected before starting
    if (!isConnected) {
      alert('AI 导师尚未连接，请稍后再试');
      return;
    }
    
    isStartingRef.current = true;

    try {
      // Get user media with optimized constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
          latency: 0.01,
          googEchoCancellation: true,
          googNoiseSuppression: true,
          googAutoGainControl: true,
          googHighpassFilter: false,
          googTypingNoiseDetection: false
        }
      });
      audioStreamRef.current = stream;

      // Create audio context with optimized settings
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
        latencyHint: 'interactive',
        bufferSize: 256
      });
      audioContextRef.current = audioContext;

      // Create analyser for real-time audio level monitoring
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Load optimized audio processor
      await audioContext.audioWorklet.addModule('/recorder-processor-optimized.js');

      const audioWorkletNode = new AudioWorkletNode(audioContext, 'recorder-processor-optimized', {
        processorOptions: {
          bufferSize: 800,
          energyThreshold: 0.02,
          enableVAD: true
        }
      });
      audioWorkletNodeRef.current = audioWorkletNode;

      // Connect worklet for audio processing
      analyser.connect(audioWorkletNode);

      // Handle messages from audio worklet
      audioWorkletNode.port.onmessage = (event) => {
        if (isCancelledRef.current) {
          console.log('Audio worklet message ignored (cancelled)');
          return;
        }

        const data = event.data;
        console.log('Audio worklet message received:', data?.type);

        if (data.type === 'speech_start') {
          console.log('Speech detected, energy:', data.energy);
        } else if (data.type === 'speech_end') {
          console.log('Speech ended, energy:', data.energy);
        } else if (data.type === 'audio_data' && onAudioDataRef.current) {
          console.log('Audio worklet sent audio_data:', data.buffer?.length, 'bytes');
          onAudioDataRef.current(data.buffer);
        }
      };

      // Start monitoring audio level for waveform visualization
      monitorAudioLevel();

      isCancelledRef.current = false;
      setIsRecording(true);
      setShowControls(true);
      isStartingRef.current = false;

      startTimer();

      if (onStart) onStart();

    } catch (error) {
      console.error('Error starting recording:', error);
      isStartingRef.current = false;
      setShowControls(false);

      let errorMessage = '无法启动录音';
      if (error.name === 'NotAllowedError') {
        errorMessage = '需要麦克风权限才能录音';
      } else if (error.name === 'NotFoundError') {
        errorMessage = '未找到麦克风设备';
      } else if (error.name === 'NotReadableError') {
        errorMessage = '麦克风被其他应用占用';
      }

      alert(errorMessage);
    }
  };

  const stopRecording = () => {
    cleanupAudioResources();
    stopTimer();
    setIsRecording(false);
    setShowControls(false);
    setRecordingTime(0);
    setAudioLevel(0);
    isStartingRef.current = false;

    if (onStop) onStop();
  };

  const cancelRecording = () => {
    isCancelledRef.current = true;
    cleanupAudioResources();
    stopTimer();
    setIsRecording(false);
    setShowControls(false);
    setRecordingTime(0);
    setAudioLevel(0);
    isStartingRef.current = false;

    if (onCancel) onCancel();
  };

  // Generate dynamic waveform bars based on audio level
  const generateWaveformBars = () => {
    const numBars = 20;
    const bars = [];
    for (let i = 0; i < numBars; i++) {
      // Create a wave pattern that responds to audio level
      const waveHeight = Math.sin((i / numBars) * Math.PI * 2 + Date.now() / 100) * 0.5 + 0.5;
      const height = Math.max(10, Math.min(100, (waveHeight * 0.5 + 0.5) * audioLevel * 100));
      bars.push(height);
    }
    return bars;
  };

  const [waveformHeights, setWaveformHeights] = useState(Array(20).fill(30));

  // Update waveform animation
  useEffect(() => {
    if (isRecording) {
      const updateWaveform = () => {
        setWaveformHeights(generateWaveformBars());
        animationFrameRef.current = requestAnimationFrame(updateWaveform);
      };
      updateWaveform();
    } else {
      setWaveformHeights(Array(20).fill(30));
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording, audioLevel]);

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {isRecording && showControls ? (
        // Recording controls UI
        <div className="flex items-center gap-3 w-full max-w-xs">
          {/* Timer display */}
          <div className="flex-1 bg-white dark:bg-slate-800 rounded-full px-4 py-3 flex items-center gap-2 shadow-lg">
            <div className="flex gap-0.5 items-center flex-grow">
              {waveformHeights.map((height, idx) => (
                <div
                  key={idx}
                  className="w-1 bg-red-500 rounded-full transition-all duration-75"
                  style={{ height: `${height}%`, minHeight: '4px' }}
                />
              ))}
            </div>
            <span className="text-lg font-mono font-medium text-slate-800 dark:text-slate-200 min-w-[80px] text-right">
              {formatTime(recordingTime)}
            </span>
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          </div>

          {/* Cancel button */}
          <button
            onClick={cancelRecording}
            className="w-14 h-14 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center shadow-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <span className="material-symbols-outlined text-red-500 text-2xl">delete</span>
          </button>

          {/* Send button */}
          <button
            onClick={stopRecording}
            className="w-14 h-14 bg-blue-500 rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-colors"
          >
            <span className="material-symbols-outlined text-white text-2xl">send</span>
          </button>
        </div>
      ) : (
        // Default microphone button
        <button
          onClick={startRecording}
          disabled={!isConnected}
          className={`relative flex items-center justify-center w-20 h-20 rounded-full font-medium transition-all shadow-lg shadow-primary/40
            ${isConnected
              ? 'bg-primary hover:shadow-xl hover:scale-105'
              : 'bg-slate-400 cursor-not-allowed opacity-50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <span className="material-symbols-outlined text-white text-3xl">
            {!isConnected ? 'signal_wifi_off' : 'mic'}
          </span>
        </button>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500 text-center min-h-[20px]">
        {isRecording && showControls ? '点击取消或发送' : !isConnected ? '连接中...' : '点击说话'}
      </p>
    </div>
  );
});

export default RealTimeRecorder;
