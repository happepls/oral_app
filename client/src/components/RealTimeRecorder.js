import React, { useState, useRef } from 'react';

const RealTimeRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Click Start to begin recording.');
  const [duration, setDuration] = useState(0);
  const audioContextRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const webSocketRef = useRef(null);

  const startRecording = async () => {
    console.log('--- startRecording called ---');
    try {
      setDuration(0);
      setStatus('Requesting microphone permission...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setStatus('Microphone access granted. Initializing AudioContext...');
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      setStatus('Connecting to WebSocket...');
      console.log('Attempting to connect WebSocket...');
      
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No token found in localStorage.');
        setStatus('Authentication error: You must be logged in to start a session.');
        if (audioContextRef.current) audioContextRef.current.close();
        return; 
      }
      
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/ws/?token=${token}`;
      console.log(`Connecting to: ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);
      webSocketRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket [onopen] event fired.');
        setStatus('WebSocket connected and authenticated. Loading audio processor...');
        initializeAudioWorklet();
      };

      ws.onmessage = async (event) => {
        console.log('[WebSocket] Message received:', event.data);
        // We expect the echo server to send back a Blob or ArrayBuffer.
        // We need to decode this raw PCM data to an AudioBuffer to play it.
        // NOTE: This simple playback logic is for demonstration. A real implementation
        // would need a more sophisticated streaming audio player.
        if (event.data instanceof Blob) {
            const arrayBuffer = await event.data.arrayBuffer();
            // Assuming the backend sends raw Float32 PCM data, which decodeAudioData cannot handle directly.
            // For a simple echo, we'll just log it. A proper implementation needs a custom player.
            // For now, we can't play it back easily without knowing the exact format.
            // Let's confirm we receive it first.
        }
      };

      ws.onclose = (event) => {
        console.log(`WebSocket [onclose] event fired. Code: ${event.code}, Reason: ${event.reason}`);
        let reason = event.reason;
        if (!reason && event.code === 1006) {
          reason = "Connection closed abnormally. This is expected if authentication fails. Check comms-service logs.";
        }
        setStatus(`WebSocket disconnected: ${reason} (${event.code})`);
        // The isRecording state might be stale here in the closure.
        // We call stopRecording regardless to ensure cleanup.
        stopRecording(false);
      };

      ws.onerror = (error) => {
        console.error('WebSocket [onerror] event fired:', error);
        setStatus('WebSocket error. See console for details.');
      };

      const initializeAudioWorklet = async () => {
        console.log('--- initializeAudioWorklet called ---');
        await audioContext.audioWorklet.addModule('/audio-processor.js');
        setStatus('Audio processor loaded. Creating worklet node...');
        const audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
        audioWorkletNodeRef.current = audioWorkletNode;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(audioWorkletNode);
        // DO NOT connect the worklet to the destination. We only want to hear the echo from the server.
        // audioWorkletNode.connect(audioContext.destination);

        audioWorkletNode.port.onmessage = (event) => {
          const { type, payload } = event.data;
          if (type === 'data') {
            // Forward the PCM data to the backend via WebSocket
            if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
              webSocketRef.current.send(payload);
            }
          } else if (type === 'duration') {
            setDuration(payload);
          }
        };

        audioWorkletNode.port.postMessage('init');
        console.log('Setting isRecording to true.');
        setIsRecording(true);
        setStatus('Recording...');
      };

    } catch (error) {
      console.error('Error in startRecording:', error);
      setStatus(`Error: ${error.message}`);
    }
  };

  const stopRecording = (closeWebSocket = true) => {
    console.log(`--- stopRecording called (closeWebSocket: ${closeWebSocket}) ---`);
    if (closeWebSocket && webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      console.log('Closing WebSocket from stopRecording.');
      webSocketRef.current.close(1000, 'User stopped recording');
    }

    // Idempotency fix: grab the context and immediately nullify the ref.
    const audioContext = audioContextRef.current;
    if (audioContext && audioContext.state !== 'closed') {
      audioContextRef.current = null; // Prevent re-entry
      console.log('Closing AudioContext.');
      audioContext.close().then(() => {
        console.log('AudioContext closed.');
        setIsRecording(false);
        setStatus('Recording stopped. Click Start to begin again.');
      });
    } else {
      console.log('AudioContext already closed or not initialized. Updating state.');
      // This branch might be taken by the second call in the race condition.
      // Ensure the final state is always correct.
      setIsRecording(false);
      setStatus('Recording stopped. Click Start to begin again.');
    }
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div>
      <h2>Real-time Audio Recorder</h2>
      <p>Status: {status}</p>
      <p>Duration: {duration.toFixed(2)} seconds</p>
      <button onClick={handleToggleRecording}>
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>
    </div>
  );
};

export default RealTimeRecorder;
