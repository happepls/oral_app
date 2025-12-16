import React, { useState, useRef, useEffect } from 'react';

const RealTimeRecorder = ({ onAudioData, isConnected }) => {
  const [isRecording, setIsRecording] = useState(false);
  const audioContextRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const audioStreamRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording();
      }
    };
  }, [isRecording]);

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
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      // Load the audio processor worklet
      await audioContext.audioWorklet.addModule('/recorder-processor.js');
      
      const source = audioContext.createMediaStreamSource(stream);
      const audioWorkletNode = new AudioWorkletNode(audioContext, 'recorder-processor');
      audioWorkletNodeRef.current = audioWorkletNode;
      
      audioWorkletNode.port.onmessage = (event) => {
        // Send audio data to parent component
        if (onAudioData && isRecording) {
            onAudioData(event.data);
        }
      };
      
      source.connect(audioWorkletNode);
      // Connect to destination to prevent garbage collection, 
      // but if we don't want self-monitoring, we might not need to connect to destination 
      // OR we connect to a mute gain node. 
      // However, usually AudioWorklet needs to be connected to graph output or be referenced to run.
      // Connecting to destination might cause feedback loop if not careful.
      // Let's NOT connect to destination (speakers) to avoid echo.
      // But we need to keep the node alive. Connecting it to a GainNode with 0 gain is safer.
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      audioWorkletNode.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('无法启动录音，请检查麦克风权限');
    }
  };

  const stopRecording = () => {
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
    
    setIsRecording(false);
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
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
          isRecording
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-primary hover:bg-primary-dark text-white'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="material-symbols-outlined">
          {isRecording ? 'stop' : 'mic'}
        </span>
        {isRecording ? '停止录音' : '开始录音'}
      </button>
      {!isConnected && (
        <p className="ml-2 text-sm text-gray-500">连接中...</p>
      )}
    </div>
  );
};

export default RealTimeRecorder;