import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import AudioStreamManager from '../utils/audio-stream-manager';

const CANCEL_THRESHOLD = 80;

const RealTimeRecorderOptimized = forwardRef(({ 
  onAudioData, 
  isConnected, 
  onStart, 
  onStop, 
  onCancel,
  enableCompression = true,
  enableMetrics = false
}, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSpeechDetected, setIsSpeechDetected] = useState(false);
  
  const audioContextRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const audioStreamRef = useRef(null);
  const touchStartXRef = useRef(0);
  const isCancelledRef = useRef(false);
  const isStartingRef = useRef(false);
  const pendingStopRef = useRef(null);
  const buttonRef = useRef(null);
  
  // Audio stream manager for advanced processing
  const audioStreamManagerRef = useRef(null);
  const streamManagerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    startRecording: () => {
      if (!isRecording && !isStartingRef.current) startRecording();
    },
    stopRecording: () => {
      if (isRecording) stopRecording();
    },
    getPerformanceMetrics: () => {
      return streamManagerRef.current?.getPerformanceReport() || {};
    }
  }));

  useEffect(() => {
    return () => {
      cleanupAudioResources();
      if (streamManagerRef.current) {
        streamManagerRef.current.destroy();
      }
    };
  }, []);

  const cleanupAudioResources = () => {
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current.port.close();
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
  };

  const startRecording = async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    try {
      // Initialize audio stream manager
      if (!streamManagerRef.current) {
        streamManagerRef.current = new AudioStreamManager({
          sampleRate: 16000,
          channelCount: 1,
          bitDepth: 16,
          enableCompression: enableCompression,
          enableMetrics: enableMetrics,
          maxChunkSize: 1024,
          bufferDuration: 150, // Reduced from 200ms to 150ms
          adaptiveBitrate: true,
          networkOptimization: true
        });
      }

      // Get user media with optimized constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
          latency: 0.01, // Request ultra-low latency
          googEchoCancellation: true,
          googNoiseSuppression: true,
          googAutoGainControl: true,
          googHighpassFilter: false, // Disable high-pass filter for better voice quality
          googTypingNoiseDetection: false // Disable typing noise detection
        }
      });
      
      audioStreamRef.current = stream;

      // Create audio context with optimized settings
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ 
        sampleRate: 16000,
        latencyHint: 'interactive', // Ultra-low latency mode
        bufferSize: 256 // Small buffer for low latency
      });
      
      audioContextRef.current = audioContext;

      // Load optimized audio processor
      await audioContext.audioWorklet.addModule('/recorder-processor-optimized.js');

      const source = audioContext.createMediaStreamSource(stream);
      const audioWorkletNode = new AudioWorkletNode(audioContext, 'recorder-processor-optimized', {
        processorOptions: {
          bufferSize: 800, // 50ms chunks
          energyThreshold: 0.02,
          enableVAD: true
        }
      });
      
      audioWorkletNodeRef.current = audioWorkletNode;

      // Handle messages from audio worklet
      audioWorkletNode.port.onmessage = (event) => {
        if (isCancelledRef.current) return;
        
        const data = event.data;
        
        if (data.type === 'speech_start') {
          setIsSpeechDetected(true);
          console.log('Speech detected, energy:', data.energy);
        } else if (data.type === 'speech_end') {
          setIsSpeechDetected(false);
          console.log('Speech ended, energy:', data.energy);
        } else if (data.type === 'audio_data' && onAudioData) {
          // Process audio data through stream manager
          if (streamManagerRef.current) {
            streamManagerRef.current.sendAudioData(
              new Uint8Array(data.buffer),
              (packet) => {
                // Send optimized packet
                onAudioData(packet);
              }
            );
          } else {
            // Fallback to direct sending
            onAudioData(data.buffer);
          }
        }
      };

      source.connect(audioWorkletNode);

      isCancelledRef.current = false;
      setIsRecording(true);
      isStartingRef.current = false;
      
      if (onStart) onStart();

      // Handle pending stop action
      if (pendingStopRef.current) {
        const action = pendingStopRef.current;
        pendingStopRef.current = null;
        if (action === 'cancel') {
          cancelRecording();
        } else {
          stopRecording();
        }
      }

      // Log performance metrics periodically
      if (enableMetrics && streamManagerRef.current) {
        const metricsInterval = setInterval(() => {
          const report = streamManagerRef.current.getPerformanceReport();
          console.log('Audio Stream Performance:', report);
        }, 5000);
        
        // Store interval for cleanup
        audioWorkletNode.metricsInterval = metricsInterval;
      }

    } catch (error) {
      console.error('Error starting optimized recording:', error);
      isStartingRef.current = false;
      pendingStopRef.current = null;
      
      // Provide user-friendly error messages
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
    if (streamManagerRef.current && isRecording) {
      // Get final performance report
      const finalReport = streamManagerRef.current.getPerformanceReport();
      console.log('Final Audio Stream Performance:', finalReport);
    }
    
    cleanupAudioResources();
    setIsRecording(false);
    setSwipeOffset(0);
    setIsCancelling(false);
    setIsSpeechDetected(false);
    isStartingRef.current = false;
    
    if (onStop) onStop();
  };

  const cancelRecording = () => {
    if (streamManagerRef.current) {
      console.log('Recording cancelled, performance stats:', 
        streamManagerRef.current.getPerformanceReport());
    }
    
    isCancelledRef.current = true;
    cleanupAudioResources();
    setIsRecording(false);
    setSwipeOffset(0);
    setIsCancelling(false);
    setIsSpeechDetected(false);
    isStartingRef.current = false;
    
    if (onCancel) onCancel();
  };

  const handlePointerDown = (e) => {
    if (!isConnected || isStartingRef.current || isRecording) return;
    e.preventDefault();

    if (buttonRef.current) {
      buttonRef.current.setPointerCapture(e.pointerId);
    }

    touchStartXRef.current = e.clientX;
    isCancelledRef.current = false;
    pendingStopRef.current = null;
    setSwipeOffset(0);
    setIsCancelling(false);
    startRecording();
  };

  const handlePointerMove = (e) => {
    if (!isRecording && !isStartingRef.current) return;
    const deltaX = touchStartXRef.current - e.clientX;
    const clampedOffset = Math.max(0, Math.min(deltaX, CANCEL_THRESHOLD + 40));
    setSwipeOffset(clampedOffset);
    setIsCancelling(clampedOffset >= CANCEL_THRESHOLD);
  };

  const handlePointerUp = (e) => {
    if (buttonRef.current) {
      try { buttonRef.current.releasePointerCapture(e.pointerId); } catch {}
    }

    if (isStartingRef.current) {
      pendingStopRef.current = (isCancelling || swipeOffset >= CANCEL_THRESHOLD) ? 'cancel' : 'stop';
      return;
    }
    if (!isRecording) return;

    if (isCancelling || swipeOffset >= CANCEL_THRESHOLD) {
      cancelRecording();
    } else {
      stopRecording();
    }
  };

  const handlePointerCancel = (e) => {
    handlePointerUp(e);
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full select-none">
      <div className="relative flex items-center justify-center w-full">
        {(isRecording || isStartingRef.current) && (
          <div 
            className={`absolute left-4 flex items-center gap-2 transition-opacity duration-200 ${
              isCancelling ? 'opacity-100' : 'opacity-60'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              isCancelling 
                ? 'bg-red-500 text-white scale-110' 
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
            }`}>
              <span className="material-symbols-outlined text-xl">delete</span>
            </div>
            <span className={`text-xs font-medium ${isCancelling ? 'text-red-500' : 'text-slate-400'}`}>
              {'<<'}
            </span>
          </div>
        )}

        {/* Speech detection indicator */}
        {isRecording && isSpeechDetected && (
          <div className="absolute right-4 flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-green-600 dark:text-green-400">正在说话</span>
          </div>
        )}

        <button
          ref={buttonRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          disabled={!isConnected}
          style={{
            transform: isRecording ? `translateX(-${swipeOffset}px)` : 'none',
            touchAction: 'none',
          }}
          className={`relative flex items-center justify-center w-20 h-20 rounded-full font-medium transition-all select-none ${
            isCancelling
              ? 'bg-red-500 shadow-lg shadow-red-500/30 scale-90'
              : isRecording
              ? 'bg-primary shadow-xl shadow-primary/40 scale-110'
              : 'bg-primary shadow-lg shadow-primary/30'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isRecording && !isCancelling && (
            <>
              <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping"></span>
              <span className="absolute inset-[-6px] rounded-full border-2 border-primary/20 animate-pulse"></span>
            </>
          )}
          <span className="material-symbols-outlined text-white text-3xl relative z-10">
            {isCancelling ? 'close' : 'mic'}
          </span>
        </button>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
        {isRecording 
          ? (isCancelling ? '松开取消发送' : isSpeechDetected ? '松开发送，检测到语音' : '松开发送，左滑取消')
          : '按住说话'
        }
      </p>
      
      {/* Performance metrics display */}
      {enableMetrics && streamManagerRef.current && (
        <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
          缓冲区: {Math.round(streamManagerRef.current.getBufferLevel())}ms | 
          码率: {Math.round(streamManagerRef.current.currentBitrate / 1000)}kbps
        </div>
      )}
    </div>
  );
});

export default RealTimeRecorderOptimized;