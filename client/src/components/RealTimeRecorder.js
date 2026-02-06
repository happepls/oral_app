import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

const CANCEL_THRESHOLD = 80;

const RealTimeRecorder = forwardRef(({ onAudioData, isConnected, onStart, onStop, onCancel }, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const audioContextRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const audioStreamRef = useRef(null);
  const touchStartXRef = useRef(0);
  const isCancelledRef = useRef(false);
  const isStartingRef = useRef(false);
  const pendingStopRef = useRef(null);
  const buttonRef = useRef(null);

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
  };

  const startRecording = async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        }
      });
      audioStreamRef.current = stream;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      await audioContext.audioWorklet.addModule('/recorder-processor.js');

      const source = audioContext.createMediaStreamSource(stream);
      const audioWorkletNode = new AudioWorkletNode(audioContext, 'recorder-processor');
      audioWorkletNodeRef.current = audioWorkletNode;

      audioWorkletNode.port.onmessage = (event) => {
        if (onAudioData && !isCancelledRef.current) {
          onAudioData(event.data);
        }
      };

      source.connect(audioWorkletNode);

      isCancelledRef.current = false;
      setIsRecording(true);
      isStartingRef.current = false;
      if (onStart) onStart();

      if (pendingStopRef.current) {
        const action = pendingStopRef.current;
        pendingStopRef.current = null;
        if (action === 'cancel') {
          cancelRecording();
        } else {
          stopRecording();
        }
      }

    } catch (error) {
      console.error('Error starting recording:', error);
      isStartingRef.current = false;
      pendingStopRef.current = null;
    }
  };

  const stopRecording = () => {
    cleanupAudioResources();
    setIsRecording(false);
    setSwipeOffset(0);
    setIsCancelling(false);
    isStartingRef.current = false;
    if (!isCancelledRef.current) {
      if (onStop) onStop();
    }
  };

  const cancelRecording = () => {
    isCancelledRef.current = true;
    cleanupAudioResources();
    setIsRecording(false);
    setSwipeOffset(0);
    setIsCancelling(false);
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
          ? (isCancelling ? '松开取消发送' : '松开发送，左滑取消')
          : '按住说话'
        }
      </p>
    </div>
  );
});

export default RealTimeRecorder;
