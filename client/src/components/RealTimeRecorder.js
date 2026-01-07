import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

const RealTimeRecorder = forwardRef(({ onAudioData, isConnected, onStart, onStop }, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const audioContextRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const audioStreamRef = useRef(null);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    startRecording: () => {
      if (!isRecording) startRecording();
    },
    stopRecording: () => {
      if (isRecording) stopRecording();
    }
  }));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        cleanupAudioResources();
      }
    };
  }, [isRecording]);

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
        if (onAudioData) {
            onAudioData(event.data);
        }
      };
      
      source.connect(audioWorkletNode);
      // Keep node alive without outputting to destination (avoid echo)
      // audioWorkletNode.connect(audioContext.destination); 
      
      setIsRecording(true);
      if (onStart) onStart();
      
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('无法启动录音，请检查麦克风权限');
    }
  };

  const stopRecording = () => {
    cleanupAudioResources();
    setIsRecording(false);
    if (onStop) onStop();
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex items-center justify-center p-4">
      <button
        onClick={toggleRecording}
        disabled={!isConnected}
        className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all shadow-lg ${
          isRecording
            ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
            : 'bg-primary hover:bg-primary/90 text-white'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="material-symbols-outlined text-2xl">
          {isRecording ? 'stop_circle' : 'mic'}
        </span>
        <span className="text-lg">{isRecording ? '停止说话' : '点击说话'}</span>
      </button>
    </div>
  );
});

export default RealTimeRecorder;