import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { conversationAPI, aiAPI } from '../services/api';
import RealTimeRecorder from '../components/RealTimeRecorder';
import { useAuth } from '../contexts/AuthContext';
import AudioBar from '../components/AudioBar'; // Import the new AudioBar component

function Conversation() {
  const navigate = useNavigate();
  const { user, token, loading } = useAuth(); // Added loading state
  
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
  const [selection, setSelection] = useState({ text: '', x: 0, y: 0, visible: false });
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  
  // Refs
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioContextRef = useRef(null);
  const nextStartTimeRef = useRef(0);
  const audioQueueRef = useRef([]); // To track scheduled audio nodes for interruption
  const isInterruptedRef = useRef(false);
  const currentAudioRef = useRef(null); // Track active full audio playback
  const currentRoleRef = useRef(currentRole);
  const currentUserMessageIdRef = useRef(null); // Track current user message ID

  // Auth Check
  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  // Sync currentRoleRef with state
  useEffect(() => {
    currentRoleRef.current = currentRole;
  }, [currentRole]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Text Selection Handling ---
  const handleTextSelection = useCallback((e) => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
      const range = window.getSelection().getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelection({
        text: selectedText,
        x: rect.left + rect.width / 2,
        y: rect.top - 40,
        visible: true
      });
    } else {
      setSelection(prev => ({ ...prev, visible: false }));
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => document.removeEventListener('mouseup', handleTextSelection);
  }, [handleTextSelection]);

  const playSelectedText = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selection.text || isSynthesizing) return;

    try {
      setIsSynthesizing(true);
      const audioBlob = await aiAPI.tts(selection.text);
      // Temporarily bypass interruption for manual replay
      const originalInterrupted = isInterruptedRef.current;
      isInterruptedRef.current = false;
      await playAudioChunk(audioBlob);
      isInterruptedRef.current = originalInterrupted;
      
      setSelection(prev => ({ ...prev, visible: false }));
    } catch (err) {
      console.error('TTS Playback failed:', err);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const playFullAudio = (url) => {
      if (!url) return;
      
      // Stop previous playback if any
      if (currentAudioRef.current) {
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
      }

      const audio = new Audio(url);
      currentAudioRef.current = audio;
      
      audio.play().catch(e => console.error("Playback failed", e));
      
      // Cleanup ref when ended
      audio.onended = () => {
          if (currentAudioRef.current === audio) {
              currentAudioRef.current = null;
          }
      };
  };

  // --- Audio Playback Engine ---
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const stopAudioPlayback = () => {
    // Stop Web Audio API sources (Real-time TTS)
    audioQueueRef.current.forEach(source => {
        try {
            source.stop();
        } catch {}
    });
    audioQueueRef.current = [];
    if (audioContextRef.current) {
        nextStartTimeRef.current = audioContextRef.current.currentTime;
    }
    
    // Stop Full Audio Playback (MP3 URL)
    if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
    }
    
    setIsAISpeaking(false);
  };

  // --- Message Handler ---
  const handleJsonMessage = useCallback((data) => {
      if (isInterruptedRef.current && data.type !== 'role_switch') {
         return; 
      }

      switch (data.type) {
        case 'text_response':
        case 'ai_response':
          const content = data.payload || data.text;
          if (content) {
              setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last && last.type === 'ai' && !last.isFinal) {
                      return [...prev.slice(0, -1), { ...last, content: last.content + content }];
                  }
                  return [...prev, { type: 'ai', content: content, speaker: currentRoleRef.current, isFinal: false }];
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
           console.log('Transcription Event:', data);
           // User transcription
           setMessages(prev => {
               const last = prev[prev.length - 1];
               const currentId = currentUserMessageIdRef.current;
               
               // STRICT CHECK: Update ONLY if the last message matches the current turn ID
               if (last && last.type === 'user' && last.id === currentId && !last.isFinal) {
                   return [
                       ...prev.slice(0, -1), 
                       { 
                           ...last, 
                           content: data.isFinal ? data.text : last.content + data.text,
                           isFinal: !!data.isFinal 
                       }
                   ];
               }
               
               // Otherwise, append a NEW message for this turn
               // This prevents overwriting previous turns if they weren't finalized correctly
               return [...prev, { 
                   type: 'user', 
                   content: data.text, 
                   isFinal: !!data.isFinal,
                   id: currentId // Bind this message to the current turn
               }];
           });
           break;
        case 'audio_url':
           const { url, role } = data.payload;
           if (role === 'assistant') {
               setMessages(prev => {
                   const newMessages = [...prev];
                   // Attach URL to the last AI message THAT DOES NOT HAVE A URL YET
                   // This prevents overwriting a newer message's URL (or absence thereof) with an older message's URL
                   for (let i = newMessages.length - 1; i >= 0; i--) {
                       if (newMessages[i].type === 'ai' && !newMessages[i].audioUrl) {
                           newMessages[i] = { ...newMessages[i], audioUrl: url };
                           break;
                       }
                   }
                   return newMessages;
               });
           } else if (role === 'user') {
               setMessages(prev => {
                   const newMessages = [...prev];
                   const currentId = currentUserMessageIdRef.current;
                   // Attach URL ONLY to the message with the matching ID
                   for (let i = newMessages.length - 1; i >= 0; i--) {
                       if (newMessages[i].type === 'user' && newMessages[i].id === currentId) {
                           newMessages[i] = { ...newMessages[i], audioUrl: url };
                           break;
                       }
                   }
                   return newMessages;
               });
           }
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
  }, []); // Removed currentRole dependency

  const playAudioChunk = useCallback(async (audioData) => {
    if (isInterruptedRef.current) return; // Drop audio if interrupted

    initAudioContext();
    const ctx = audioContextRef.current;
    
    // console.log('Playing Audio Chunk, size:', audioData.size);

    try {
        const arrayBuffer = await audioData.arrayBuffer();
        
        let audioBuffer;
        try {
            const decodeBuffer = arrayBuffer.slice(0);
            audioBuffer = await ctx.decodeAudioData(decodeBuffer);
        } catch (e) {
            // Check if it's actually JSON sent as binary
            try {
                const text = await audioData.text();
                const json = JSON.parse(text);
                console.log('Recovered JSON from Binary:', json);
                handleJsonMessage(json);
                return;
            } catch (jsonErr) {
                // Not JSON, continue with PCM fallback
            }

            // Only warn, don't crash or error out loudly
            // console.warn('decodeAudioData failed, trying PCM fallback'); 
            
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
      console.error('Audio playback error (Chunk):', error);
    }
  }, [handleJsonMessage]);

  // --- WebSocket Logic ---
  const connectWebSocket = useCallback(() => {
    if (!token || !sessionId) return;

    // Close existing if any
    if (socketRef.current) {
        socketRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Connect directly to API Gateway (Nginx) on port 8080 to bypass frontend proxy issues
    const host = `${window.location.hostname}:8080`;
    const wsUrl = `${protocol}//${host}/api/ws/?token=${token}&sessionId=${sessionId}`;

    socketRef.current = new WebSocket(wsUrl);

    socketRef.current.onopen = () => {
      console.log('WS Open');
      setIsConnected(true);
      setMessages(prev => [...prev, { type: 'system', content: '连接成功！请按住麦克风开始说话。' }]);
      setWebSocketError(null);
    };

    socketRef.current.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        // Check if the blob is actually JSON data by reading its content
        try {
          const text = await event.data.text();
          const parsed = JSON.parse(text);
          // If it's valid JSON, handle it as a message
          handleJsonMessage(parsed);
        } catch (e) {
          // If not JSON, treat as audio blob
          // console.log('Received Audio Blob size:', event.data.size);
          playAudioChunk(event.data);
        }
      } else {
        try {
          const data = JSON.parse(event.data);
          handleJsonMessage(data);
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

  }, [token, sessionId, playAudioChunk, handleJsonMessage]);

  // Init Session
  useEffect(() => {
    const init = async () => {
      if (!user?.id || !token) return; // Wait for full auth
      
      // Check URL for sessionId (e.g., ?sessionId=...)
      const searchParams = new URLSearchParams(window.location.search);
      const urlSessionId = searchParams.get('sessionId') || searchParams.get('session'); // Support both

      if (urlSessionId) {
          console.log('Restoring session:', urlSessionId);
          setSessionId(urlSessionId);
          
          try {
              // Fetch History
              const historyRes = await conversationAPI.getHistory(urlSessionId);
              // handleResponse returns `data.data` (the conversation object)
              if (historyRes && historyRes.messages) {
                  const restoredMessages = historyRes.messages.map(m => ({
                      type: m.role === 'user' ? 'user' : 'ai',
                      content: m.content,
                      isFinal: true, // History is always final
                      audioUrl: m.audioUrl || null,
                      speaker: m.role === 'user' ? 'Me' : 'OralTutor' // Basic mapping
                  }));
                  
                  // Prepend system message, then history
                  // setMessages([
                  //     { type: 'system', content: '正在恢复历史会话...' },
                  //     ...restoredMessages
                  // ]);
                  
                  // Just show history. If empty, show welcome.
                  if (restoredMessages.length > 0) {
                      setMessages(restoredMessages);
                  } else {
                      // Keep or set default system message
                      setMessages([{ type: 'system', content: '新会话开始，请点击麦克风说话。' }]);
                  }
              }
          } catch (err) {
              console.error('Failed to restore history:', err);
              setWebSocketError('无法加载历史记录');
          }
      } else {
          // Start New Session
          try {
            // Fetch Active Goal ID first
            let goalId = 'general';
            try {
                // We assume userAPI is available (imported)
                const goalRes = await import('../services/api').then(m => m.userAPI.getActiveGoal());
                if (goalRes && goalRes.goal) {
                     goalId = goalRes.goal.id || goalRes.goal._id;
                }
            } catch (e) {
                console.warn('Failed to fetch active goal for session start:', e);
            }

            const res = await conversationAPI.startSession({ 
                userId: user.id,
                goalId: goalId,
                forceNew: true 
            });

            if (res && res.sessionId) {
                setSessionId(res.sessionId);
                // DO NOT update URL history for new sessions initiated from root.
                // This ensures refreshing /conversation always starts a FRESH session.
                // const newParams = new URLSearchParams(window.location.search);
                // newParams.set('sessionId', res.sessionId);
                // const newUrl = `${window.location.pathname}?${newParams.toString()}`;
                // window.history.replaceState({ path: newUrl }, '', newUrl);
            } else {
                setWebSocketError('无法创建会话');
            }
          } catch {
            setWebSocketError('网络错误');
          }
      }
    };
    init();
  }, [user, token]); // Added token dependency

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
    const newId = Date.now().toString();
    currentUserMessageIdRef.current = newId; // New turn ID
    
    // Check if we need to interrupt backend streaming
    const wasBackendStreaming = isAISpeaking;
    
    // Always stop local audio playback immediately
    stopAudioPlayback();
    
    // 1. Force finalize ALL previous messages
    // 2. Immediately create a placeholder for the NEW user turn
    setMessages(prev => {
        const newMessages = prev.map(msg => 
            (!msg.isFinal) ? { ...msg, isFinal: true, isInterrupted: true } : msg
        );
        return [...newMessages, { 
            type: 'user', 
            content: '...', // Placeholder content
            isFinal: false, 
            id: newId,
            audioUrl: null 
        }];
    });
    
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
        <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">
                {user?.username || '用户'}
            </span>
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                {user?.username ? user.username[0].toUpperCase() : 'U'}
            </div>
        </div>
      </header>

      {/* Floating Playback Button */}
      {selection.visible && (
        <button
          onClick={playSelectedText}
          className="fixed z-50 p-2 bg-primary text-white rounded-full shadow-lg transform -translate-x-1/2 flex items-center justify-center animate-in fade-in zoom-in duration-200"
          style={{ left: selection.x, top: selection.y }}
        >
          {isSynthesizing ? (
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          ) : (
            <span className="material-symbols-outlined text-xl">volume_up</span>
          )}
        </button>
      )}

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
                  ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none border border-slate-100 dark:border-slate-700 select-text' 
                  : 'bg-primary text-white rounded-tr-none'
              }`}>
                 {msg.content === '...' ? (
                     /* Placeholder: Render nothing for text, only AudioBar below if valid */
                     null
                 ) : (
                     <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                 )}
                 {msg.audioUrl && (
                   <div className="mt-2">
                     <AudioBar 
                       audioUrl={msg.audioUrl}
                       duration={0} // Initial duration, will be updated by component when metadata loads
                       onClick={() => playFullAudio(msg.audioUrl)}
                       isOwnMessage={!isAI}
                     />
                   </div>
                 )}
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