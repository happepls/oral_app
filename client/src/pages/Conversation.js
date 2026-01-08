import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { conversationAPI } from '../services/api';
import RealTimeRecorder from '../components/RealTimeRecorder';
import { useAuth } from '../contexts/AuthContext';

function Conversation() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  
  // UI States
  const [messages, setMessages] = useState([
    {
      type: 'system',
      content: '正在连接AI导师...'
    }
  ]);
  const [isConnected, setIsConnected] = useState(false);
  const [currentRole, setCurrentRole] = useState('OralTutor'); // Default role
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [webSocketError, setWebSocketError] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  
  // Refs
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioContextRef = useRef(null);
  const nextStartTimeRef = useRef(0);
  const audioQueueRef = useRef([]); // To track scheduled audio nodes for interruption
  const isInterruptedRef = useRef(false);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Audio Playback Engine ---
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const playAudioChunk = useCallback(async (audioData) => {
    if (isInterruptedRef.current) return; // Drop audio if interrupted

    initAudioContext();
    const ctx = audioContextRef.current;

    try {
        // Decode raw PCM or Opus if browser supports it. 
        // Note: The backend sends raw binary. If it's WAV/MP3 wrapped, decodeAudioData works.
        // If it's raw PCM Int16, we need manual conversion. 
        // Based on test_client, it receives binary. 
        // Let's assume the backend sends a format decodeAudioData can handle (like WAV header added or Opus)
        // OR we are receiving raw PCM. 
        // The backend `ai-omni-service` sends what it gets from DashScope. DashScope sends MP3 or PCM.
        // `test_client` uses PyAudio to play raw PCM Int16 @ 24kHz.
        // Browser decodeAudioData MIGHT fail on raw PCM without header.
        // We might need to wrap it in a WAV container or write a PCM player.
        // For now, let's try decodeAudioData. If it fails, we fall back to PCM buffer creation.
        
        // Actually, DashScope usually sends mp3 or pcm. If PCM, we need to create buffer manually.
        // Let's assume it's PCM Int16 24kHz (Monophonic) as per `test_client_scenario.py` output rate.
        
        const arrayBuffer = await audioData.arrayBuffer();
        
        // Attempt decode (works if MP3/WAV)
        // If raw PCM, this will fail.
        let audioBuffer;
        try {
            // Clone the buffer because decodeAudioData detaches it
            const decodeBuffer = arrayBuffer.slice(0);
            audioBuffer = await ctx.decodeAudioData(decodeBuffer);
        } catch (e) {
            // Fallback: Assume Raw PCM Int16 24kHz Mono
            const int16Array = new Int16Array(arrayBuffer);
            const float32Array = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
                float32Array[i] = int16Array[i] / 32768.0;
            }
            audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
            audioBuffer.getChannelData(0).set(float32Array);
        }

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => {
             // Cleanup if needed
        };

        const currentTime = ctx.currentTime;
        const start = Math.max(currentTime, nextStartTimeRef.current);
        
        source.start(start);
        nextStartTimeRef.current = start + audioBuffer.duration;
        
        // Track source for cancellation
        audioQueueRef.current.push(source);
        
        setIsAISpeaking(true);

    } catch (error) {
      console.error('Audio playback error:', error);
    }
  }, []);

  const stopAudioPlayback = () => {
    // Cancel all scheduled audio
    audioQueueRef.current.forEach(source => {
        try {
            source.stop();
        } catch {}
    });
    audioQueueRef.current = [];
    if (audioContextRef.current) {
        nextStartTimeRef.current = audioContextRef.current.currentTime;
    }
    setIsAISpeaking(false);
  };

  // --- WebSocket Logic ---
  const connectWebSocket = useCallback(() => {
    if (!token || !sessionId) return;

    // Close existing if any
    if (socketRef.current) {
        socketRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/ws/?token=${token}&sessionId=${sessionId}`;

    socketRef.current = new WebSocket(wsUrl);

    socketRef.current.onopen = () => {
      console.log('WS Open');
      setIsConnected(true);
      setMessages(prev => [{ type: 'system', content: '连接成功！请按住麦克风开始说话。' }]);
      setWebSocketError(null);
    };

    socketRef.current.onmessage = (event) => {
      if (event.data instanceof Blob) {
        playAudioChunk(event.data);
      } else {
        try {
          const data = JSON.parse(event.data);
          
          if (isInterruptedRef.current && data.type !== 'role_switch') {
             // If interrupted, ignore incoming text/audio until we reset (usually on next user input start)
             // But actually, we reset interruption flag when user starts recording. 
             // So here we might still be receiving delayed packets from previous turn.
             return; 
          }

          switch (data.type) {
            case 'text_response':
            case 'ai_response':
              const content = data.payload || data.text;
              if (content) {
                  // If it's the same turn, append? For now, simplistic "last message" update or new message
                  // React state update to stream text? 
                  // Simplification: Just add new message bubble or update last AI bubble.
                  setMessages(prev => {
                      const last = prev[prev.length - 1];
                      if (last && last.type === 'ai' && !last.isFinal) {
                          return [...prev.slice(0, -1), { ...last, content: last.content + content }];
                      }
                      return [...prev, { type: 'ai', content: content, speaker: currentRole, isFinal: false }];
                  });
              }
              break;
            case 'response.audio.done':
              setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last && last.type === 'ai') {
                      return [...prev.slice(0, -1), { ...last, isFinal: true }];
                  }
                  return prev;
              });
              setIsAISpeaking(false);
              break;
            case 'transcription':
               // User transcription
               setMessages(prev => [...prev, { type: 'user', content: data.text }]);
               break;
            case 'role_switch':
               setCurrentRole(data.payload.role);
               setMessages(prev => [...prev, { type: 'system', content: `当前角色切换为: ${data.payload.role}` }]);
               break;
            case 'error':
               console.error('Server Error:', data.payload);
               break;
            default:
               break;
          }
        } catch (e) {
          console.error(e);
        }
      }
    };

    socketRef.current.onerror = () => {
        setWebSocketError('连接异常');
        setIsConnected(false);
    };

    socketRef.current.onclose = () => {
        setIsConnected(false);
    };

  }, [token, sessionId, playAudioChunk, currentRole]);

  // Init Session
  useEffect(() => {
    const init = async () => {
      if (!user?.id) return;
      try {
        const res = await conversationAPI.startSession({ userId: user.id });
        if (res && res.sessionId) {
            setSessionId(res.sessionId);
        } else {
            setWebSocketError('无法创建会话');
        }
      } catch {
        setWebSocketError('网络错误');
      }
    };
    init();
  }, [user]);

  // Connect WS when SessionId ready
  useEffect(() => {
    if (sessionId) {
        connectWebSocket();
    }
    return () => {
        socketRef.current?.close();
        stopAudioPlayback();
        if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [sessionId, connectWebSocket]);


  // --- Recorder Callbacks ---
  
  const handleRecordingStart = () => {
    isInterruptedRef.current = false; // Reset flag for new turn
    
    // Check if we need to interrupt backend streaming
    const wasBackendStreaming = isAISpeaking;
    
    // Always stop local audio playback immediately
    stopAudioPlayback();
    
    // If backend was streaming, send interruption signal
    if (wasBackendStreaming) {
        console.log('Interruption triggered (Backend Streaming)!');
        isInterruptedRef.current = true;
        
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: 'user_interruption' }));
        }
    } else {
        console.log('Recording started (New Turn)');
    }
  };

  const handleRecordingStop = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
        console.log('Sending user_audio_ended');
        socketRef.current.send(JSON.stringify({ type: 'user_audio_ended' }));
    }
    // Allow AI to speak again after user is done
    isInterruptedRef.current = false;
  };

  const handleAudioData = (data) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(data);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-background-light dark:bg-background-dark">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur shrink-0 z-10">
        <button 
          onClick={() => navigate('/discovery')}
          className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
          <span className="material-symbols-outlined">close</span>
        </button>
        <div className="flex flex-col items-center">
          <h1 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">school</span>
            {currentRole === 'OralTutor' ? 'AI 导师' : currentRole}
          </h1>
          <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${isConnected ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
            {isConnected ? '在线' : '连接中...'}
          </span>
        </div>
        <button className="p-2 text-gray-600 dark:text-gray-400 opacity-0 pointer-events-none">
           <span className="material-symbols-outlined">settings</span>
        </button>
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
        {messages.map((msg, index) => {
          if (msg.type === 'system') {
              return (
                <div key={index} className="flex justify-center my-4">
                  <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full shadow-sm">
                    {msg.content}
                  </span>
                </div>
              );
          }
          
          const isAI = msg.type === 'ai';
          return (
            <div key={index} className={`flex items-start gap-3 ${isAI ? '' : 'flex-row-reverse'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isAI ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                <span className="material-symbols-outlined text-sm">{isAI ? 'smart_toy' : 'person'}</span>
              </div>
              <div className={`flex flex-col max-w-[80%] p-3.5 rounded-2xl shadow-sm ${
                  isAI 
                  ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none border border-slate-100 dark:border-slate-700' 
                  : 'bg-primary text-white rounded-tr-none'
              }`}>
                 <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </div>
          );
        })}
        {isAISpeaking && (
            <div className="flex items-center gap-2 text-slate-400 text-sm ml-12">
                <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce delay-100"></span>
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce delay-200"></span>
                </span>
                AI正在说话... (点击麦克风打断)
            </div>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </main>

      {/* Footer / Controls */}
      <footer className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col items-center gap-4">
            <RealTimeRecorder 
              onAudioData={handleAudioData}
              isConnected={isConnected}
              onStart={handleRecordingStart}
              onStop={handleRecordingStop}
            />
            {webSocketError && (
                <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded-full animate-pulse">
                    {webSocketError}
                </p>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center max-w-xs">
               提示：{isAISpeaking ? 'AI说话时点击按钮可直接打断' : '点击按钮开始说话，再次点击发送'}
            </p>
        </div>
      </footer>
    </div>
  );
}

export default Conversation;