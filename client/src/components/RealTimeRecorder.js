import React, { useState, useRef, useEffect } from 'react';

const RealTimeRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Click Start to begin recording.');
  const [duration, setDuration] = useState(0);
  const [transcribedText, setTranscribedText] = useState(''); // For real-time ASR
  const [conversationHistory, setConversationHistory] = useState([]); // For user and AI messages

  // Refs for audio resources
  const audioContextRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const streamRef = useRef(null);
  const sourceNodeRef = useRef(null);
  
  // Ref for WebSocket
  const webSocketRef = useRef(null);
  
  // Refs for audio playback queue
  const audioQueueRef = useRef([]);
  const isPlayingAudioRef = useRef(false);

  // Ref to track recording state in closures
  const isRecordingRef = useRef(false);

  // --- Helper function to create a WAV header ---
  const createWavHeader = (dataLength, sampleRate, channels, bitsPerSample) => {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    const blockAlign = (channels * bitsPerSample) / 8;
    const byteRate = sampleRate * blockAlign;
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    return buffer;
  };

  // Keep the ref in sync with the state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // --- Audio Playback Logic ---
  const playNextInQueue = async () => {
    if (isPlayingAudioRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    isPlayingAudioRef.current = true;
    const audioBlob = audioQueueRef.current.shift();

    try {
      const pcmData = await audioBlob.arrayBuffer();
      if (pcmData.byteLength === 0) {
        isPlayingAudioRef.current = false;
        playNextInQueue();
        return;
      }
      
      // Azure TTS for this voice sends 24kHz, 16-bit, mono PCM
      const header = createWavHeader(pcmData.byteLength, 24000, 1, 16);
      const wavBlob = new Blob([header, pcmData], { type: 'audio/wav' });
      const wavArrayBuffer = await wavBlob.arrayBuffer();

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      const audioBuffer = await audioContextRef.current.decodeAudioData(wavArrayBuffer);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();

      source.onended = () => {
        isPlayingAudioRef.current = false;
        playNextInQueue();
      };
    } catch (error) {
      console.error('Error playing audio:', error);
      isPlayingAudioRef.current = false;
      playNextInQueue();
    }
  };
  // --- End of Audio Playback Logic ---


  const startRecording = async () => {
    console.log('--- startRecording called ---');
    try {
      setDuration(0);
      setTranscribedText('');
      setConversationHistory([]);
      audioQueueRef.current = []; // Clear audio queue
      isPlayingAudioRef.current = false;

      setStatus('Requesting microphone permission...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      setStatus('Microphone access granted. Initializing AudioContext...');
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;

      setStatus('Connecting to WebSocket...');
      console.log('Attempting to connect WebSocket...');
      
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No token found in localStorage.');
        setStatus('Authentication error: You must be logged in to start a session.');
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
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
        setStatus('WebSocket connected. Loading audio processor...');
        initializeAudioWorklet();
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          console.log(`Received Blob data of size ${event.data.size}.`);
          audioQueueRef.current.push(event.data);
          playNextInQueue();
          return;
        }

        // --- ADDED FOR DEBUGGING ---
        console.log('[WebSocket] Received non-binary message:', event.data);
        // --- END DEBUGGING ---

        try {
          const message = JSON.parse(event.data);
          if (message.type === 'info') {
            console.log(`[INFO] ${message.message}`);
          } else if (message.type === 'asr_result') {
            if (message.isFinal) {
              setConversationHistory(prev => [...prev, { speaker: 'user', text: message.text }]);
              setTranscribedText('');
            } else {
              setTranscribedText(message.text);
            }
          } 
        } catch (error) {
          console.error('Error parsing WebSocket message:', error, event.data);
        }
      };

      ws.onclose = (event) => {
        console.log(`WebSocket [onclose] event fired. Code: ${event.code}, Reason: ${event.reason}`);
        let reason = event.reason || `error code ${event.code}`;
        setStatus(`WebSocket disconnected: ${reason}`);
        if (isRecordingRef.current) {
          stopRecording(false); // Clean up audio resources if connection drops
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket [onerror] event fired:', error);
        setStatus('WebSocket error. See console for details.');
      };

      const initializeAudioWorklet = async () => {
        console.log('--- initializeAudioWorklet called ---');
        // Resume AudioContext if it's suspended (required by modern browsers)
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        await audioContext.audioWorklet.addModule('/audio-processor.js');
        setStatus('Audio processor loaded. Creating worklet node...');
        const audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
        audioWorkletNodeRef.current = audioWorkletNode;

        const source = audioContext.createMediaStreamSource(stream);
        sourceNodeRef.current = source;
        
        // We don't connect the recording path to the destination (speakers)
        // to avoid local feedback.
        source.connect(audioWorkletNode);
        audioWorkletNode.connect(audioContext.destination); // This should be a GainNode with 0 gain if we want to be strict
        
        // Let's fix the above to prevent any feedback possibility
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        source.connect(audioWorkletNode);
        audioWorkletNode.connect(gainNode);
        gainNode.connect(audioContext.destination);


        audioWorkletNode.port.onmessage = (event) => {
          const { type, payload } = event.data;
          if (type === 'data') {
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
      stopRecording(true); // Ensure cleanup on error
    }
  };

  const stopRecording = (closeWebSocket = true) => {
    console.log(`--- stopRecording called (closeWebSocket: ${closeWebSocket}) ---`);
    if (isRecordingRef.current === false && audioContextRef.current === null) {
      console.log('stopRecording: Already stopped.');
      return;
    }

    setStatus('Stopping...');
    
    if (closeWebSocket && webSocketRef.current) {
      if (webSocketRef.current.readyState === WebSocket.OPEN) {
        console.log('Closing WebSocket.');
        webSocketRef.current.close(1000, 'User stopped recording');
      }
      webSocketRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
      console.log('MediaStreamSourceNode disconnected.');
    }

    if (audioWorkletNodeRef.current) {
      // Send a stop message to the worklet to flush any remaining audio and terminate.
      audioWorkletNodeRef.current.port.postMessage('stop');
      audioWorkletNodeRef.current.port.onmessage = null; // Clean up the event listener
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      console.log('Media stream tracks stopped.');
    }

    const audioContext = audioContextRef.current;
    if (audioContext && audioContext.state !== 'closed') {
      console.log('Closing AudioContext.');
      audioContext.close().then(() => {
        console.log('AudioContext closed.');
        audioContextRef.current = null;
      });
    }
    
    setIsRecording(false);
    setStatus('Recording stopped. Click Start to begin again.');
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <h2 style={{ textAlign: 'center', color: '#333' }}>Real-time Audio Recorder</h2>
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
        <p><strong>Status:</strong> {status}</p>
        <p><strong>Duration:</strong> {duration.toFixed(2)} seconds</p>
        <button 
          onClick={handleToggleRecording}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: isRecording ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            width: '100%'
          }}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>
      </div>

      {transcribedText && (
        <div style={{ marginBottom: '15px', padding: '10px', borderLeft: '4px solid #007bff', backgroundColor: '#e7f3ff' }}>
          <p><strong>You (Recognizing):</strong> {transcribedText}</p>
        </div>
      )}

      <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '15px', maxHeight: '400px', overflowY: 'auto', backgroundColor: '#fff' }}>
        <h3 style={{ marginTop: '0', color: '#555' }}>Conversation History</h3>
        {conversationHistory.length === 0 ? (
          <p style={{ color: '#888' }}>No conversation yet. Start speaking!</p>
        ) : (
          conversationHistory.map((msg, index) => (
            <div key={index} style={{
              marginBottom: '10px',
              padding: '8px 12px',
              borderRadius: '5px',
              backgroundColor: msg.speaker === 'user' ? '#e6f7ff' : '#f0f0f0',
              textAlign: msg.speaker === 'user' ? 'right' : 'left',
              border: `1px solid ${msg.speaker === 'user' ? '#91d5ff' : '#d9d9d9'}`
            }}>
              <p style={{ margin: '0', fontWeight: 'bold', color: msg.speaker === 'user' ? '#1890ff' : '#595959' }}>
                {msg.speaker === 'user' ? 'You:' : 'AI:'}
              </p>
              <p style={{ margin: '0', whiteSpace: 'pre-wrap' }}>{msg.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RealTimeRecorder;
