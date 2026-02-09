import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { conversationAPI, aiAPI, userAPI } from '../services/api';
import RealTimeRecorder from '../components/RealTimeRecorder';
import { useAuth } from '../contexts/AuthContext';
import AudioBar from '../components/AudioBar'; // Import the new AudioBar component

function Conversation() {
  const navigate = useNavigate();
  const location = useLocation();
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

  // Scenario Tasks State
  const [tasks, setTasks] = useState(location.state?.tasks || []);
  const [completedTasks, setCompletedTasks] = useState(new Set());
  const [showTasks, setShowTasks] = useState(false); // Can keep for toggle, but default to true if tasks exist
  
  // Scenario Completion State
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [scenarioScore, setScenarioScore] = useState(0);
  const [allScenarios, setAllScenarios] = useState([]);
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
  const [currentScenarioTitle, setCurrentScenarioTitle] = useState('');
  const completionCheckedRef = useRef(false); // Prevent duplicate modal triggers
  
  const getScoreFeedback = (score) => {
    if (score >= 90) return { emoji: '🌟', text: '表现出色！你的表达非常流利自然，继续保持！', level: 'excellent' };
    if (score >= 75) return { emoji: '👍', text: '很棒！表达清晰准确，可以尝试更多复杂句型。', level: 'good' };
    if (score >= 60) return { emoji: '💪', text: '不错的进步！建议多练习口语表达的流畅度。', level: 'fair' };
    return { emoji: '📚', text: '继续努力！多听多说，熟能生巧。', level: 'needsWork' };
  };

  // Initialize completed tasks set and check for scenario completion
  useEffect(() => {
      if (tasks.length > 0) {
          const completed = new Set();
          let totalScore = 0;
          let objectTaskCount = 0;
          let completedCount = 0;
          
          tasks.forEach(t => {
              if (typeof t === 'object') {
                  objectTaskCount++;
                  if (t.status === 'completed') {
                      completed.add(t.text);
                      totalScore += (t.score || 100); // Default to 100 if score not set
                      completedCount++;
                  }
              }
          });
          setCompletedTasks(completed);
          setShowTasks(true);
          
          // Check if all object tasks are completed
          const allCompleted = objectTaskCount > 0 && completedCount === objectTaskCount;
          
          // Trigger completion modal only once
          if (allCompleted && !completionCheckedRef.current) {
              completionCheckedRef.current = true;
              const avgScore = Math.round(totalScore / objectTaskCount);
              setScenarioScore(avgScore);
              setShowCompletionModal(true);
          }
      }
  }, [tasks]);

  // Separate Effect: Fetch Tasks if missing (Page Refresh) + set scenario info
  useEffect(() => {
      const searchParams = new URLSearchParams(window.location.search);
      const scenarioParam = searchParams.get('scenario');
      // Get scenario from URL or state
      const scenarioName = scenarioParam 
          ? decodeURIComponent(scenarioParam) 
          : location.state?.scenario;
      
      if (scenarioName) {
          setCurrentScenarioTitle(scenarioName);
      }
      
      if (scenarioName && user && token) {
          userAPI.getActiveGoal().then(res => {
              if (res && res.goal && res.goal.scenarios) {
                  // Store all scenarios for navigation
                  setAllScenarios(res.goal.scenarios);
                  
                  // Find current scenario index (case-insensitive)
                  const scenarioIndex = res.goal.scenarios.findIndex(s => 
                      s.title.trim().toLowerCase() === scenarioName.trim().toLowerCase()
                  );
                  if (scenarioIndex !== -1) {
                      setCurrentScenarioIndex(scenarioIndex);
                      setCurrentScenarioTitle(res.goal.scenarios[scenarioIndex].title);
                  }
                  
                  // Fetch tasks if missing
                  if (tasks.length === 0 && scenarioIndex !== -1) {
                      const activeScenario = res.goal.scenarios[scenarioIndex];
                      if (activeScenario && activeScenario.tasks) {
                          setTasks(activeScenario.tasks);
                          console.log('Tasks fetched:', activeScenario.tasks);
                      }
                  }
              }
          }).catch(err => console.error('Task fetch error:', err));
      }
  }, [user, token, location.state?.scenario]); // Run when auth is ready or state changes
  
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
  
  // Scenario navigation functions
  const handleRetryCurrentScenario = () => {
      // Reset for same scenario practice
      setShowCompletionModal(false);
      completionCheckedRef.current = false;
      localStorage.removeItem(`session_${currentScenarioTitle}`);
      setMessages([{ type: 'system', content: '正在连接AI导师...' }]);
      setSessionId(null);
      setIsConnected(false);
      // Note: Tasks won't reset here - they keep their completed status
      // User can go to Discovery to select the same scenario again for a fresh start
  };
  
  const handleSelectOtherScenario = () => {
      setShowCompletionModal(false);
      navigate('/discovery');
  };
  
  const handleNextScenario = () => {
      if (currentScenarioIndex < allScenarios.length - 1) {
          const nextScenario = allScenarios[currentScenarioIndex + 1];
          setShowCompletionModal(false);
          completionCheckedRef.current = false;
          // Clear session for current scenario
          localStorage.removeItem(`session_${currentScenarioTitle}`);
          // Navigate with state - init effect will handle session creation
          navigate(`/conversation?scenario=${encodeURIComponent(nextScenario.title)}`, {
              state: { scenario: nextScenario.title, tasks: nextScenario.tasks },
              replace: true
          });
          // Reset local state for new scenario
          setTasks(nextScenario.tasks || []);
          setMessages([{ type: 'system', content: '正在连接AI导师...' }]);
          setSessionId(null);
          setIsConnected(false);
          setCompletedTasks(new Set());
          setCurrentScenarioIndex(currentScenarioIndex + 1);
          setCurrentScenarioTitle(nextScenario.title);
      } else {
          navigate('/discovery');
      }
  };
  
  const handleBackToDiscovery = () => {
      setShowCompletionModal(false);
      navigate('/discovery');
  };

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

  const playSuccessSound = useCallback(() => {
    initAudioContext();
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(500, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.3);
  }, []);

  // --- Message Handler ---
  const handleJsonMessage = useCallback((data) => {
      if (isInterruptedRef.current && data.type !== 'role_switch') {
         return; 
      }

      switch (data.type) {
        case 'text_response':
        case 'ai_response':
          const content = data.payload || data.text;
          const responseId = data.responseId; // Capture ID
          
          if (content) {
              setMessages(prev => {
                  // Find the matching AI message by responseId (search from end)
                  if (responseId) {
                      for (let i = prev.length - 1; i >= 0; i--) {
                          if (prev[i].type === 'ai' && prev[i].responseId === responseId && !prev[i].isFinal) {
                              // Found matching message, append to it
                              const updated = [...prev];
                              updated[i] = { ...updated[i], content: updated[i].content + content };
                              return updated;
                          }
                      }
                  }
                  
                  // Fallback: check if last message is an in-progress AI message without responseId
                  const last = prev[prev.length - 1];
                  if (last && last.type === 'ai' && !last.isFinal && !last.responseId) {
                      return [...prev.slice(0, -1), { ...last, content: last.content + content, responseId }];
                  }
                  
                  // Create new AI message
                  return [...prev, { type: 'ai', content: content, speaker: currentRoleRef.current, isFinal: false, responseId }];
              });
          }
          break;
        case 'response.audio.done':
          setMessages(prev => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                  if (updated[i].type === 'ai' && !updated[i].isFinal) {
                      updated[i] = { ...updated[i], isFinal: true };
                      break;
                  }
              }
              return updated;
          });
          setIsAISpeaking(false);
          break;
        case 'task_completed':
           playSuccessSound();
           
           // Re-fetch the latest goal state from DB to sync task progress
           userAPI.getActiveGoal().then(res => {
               if (res && res.goal && res.goal.scenarios) {
                   const searchParams = new URLSearchParams(window.location.search);
                   const currentScenarioTitle = searchParams.get('scenario') || location.state?.scenario;
                   
                   if (!currentScenarioTitle) return;

                   const activeScenario = res.goal.scenarios.find(s => s.title.trim() === currentScenarioTitle.trim());
                   
                   if (activeScenario && activeScenario.tasks) {
                       setTasks(activeScenario.tasks);
                       
                       // Re-calculate completed set
                       const newCompleted = new Set();
                       activeScenario.tasks.forEach(t => {
                           if (typeof t === 'object' && t.status === 'completed') {
                               newCompleted.add(t.text);
                           }
                       });
                       setCompletedTasks(newCompleted);
                       
                       // Show toast
                       const completedTask = activeScenario.tasks.find(t => t.status === 'completed' && !completedTasks.has(t.text));
                       const toastMsg = completedTask ? `✅ 完成任务: ${completedTask.text}` : '✅ 进度已保存';
                       setMessages(prev => [...prev, { type: 'system', content: toastMsg }]);
                   }
               }
           }).catch(err => console.error('Failed to sync tasks:', err));
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
           const targetResponseId = data.responseId; // Get ID from event

           if (role === 'assistant') {
               setMessages(prev => {
                   const newMessages = [...prev];
                   
                   // 1. Try Strict Match by Response ID
                   if (targetResponseId) {
                       const index = newMessages.findIndex(m => m.type === 'ai' && m.responseId === targetResponseId);
                       if (index !== -1) {
                           console.log(`[AudioURL] Attached to message ${index} via ID ${targetResponseId}`);
                           newMessages[index] = { ...newMessages[index], audioUrl: url };
                           return newMessages;
                       }
                   }

                   // 2. Fallback: Attach to the LAST AI message that doesn't have a URL
                   for (let i = newMessages.length - 1; i >= 0; i--) {
                       if (newMessages[i].type === 'ai' && !newMessages[i].audioUrl) {
                           console.log(`[AudioURL] Fallback attachment to message ${i}`);
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
           break;
        case 'user_transcript':
           // Display user's speech transcription in chat
           if (data.payload && data.payload.text) {
             setMessages(prev => {
               // Find any in-progress AI message and ensure user transcript is inserted BEFORE it
               const newMessages = [...prev];
               let insertIdx = newMessages.length;
               
               // If the last message is an in-progress AI message, insert BEFORE it
               for (let i = newMessages.length - 1; i >= 0; i--) {
                 if (newMessages[i].type === 'ai' && !newMessages[i].isFinal) {
                   insertIdx = i;
                   break;
                 }
               }
               
               const userMsg = { type: 'user', content: data.payload.text, isFinal: true };
               newMessages.splice(insertIdx, 0, userMsg);
               return newMessages;
             });
           }
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

    // Determine WebSocket URL based on environment
    // The client runs in a Docker container but is accessed from the host browser
    // WebSocket connections need to go directly to the API Gateway
    let wsUrl;
    
    // When accessed from localhost:5001, connect directly to API Gateway on localhost:8080
    if (window.location.hostname === 'localhost' && (window.location.port === '5001' || window.location.port === '')) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const searchParams = new URLSearchParams(window.location.search);
      const scenario = searchParams.get('scenario');
      const topic = searchParams.get('topic');
      const voice = localStorage.getItem('ai_voice') || 'Serena';
      wsUrl = `${protocol}//localhost:8080/api/ws/?token=${token}&sessionId=${sessionId}${scenario ? `&scenario=${scenario}` : ''}${topic ? `&topic=${topic}` : ''}&voice=${voice}`;
    } else {
      // Fallback for other configurations
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/api/ws/?token=${token}&sessionId=${sessionId}&voice=${localStorage.getItem('ai_voice') || 'Serena'}`;
      
      // Add scenario and topic if available
      const searchParams = new URLSearchParams(window.location.search);
      const scenario = searchParams.get('scenario');
      const topic = searchParams.get('topic');
      if (scenario) wsUrl += `&scenario=${scenario}`;
      if (topic) wsUrl += `&topic=${topic}`;
    }

    socketRef.current = new WebSocket(wsUrl);

    socketRef.current.onopen = () => {
      console.log('WS Open');
      setIsConnected(true);
      setMessages(prev => [...prev, { type: 'system', content: '连接成功！请按住麦克风开始说话。' }]);
      setWebSocketError(null);

      // Send session_start handshake
      const searchParams = new URLSearchParams(window.location.search);
      const payload = {
          type: 'session_start',
          userId: user.id,
          sessionId: sessionId,
          token: token,
          scenario: searchParams.get('scenario'),
          topic: searchParams.get('topic')
      };
      socketRef.current.send(JSON.stringify(payload));
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

    socketRef.current.onerror = (error) => {
        console.error('WebSocket Error:', error);
        setWebSocketError('连接异常');
        setIsConnected(false);
    };

    socketRef.current.onclose = (event) => {
        console.log('WebSocket Closed:', event.code, event.reason);
        setIsConnected(false);
        
        // Only show error if it wasn't a clean close
        if (event.code !== 1000) { // 1000 means normal closure
            setWebSocketError('连接已关闭');
        }
    };

  }, [token, sessionId, playAudioChunk, handleJsonMessage, user]);

  // Init Session
  useEffect(() => {
    const init = async () => {
      if (!user?.id || !token) return; // Wait for full auth

      // Check URL for sessionId (e.g., ?sessionId=...)
      const searchParams = new URLSearchParams(window.location.search);
      const urlSessionId = searchParams.get('sessionId') || searchParams.get('session'); // Support both
      const scenario = searchParams.get('scenario') || location.state?.scenario;
      const topic = searchParams.get('topic');

      // Refresh Tasks if missing (Page Refresh)
      if (!location.state?.tasks && scenario) {
          try {
              const goalRes = await userAPI.getActiveGoal();
              if (goalRes && goalRes.goal && goalRes.goal.scenarios) {
                  console.log('Available Scenarios:', goalRes.goal.scenarios.map(s => s.title));
                  console.log('Requested Scenario:', scenario);
                  
                  const activeScenario = goalRes.goal.scenarios.find(s => s.title.trim() === scenario.trim());
                  if (activeScenario && activeScenario.tasks) {
                      setTasks(activeScenario.tasks);
                      console.log('Restored tasks from active goal:', activeScenario.tasks);
                  } else {
                      console.warn('Scenario not found in active goal');
                  }
              }
          } catch (e) {
              console.warn('Failed to restore tasks from goal:', e);
          }
      }

      // Determine session ID priority: URL > localStorage > new session
      let effectiveSessionId = urlSessionId;

      // If no URL session ID, check localStorage for persisted session
      if (!effectiveSessionId && scenario) {
          const storedSessionId = localStorage.getItem(`session_${scenario}`);
          if (storedSessionId) {
              // Verify that the stored session ID is still valid by checking history
              try {
                  const historyRes = await conversationAPI.getHistory(storedSessionId);
                  if (historyRes && historyRes.messages) {
                      effectiveSessionId = storedSessionId;
                  }
              } catch (err) {
                  console.log('Stored session not valid, will create new one:', err);
                  // Clear invalid session from storage
                  localStorage.removeItem(`session_${scenario}`);
              }
          }
      }

      if (effectiveSessionId) {
          console.log('Restoring session:', effectiveSessionId);
          setSessionId(effectiveSessionId);

          // Update URL to reflect the session being used
          const newParams = new URLSearchParams(window.location.search);
          newParams.set('sessionId', effectiveSessionId);
          if (scenario) newParams.set('scenario', scenario);
          if (topic) newParams.set('topic', topic);
          const newUrl = `${window.location.pathname}?${newParams.toString()}`;
          window.history.replaceState({ path: newUrl }, '', newUrl);

          try {
              // Fetch History
              const historyRes = await conversationAPI.getHistory(effectiveSessionId);
              // handleResponse returns `data.data` (the conversation object)
              if (historyRes && historyRes.messages) {
                  const restoredMessages = historyRes.messages.map(m => ({
                      type: m.role === 'user' ? 'user' : 'ai',
                      content: m.content,
                      isFinal: true, // History is always final
                      audioUrl: m.audioUrl || null,
                      speaker: m.role === 'user' ? 'Me' : 'OralTutor' // Basic mapping
                  }));

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
              // If conversation not found, clear the invalid session ID from localStorage and start fresh
              if (err.message.includes('Conversation not found') && scenario) {
                  localStorage.removeItem(`session_${scenario}`);
                  console.log('Cleared invalid session from localStorage');
                  
                  // Start a new session instead of failing
                  try {
                      const res = await conversationAPI.startSession({
                          userId: user.id,
                          goalId: 'general', // Default goal ID
                          scenario: scenario, // Pass scenario if exists
                          topic: topic,       // Pass topic if exists
                          forceNew: true
                      });

                      if (res && res.sessionId) {
                          setSessionId(res.sessionId);

                          // Store session ID in localStorage for future persistence
                          if (scenario) {
                              localStorage.setItem(`session_${scenario}`, res.sessionId);
                          }

                          // Update URL to include sessionId, preventing "No History" error on refresh
                          const newParams = new URLSearchParams(window.location.search);
                          newParams.set('sessionId', res.sessionId);
                          if (scenario) newParams.set('scenario', scenario);
                          if (topic) newParams.set('topic', topic);
                          const newUrl = `${window.location.pathname}?${newParams.toString()}`;
                          window.history.replaceState({ path: newUrl }, '', newUrl);
                          
                          // Set initial message
                          setMessages([{ type: 'system', content: '正在连接AI导师...' }]);
                      } else {
                          setWebSocketError('无法创建会话');
                      }
                  } catch (sessionErr) {
                      console.error('Error starting new session:', sessionErr);
                      setWebSocketError('网络错误');
                  }
              } else {
                  setWebSocketError('无法加载历史记录');
              }
          }
      } else {
          // Start New Session
          try {
            // Fetch Active Goal ID first
            let goalId = 'general';
            try {
                // We assume userAPI is available (imported)
                const goalRes = await userAPI.getActiveGoal();
                if (goalRes && goalRes.goal) {
                     goalId = goalRes.goal.id || goalRes.goal._id;
                }
            } catch (e) {
                console.warn('Failed to fetch active goal for session start:', e);
            }

            const res = await conversationAPI.startSession({
                userId: user.id,
                goalId: goalId,
                scenario: scenario, // Pass scenario if exists
                topic: topic,       // Pass topic if exists
                forceNew: true
            });

            if (res && res.sessionId) {
                setSessionId(res.sessionId);

                // Store session ID in localStorage for future persistence
                if (scenario) {
                    localStorage.setItem(`session_${scenario}`, res.sessionId);
                }

                // Update URL to include sessionId, preventing "No History" error on refresh
                const newParams = new URLSearchParams(window.location.search);
                newParams.set('sessionId', res.sessionId);
                if (scenario) newParams.set('scenario', scenario);
                if (topic) newParams.set('topic', topic);
                const newUrl = `${window.location.pathname}?${newParams.toString()}`;
                window.history.replaceState({ path: newUrl }, '', newUrl);
            } else {
                setWebSocketError('无法创建会话');
            }
          } catch (err) {
            console.error('Error starting session:', err);
            setWebSocketError('网络错误');
          }
      }
    };
    init();
  }, [user, token]); // Added token dependency
  // Connect WS when SessionId ready
  useEffect(() => {
    if (sessionId && user) {
        connectWebSocket();
    }
    return () => {
        socketRef.current?.close();
        stopAudioPlayback();
        if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [sessionId, user, connectWebSocket]);


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
    isInterruptedRef.current = false;
  };

  const handleRecordingCancel = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'user_audio_cancelled' }));
    }
    const cancelId = currentUserMessageIdRef.current;
    setMessages(prev => prev.filter(m => !(m.type === 'user' && m.id === cancelId)));
    isInterruptedRef.current = false;
  };

  const handleAudioData = (data) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(data);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-background-light dark:bg-background-dark relative">
      {/* Task Sidebar/Overlay */}
      {tasks.length > 0 && (
          <div className={`fixed top-20 right-4 z-20 w-48 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 p-4 transition-transform duration-300 ${showTasks ? 'translate-x-0' : 'translate-x-[110%]'}`}>
              <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-xs uppercase tracking-wide text-slate-500">Mission Tasks</h3>
                  <button onClick={() => setShowTasks(false)} className="text-slate-400 hover:text-slate-600">
                      <span className="material-symbols-outlined text-sm">close</span>
                  </button>
              </div>
              <ul className="space-y-2">
                  {tasks.map((task, idx) => {
                      const taskText = typeof task === 'string' ? task : task.text;
                      const isCompleted = completedTasks.has(taskText);
                      return (
                          <li key={idx} className={`text-xs flex items-start gap-2 ${isCompleted ? 'text-green-600 dark:text-green-400 line-through opacity-70' : 'text-slate-700 dark:text-slate-200'}`}>
                              <span className={`w-3 h-3 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${isCompleted ? 'bg-green-100 border-green-200' : 'border-slate-300'}`}>
                                  {isCompleted && <span className="material-symbols-outlined text-[8px] font-bold">check</span>}
                              </span>
                              <span>{taskText}</span>
                          </li>
                      );
                  })}
              </ul>
          </div>
      )}
      
      {/* Toggle Tasks Button */}
      {tasks.length > 0 && !showTasks && (
          <button 
            onClick={() => setShowTasks(true)}
            className="fixed top-20 right-4 z-20 bg-white dark:bg-slate-800 p-2 rounded-full shadow-md border border-slate-200 dark:border-slate-700 text-primary">
              <span className="material-symbols-outlined">assignment</span>
          </button>
      )}

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
          const displayContent = msg.content ? msg.content.replace(/```json[\s\S]*?```/g, '').trim() : '';

          if (!isAI && (!displayContent || displayContent === '...')) {
            return null;
          }
          if (isAI && !displayContent) {
            return null;
          }

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
                 <p className="whitespace-pre-wrap leading-relaxed">{displayContent}</p>
                 {msg.audioUrl && (
                   <div className="mt-2">
                     <AudioBar 
                       audioUrl={msg.audioUrl}
                       duration={0}
                       onClick={() => playFullAudio(msg.audioUrl)}
                       isOwnMessage={!isAI}
                     />
                   </div>
                 )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} className="h-4" />
      </main>

      {/* Footer / Controls */}
      <footer className="pb-6 pt-4 px-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col items-center gap-2">
            <RealTimeRecorder 
              onAudioData={handleAudioData}
              isConnected={isConnected}
              onStart={handleRecordingStart}
              onStop={handleRecordingStop}
              onCancel={handleRecordingCancel}
            />
            {webSocketError && (
                <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded-full animate-pulse">
                    {webSocketError}
                </p>
            )}
        </div>
      </footer>
      
      {/* Scenario Completion Modal */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden animate-in zoom-in duration-300">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-white text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-4xl">celebration</span>
              </div>
              <h2 className="text-xl font-bold">场景完成！</h2>
              <p className="text-green-100 text-sm mt-1">{currentScenarioTitle}</p>
            </div>
            
            <div className="p-6">
              <div className="text-center mb-4">
                <div className="text-4xl font-bold text-primary mb-1">{scenarioScore}</div>
                <div className="text-sm text-slate-500">平均得分</div>
                <div className="flex justify-center gap-1 mt-2">
                  {[1,2,3,4,5].map(star => (
                    <span 
                      key={star} 
                      className={`material-symbols-outlined text-xl ${star <= Math.ceil(scenarioScore / 20) ? 'text-yellow-400' : 'text-slate-300'}`}
                    >
                      star
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{getScoreFeedback(scenarioScore).emoji}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">AI点评</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      {getScoreFeedback(scenarioScore).text}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                {currentScenarioIndex < allScenarios.length - 1 && (
                  <button 
                    onClick={handleNextScenario}
                    className="w-full py-3 bg-primary text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition"
                  >
                    <span>下一个场景</span>
                    <span className="material-symbols-outlined">arrow_forward</span>
                  </button>
                )}
                
                <button 
                  onClick={handleRetryCurrentScenario}
                  className="w-full py-3 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition"
                >
                  <span className="material-symbols-outlined">replay</span>
                  <span>继续练习</span>
                </button>
                
                <button 
                  onClick={handleSelectOtherScenario}
                  className="w-full py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                >
                  <span className="material-symbols-outlined">grid_view</span>
                  <span>选择其他场景</span>
                </button>
                
                <button 
                  onClick={handleBackToDiscovery}
                  className="w-full py-2 text-slate-500 text-sm hover:text-slate-700 transition"
                >
                  返回主页
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Conversation;