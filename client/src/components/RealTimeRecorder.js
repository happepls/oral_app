import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

const RealTimeRecorder = ({ onTranscriptionUpdate, onAiResponse, onError, sessionId }) => {
  const { token } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const audioStreamRef = useRef(null);

  const connectWebSocket = useCallback(() => {
    if (!token) {
      console.log('Authentication token not available. WebSocket connection aborted.');
      onError('用户未认证，无法连接');
      return;
    }

    if (!sessionId) {
      console.log('Session ID not available yet. WebSocket connection deferred.');
      return;
    }

    // Close existing connection if any before establishing a new one
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }

    // Use wss for secure connection in production, ws for local dev
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // This will handle remote/local host automatically
    const wsUrl = `${protocol}//${host}/api/ws/?token=${token}&sessionId=${sessionId}`;
    
    console.log(`Attempting to connect to WebSocket at: ${wsUrl}`);
    
    socketRef.current = new WebSocket(wsUrl);

    socketRef.current.onopen = () => {
      console.log('WebSocket connection established.');
      setIsConnected(true);
      onError(null); // Clear previous errors
    };

    socketRef.current.onmessage = (event) => {
      // The message from the AI service can be either a JSON string (for ASR/AI text)
      // or a Blob (for TTS audio).
      if (event.data instanceof Blob) {
        // TODO: Handle incoming TTS audio stream
        console.log('Received binary audio data from server.');
        const audioUrl = URL.createObjectURL(event.data);
        const audio = new Audio(audioUrl);
        audio.play();
      } else {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'info') {
             console.log('Info from server:', data.message);
          } else if (data.type === 'transcription') {
            onTranscriptionUpdate(data.text);
          } else if (data.type === 'ai_response') {
            onAiResponse(data.text);
          }
        } catch (error) {
          console.error('Failed to parse incoming message:', event.data, error);
        }
      }
    };

    socketRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      onError('WebSocket连接出错');
      setIsConnected(false);
    };

    socketRef.current.onclose = (event) => {
      console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
      setIsConnected(false);
      // Optional: implement reconnection logic here
    };

  }, [token, sessionId, onTranscriptionUpdate, onAiResponse, onError]);
  
  // Effect to establish WebSocket connection when sessionId becomes available
  useEffect(() => {
    if (sessionId) {
      connectWebSocket();
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (isRecording) {
        stopRecording();
      }
    };
  }, [sessionId, connectWebSocket, isRecording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      
      // Create audio worklet for real-time audio processing
      await audioContext.audioWorklet.addModule('/audio-processor.js');
      const audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      audioWorkletNodeRef.current = audioWorkletNode;
      
      audioWorkletNode.port.onmessage = (event) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          // Send audio data to WebSocket
          socketRef.current.send(event.data);
        }
      };
      
      source.connect(audioWorkletNode);
      audioWorkletNode.connect(audioContext.destination);
      
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      onError('无法启动录音，请检查麦克风权限');
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