import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { conversationAPI, aiAPI, userAPI } from '../services/api';
import { getAuthHeaders } from '../services/api';
import RealTimeRecorder from '../components/RealTimeRecorder';
import { useAuth } from '../contexts/AuthContext';
import AudioBar from '../components/AudioBar.jsx'; // Import the new AudioBar component
import NetworkAdaptiveManager from '../utils/network-adaptive-manager';
import OptimizedWebSocket from '../utils/websocket-optimized';

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
  const [welcomeMessageShown, setWelcomeMessageShown] = useState(false); // Track if welcome message has been shown
  const connectWebSocketRef = useRef(null); // Ref to store connectWebSocket function
  
  // WebSocket connection control states
  const [isManualDisconnect, setIsManualDisconnect] = useState(false); // Track if user manually disconnected
  const [reconnectAttempts, setReconnectAttempts] = useState(0); // Track reconnection attempts
  const MAX_RECONNECT_ATTEMPTS = 3; // Maximum automatic reconnect attempts before requiring manual intervention

  // Default scenario templates
  const DEFAULT_SCENARIOS = {
    daily_conversation: [
      { title: "Casual Greetings", tasks: ["Greet someone you just met", "Ask how someone is doing", "Make small talk about the weather"] },
      { title: "Coffee Shop Order", tasks: ["Order your favorite drink", "Ask about menu items", "Request modifications"] },
      { title: "Grocery Shopping", tasks: ["Ask for item locations", "Request quantity and price", "Handle checkout conversation"] },
      { title: "Directions", tasks: ["Ask for directions to a location", "Clarify route details", "Thank for help"] },
      { title: "Phone Call Basics", tasks: ["Answer a phone call properly", "Ask who is calling", "End a call politely"] },
      { title: "Restaurant Dining", tasks: ["Make a reservation", "Order food from menu", "Ask for the bill"] },
      { title: "Public Transport", tasks: ["Ask about schedules", "Buy a ticket", "Confirm your stop"] },
      { title: "Weekend Plans", tasks: ["Discuss weekend activities", "Make suggestions", "Accept or decline invitations"] },
      { title: "Hobbies Discussion", tasks: ["Share your hobbies", "Ask about others' interests", "Make related plans"] },
      { title: "Small Talk (Culture)", tasks: ["Discuss local customs", "Share interesting facts", "Express opinions politely"] }
    ],
    business_meeting: [
      { title: "Self Introduction", tasks: ["Introduce yourself professionally", "Share your role and company", "Exchange contact information"] },
      { title: "Meeting Scheduling", tasks: ["Propose meeting times", "Confirm availability", "Send meeting invites"] },
      { title: "Project Status Update", tasks: ["Summarize current progress", "Discuss blockers", "Plan next steps"] },
      { title: "Client Presentation", tasks: ["Open a presentation", "Explain key points", "Handle Q&A"] },
      { title: "Negotiation Basics", tasks: ["State your position", "Listen to counteroffers", "Reach a compromise"] },
      { title: "Email Discussion", tasks: ["Reference an important email", "Clarify email contents", "Agree on follow-up actions"] },
      { title: "Team Collaboration", tasks: ["Assign tasks to team members", "Check on task progress", "Provide feedback"] },
      { title: "Conference Call", tasks: ["Join a video call", "Share your screen", "Wrap up the call"] },
      { title: "Deadline Management", tasks: ["Discuss timeline constraints", "Request deadline extension", "Commit to new dates"] },
      { title: "Professional Small Talk", tasks: ["Chat about industry news", "Discuss career journeys", "Build rapport"] }
    ],
    travel_survival: [
      { title: "Airport Check-in", tasks: ["Check in for your flight", "Ask about seat preferences", "Handle baggage check"] },
      { title: "Immigration Control", tasks: ["Answer officer questions", "Explain your trip purpose", "Provide required documents"] },
      { title: "Hotel Reservation", tasks: ["Book a room", "Ask about amenities", "Request early check-in"] },
      { title: "Taxi & Rideshare", tasks: ["Request a ride", "Give your destination", "Handle payment"] },
      { title: "Asking Directions", tasks: ["Ask how to get somewhere", "Understand landmark references", "Confirm the route"] },
      { title: "Restaurant Ordering", tasks: ["Ask for recommendations", "Order local cuisine", "Handle dietary requirements"] },
      { title: "Shopping Abroad", tasks: ["Ask prices", "Negotiate or bargain", "Request tax refund info"] },
      { title: "Emergency Situations", tasks: ["Ask for help", "Explain your situation", "Contact emergency services"] },
      { title: "Sightseeing Tours", tasks: ["Book a tour", "Ask tour guide questions", "Express interest or concerns"] },
      { title: "Cultural Small Talk", tasks: ["Discuss local culture", "Share your impressions", "Learn local expressions"] }
    ],
    exam_prep: [
      { title: "Self Introduction (Exam)", tasks: ["Introduce yourself clearly", "Mention your background", "State your goals"] },
      { title: "Describing Pictures", tasks: ["Describe a photo in detail", "Compare two images", "Express your opinion"] },
      { title: "Opinion Questions", tasks: ["State your opinion clearly", "Give supporting reasons", "Conclude your answer"] },
      { title: "Problem Solving", tasks: ["Identify the problem", "Suggest solutions", "Evaluate options"] },
      { title: "Role-play Scenarios", tasks: ["Understand the situation", "Respond appropriately", "Handle follow-ups"] },
      { title: "Discussion & Debate", tasks: ["Express agreement/disagreement", "Build on others' points", "Summarize the discussion"] },
      { title: "Long Turn Speaking", tasks: ["Speak for 1-2 minutes fluently", "Structure your answer", "Manage your time"] },
      { title: "Pronunciation Practice", tasks: ["Practice difficult sounds", "Work on intonation", "Reduce accent interference"] },
      { title: "Vocabulary Expansion", tasks: ["Use academic vocabulary", "Explain complex terms", "Paraphrase effectively"] },
      { title: "Mock Exam Practice", tasks: ["Complete a timed practice", "Self-evaluate performance", "Identify improvement areas"] }
    ],
    presentation: [
      { title: "Opening Strong", tasks: ["Grab audience attention", "Introduce your topic", "Preview main points"] },
      { title: "Explaining Data", tasks: ["Present statistics clearly", "Interpret chart information", "Draw conclusions"] },
      { title: "Storytelling", tasks: ["Share a relevant story", "Connect to your message", "Engage emotionally"] },
      { title: "Handling Q&A", tasks: ["Listen carefully to questions", "Provide clear answers", "Handle difficult questions"] },
      { title: "Visual Aid Description", tasks: ["Reference your slides", "Explain diagrams", "Guide audience attention"] },
      { title: "Transitions", tasks: ["Move between topics smoothly", "Recap previous points", "Preview next sections"] },
      { title: "Persuasion Techniques", tasks: ["Present your argument", "Address counter-arguments", "Call to action"] },
      { title: "Closing Impact", tasks: ["Summarize key takeaways", "End with a memorable statement", "Thank your audience"] },
      { title: "Team Presentation", tasks: ["Coordinate with co-presenters", "Handle handoffs", "Support each other"] },
      { title: "Impromptu Speaking", tasks: ["Speak on unexpected topics", "Organize thoughts quickly", "Deliver confidently"] }
    ]
  };

  // Scenario Tasks State
  const [tasks, setTasks] = useState(location.state?.tasks || []);
  const [completedTasks, setCompletedTasks] = useState(new Set());
  // Initialize showTasks based on whether we have tasks or scenario info
  const [showTasks, setShowTasks] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const scenarioFromUrl = searchParams.get('scenario');
    const scenarioFromState = location.state?.scenario;
    // Show tasks if we have tasks or if we have scenario info (meaning tasks might load later)
    return tasks.length > 0 || !!scenarioFromUrl || !!scenarioFromState;
  });
  
  // Track if tasks are loading to prevent showing "Loading tasks" when we know tasks exist
  const [tasksLoading, setTasksLoading] = useState(false);
  
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
      console.log('Initializing tasks state:', tasks); // Debug log
      console.log('All scenarios length:', allScenarios.length); // Debug log
      console.log('Tasks array details:', JSON.stringify(tasks)); // Debug log
      
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
          
          // Only show tasks if there are tasks and they haven't been completed yet
          const hasIncompleteTasks = objectTaskCount > 0 && completedCount < objectTaskCount;
          setShowTasks(hasIncompleteTasks);
          
          // Calculate average score for completed tasks
          if (completedCount > 0) {
              setScenarioScore(Math.round(totalScore / completedCount));
          }

          // Check if all tasks are completed to show completion modal
          if (objectTaskCount > 0 && completedCount === objectTaskCount && !completionCheckedRef.current) {
              completionCheckedRef.current = true;
              setTimeout(() => setShowCompletionModal(true), 1000); // Delay to show final task completion
          }
      }
  }, [tasks, allScenarios]);

  // Audio context and refs
  const audioContextRef = useRef(null);
  const nextStartTimeRef = useRef(0);
  const audioQueueRef = useRef([]);
  const isInterruptedRef = useRef(false);
  const currentUserMessageIdRef = useRef(null);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);

  // Initialize audio context
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000,
        latencyHint: 'interactive'
      });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  // Stop audio playback
  const stopAudioPlayback = () => {
    isInterruptedRef.current = true;
    audioQueueRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Ignore errors from already stopped sources
      }
    });
    audioQueueRef.current = [];
    setIsAISpeaking(false);
  };

  // Play full audio (for AudioBar) - use proxy for cross-origin audio
  const playFullAudio = (audioUrl) => {
    console.log('Playing full audio from:', audioUrl);
    
    // Stop any currently playing audio first
    stopAudioPlayback();
    
    // Check if URL is cross-origin
    const isCrossOrigin = audioUrl.startsWith('http') && !audioUrl.startsWith(window.location.origin);

    if (isCrossOrigin) {
      // For cross-origin audio, always use proxy to avoid CORS issues
      console.log('Using proxy for cross-origin audio:', audioUrl);
      fetchAudioViaProxy(audioUrl);
    } else {
      // Same-origin, use Web Audio API
      initAudioContext();
      fetch(audioUrl)
        .then(res => res.arrayBuffer())
        .then(buffer => {
          if (!audioContextRef.current) return;
          return audioContextRef.current.decodeAudioData(buffer);
        })
        .then(audioBuffer => {
          if (!audioBuffer || !audioContextRef.current) return;
          const source = audioContextRef.current.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContextRef.current.destination);
          
          // Add to queue for stop functionality
          audioQueueRef.current.push(source);
          
          source.start();
          setIsAISpeaking(true);
          source.onended = () => {
            setIsAISpeaking(false);
            // Remove from queue when done
            audioQueueRef.current = audioQueueRef.current.filter(s => s !== source);
            console.log('Audio playback ended');
          };
        })
        .catch(err => console.error('Error playing same-origin audio:', err));
    }
  };

  // Fetch audio via API proxy to avoid CORS issues
  const fetchAudioViaProxy = async (audioUrl) => {
    try {
      // Use our API gateway as a proxy to fetch the audio
      const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(audioUrl)}`;

      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();

      initAudioContext();
      if (!audioContextRef.current) return;

      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      // Add to queue for stop functionality
      audioQueueRef.current.push(source);
      
      source.start();

      setIsAISpeaking(true);
      source.onended = () => {
        setIsAISpeaking(false);
        // Remove from queue when done
        audioQueueRef.current = audioQueueRef.current.filter(s => s !== source);
      };
    } catch (err) {
      // Silently ignore proxy errors - audio playback is optional
    }
  };

  // Text-to-speech for selected text
  const playSelectedText = async () => {
    if (!selection.text || isSynthesizing) return;
    
    setIsSynthesizing(true);
    try {
      const response = await aiAPI.synthesizeSpeech(selection.text);
      if (response.audioUrl) {
        playFullAudio(response.audioUrl);
      }
    } catch (error) {
      console.error('Speech synthesis error:', error);
    } finally {
      setIsSynthesizing(false);
      setSelection(prev => ({ ...prev, visible: false }));
    }
  };

  // Handle text selection
  const handleTextSelection = () => {
    const selectionObj = window.getSelection();
    const selectedText = selectionObj.toString().trim();
    
    if (selectedText.length > 0) {
      const range = selectionObj.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      setSelection({
        text: selectedText,
        x: Math.min(Math.max(rect.left + rect.width / 2, 50), window.innerWidth - 50),
        y: Math.max(rect.top - 50, 50),
        visible: true
      });
    } else {
      setSelection(prev => ({ ...prev, visible: false }));
    }
  };

  // Handle next scenario
  const handleNextScenario = () => {
    const nextIndex = currentScenarioIndex + 1;
    if (nextIndex < allScenarios.length) {
      const nextScenario = allScenarios[nextIndex];
      navigate('/conversation', { 
        state: { 
          scenario: nextScenario.title, 
          tasks: nextScenario.tasks,
          allScenarios: allScenarios,
          currentIndex: nextIndex
        } 
      });
    }
  };

  // Handle retry current scenario
  const handleRetryCurrentScenario = () => {
    setShowCompletionModal(false);
    setCompletedTasks(new Set());
    completionCheckedRef.current = false;
    // Clear messages but keep the connection
    setMessages([
      {
        type: 'system',
        content: '重新开始练习...'
      }
    ]);
  };

  // Handle select other scenario
  const handleSelectOtherScenario = () => {
    navigate('/discovery');
  };

  // Handle back to discovery
  const handleBackToDiscovery = () => {
    navigate('/discovery');
  };

  // Manual retry reconnect function
  const handleManualRetry = useCallback(() => {
    console.log('Manual retry triggered');
    setIsManualDisconnect(false);
    setReconnectAttempts(0);
    setWebSocketError(null);

    // Reconnect with current session ID
    if (sessionId) {
      // Use latest connectWebSocket reference
      connectWebSocketRef.current(sessionId);
    }
  }, [sessionId]);

  // Save conversation history
  const saveConversationHistory = async () => {
    if (!sessionId || messages.length === 0) {
      console.log('No session ID or messages to save');
      return;
    }

    try {
      console.log('Saving conversation history. Total messages:', messages.length);
      console.log('Messages before filtering:', messages.map((m, i) => ({index: i, type: m.type, isFinal: m.isFinal, content: m.content?.substring(0, 50)})));
      
      // Prepare messages for saving - save final messages and non-final AI messages
      const messagesToSave = messages
        .filter(msg => msg.isFinal || msg.type === 'ai') // Save finalized messages AND AI messages (even if not final)
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content,
          audioUrl: msg.audioUrl || null
        }));

      console.log('Messages after filtering:', messagesToSave.map((m, i) => ({index: i, role: m.role, content: m.content?.substring(0, 50)})));

      if (messagesToSave.length === 0) {
        console.log('No finalized messages to save');
        return;
      }

      const response = await conversationAPI.saveHistory(sessionId, messagesToSave, user.id);
      if (response.success) {
        console.log('Conversation history saved successfully');
      } else {
        console.error('Failed to save conversation history:', response.message);
      }
    } catch (error) {
      console.error('Error saving conversation history:', error);
    }
  };

  const connectionToastShownRef = useRef(false);

  // Handle JSON messages from WebSocket
  const handleJsonMessage = useCallback((data) => {
      console.log('Received JSON message:', data);

      // Handle ping/pong messages for connection health
      if (data.type === 'ping') {
        // Send pong response
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'pong',
            timestamp: data.timestamp,
            sequence: data.sequence
          }));
        }
        return;
      } else if (data.type === 'pong') {
        console.log('Pong received, connection healthy');
        return;
      }

      // Handle different message types
      switch (data.type) {
        case 'connection_established':
           console.log('Connection established:', data.payload);
           // Only show toast once per page session to avoid spam
           if (connectionToastShownRef.current) {
               console.log('Connection toast already shown, skipping');
               break;
           }
           connectionToastShownRef.current = true;
           
           // Add connection success message only once, and only if no history messages exist
           setMessages(prev => {
             const hasConnectionMessage = prev.some(msg =>
               msg.type === 'system' && msg.content.includes('连接成功')
             );
             // Only show if no history (i.e., only has initial system message)
             const isFirstMessage = prev.length <= 1;
             if (!hasConnectionMessage && isFirstMessage) {
               return [...prev, { type: 'system', content: '连接成功！请按住麦克风开始说话。' }];
             }
             return prev;
           });
           
           // Re-fetch tasks after connection to ensure we have the latest state
           // This is especially important after page refresh
           const searchParams = new URLSearchParams(window.location.search);
           const scenario = searchParams.get('scenario') || location.state?.scenario;
           if (scenario) {
               // Re-fetch the latest goal state from DB to sync task progress
               userAPI.getActiveGoal().then(res => {
                   if (res && res.goal && res.goal.scenarios) {
                       const activeScenario = res.goal.scenarios.find(s => s.title.trim() === scenario.trim());
                       if (activeScenario && activeScenario.tasks) {
                           setTasks(activeScenario.tasks);
                           console.log('Updated tasks from backend:', activeScenario.tasks);

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
                           if (completedTask) { setMessages(prev => [...prev, { type: 'system', content: `✅ 完成任务：${completedTask.text}` }]); }
                       }
                   }
               }).catch(err => console.error('Failed to sync tasks:', err));
           }
           break;
        case 'transcription':
           console.log('Transcription Event:', data);
           // User transcription
           setMessages(prev => {
               const last = prev[prev.length - 1];
               const currentId = currentUserMessageIdRef.current;

               // STRICT CHECK: Update ONLY if the last message matches the current turn ID
               if (last && last.type === 'user' && last.id === currentId && !last.isFinal) {
                   const updated = [
                       ...prev.slice(0, -1),
                       {
                           ...last,
                           content: data.isFinal ? data.text : last.content + data.text,
                           isFinal: !!data.isFinal
                       }
                   ];
                   console.log('Updated existing user message:', updated[updated.length - 1]);
                   return updated;
               }

               // Otherwise, append a NEW message for this turn
               // This prevents overwriting previous turns if they weren't finalized correctly
               const newMessage = {
                   type: 'user',
                   content: data.text,
                   isFinal: !!data.isFinal,
                   id: currentId // Bind this message to the current turn
               };
               console.log('Created new user message:', newMessage);
               return [...prev, newMessage];
           });
           break;
        case 'audio_url':
           const audioPayload = data.payload || data;
           const url = audioPayload.url || data.url;
           const role = audioPayload.role || data.role;
           const targetResponseId = data.responseId || audioPayload.responseId; // Get ID from event

           if (role === 'assistant') {
               setMessages(prev => {
                   const newMessages = [...prev];

                   // 1. Try Strict Match by Response ID
                   if (targetResponseId) {
                       const index = newMessages.findIndex(m => m.type === 'ai' && m.responseId === targetResponseId);
                       if (index !== -1) {
                           console.log(`[AudioURL] Attached to message ${index} via ID ${targetResponseId}`);
                           newMessages[index] = { ...newMessages[index], audioUrl: url, audioPlayed: false };
                           return newMessages;
                       }
                   }

                   // 2. Fallback: Attach to the LAST AI message that doesn't have a URL
                   for (let i = newMessages.length - 1; i >= 0; i--) {
                       if (newMessages[i].type === 'ai' && !newMessages[i].audioUrl) {
                           console.log(`[AudioURL] Fallback attachment to message ${i}`);
                           newMessages[i] = { ...newMessages[i], audioUrl: url, audioPlayed: false };
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
                           console.log(`[AudioURL] Attached to user message with ID ${currentId}`);
                           break;
                       }
                   }
                   return newMessages;
               });
           }
           break;
        case 'role_switch':
           setCurrentRole(data.payload.role);
           console.log('Role switched to:', data.payload.role);
           break;
        case 'ai_message':
           // Handle AI message from comms-service (contains text content in payload)
           console.log('🤖 AI Message:', data);
           const msgPayload = data.payload || data;
           const aiContent = msgPayload.content || data.content || data.text || msgPayload.text || '';
           const responseId = msgPayload.responseId || data.responseId;
           
           if (aiContent) {
               setMessages(prev => {
                   const last = prev[prev.length - 1];
                   // If last message is an in-progress AI message, update it
                   if (last && last.type === 'ai' && !last.isFinal) {
                       return [
                           ...prev.slice(0, -1),
                           {
                               ...last,
                               content: aiContent,
                               isFinal: true,
                               responseId: responseId || last.responseId
                           }
                       ];
                   }
                   // Otherwise create new AI message
                   return [...prev, {
                       type: 'ai',
                       content: aiContent,
                       isFinal: true,
                       responseId: responseId
                   }];
               });
           }
           break;
        case 'ai_response':
           // Handle AI text response from comms-service
           console.log('🤖 AI Response:', data.text);
           setMessages(prev => {
               const last = prev[prev.length - 1];
               // If last message is an in-progress AI message, update it
               if (last && last.type === 'ai' && !last.isFinal) {
                   return [
                       ...prev.slice(0, -1),
                       {
                           ...last,
                           content: data.text,
                           isFinal: true
                       }
                   ];
               }
               // Otherwise create new AI message
               return [...prev, {
                   type: 'ai',
                   content: data.text,
                   isFinal: true
               }];
           });
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
               console.log('Inserted user transcript:', userMsg);
               return newMessages;
             });
           }
           break;
        case 'error':
           console.error('Server Error:', data.payload);
           break;
        case 'user_proficiency_feedback':
           // Handle proficiency feedback from workflow service
           console.log('📊 Proficiency Feedback:', data.payload);
           break;
        case 'proficiency_update':
           // Handle proficiency update notification
           console.log('📈 Proficiency Update:', data.payload);
           const profPayload = data.payload || {};
           const delta = profPayload.delta || profPayload.proficiency_delta || 0;
           const total = profPayload.total || profPayload.current_proficiency || 0;
           if (delta > 0) {
               setMessages(prev => [...prev, {
                   type: 'system',
                   content: `+${delta} 熟练度 | 总分：${total}`,
                   isFinal: true
               }]);
               // Auto-dismiss after 3 seconds
               setTimeout(() => {
                   setMessages(prev => prev.filter(m => m.type !== 'system' || !m.content.includes('熟练度')));
               }, 3000);
           }
           break;
        case 'task_completed':
           // Handle task completion notification
           console.log('✅ Task Completed:', data.payload);
           const taskPayload = data.payload || {};
           if (taskPayload.task_title) {
               setMessages(prev => [...prev, {
                   type: 'system',
                   content: `✅ 任务完成：${taskPayload.task_title}`,
                   isFinal: true
               }]);
               // Update completed tasks
               if (taskPayload.task_title) {
                   setCompletedTasks(prev => new Set([...prev, taskPayload.task_title]));
               }
           }
           break;
        case 'dashscope_response':
           // Internal DashScope events - ignore
           break;
        default:
           // Ignore unknown message types silently
           break;
      }
  }, []); // Removed currentRole dependency

  const playAudioChunk = useCallback(async (audioData) => {
    if (isInterruptedRef.current) return; // Drop audio if interrupted

    initAudioContext();
    const ctx = audioContextRef.current;

    console.log('Playing Audio Chunk, type:', audioData.constructor.name, 'size:', audioData.byteLength || audioData.size);

    let audioBuffer;
    try {
        // audioData is already an ArrayBuffer, no need to call .arrayBuffer()
        const decodeBuffer = audioData.slice(0);
        audioBuffer = await ctx.decodeAudioData(decodeBuffer);
        console.log('Audio decoded successfully, duration:', audioBuffer.duration, 'sampleRate:', audioBuffer.sampleRate);
    } catch (e) {
        console.log('decodeAudioData failed, trying PCM fallback:', e.message);
        
        // Fallback: Assume Raw PCM Int16 24kHz Mono
        const int16Array = new Int16Array(audioData);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }
        audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);
        console.log('PCM fallback created, length:', float32Array.length);
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
    console.log('Audio playback started, isAISpeaking:', true);

  }, [handleJsonMessage]);

  // --- WebSocket Logic ---
  const connectWebSocket = useCallback((explicitSessionId = null) => {
    const effectiveSessionId = explicitSessionId || sessionId;
    if (!token || !effectiveSessionId) {
      console.log('connectWebSocket: missing token or sessionId', { token, effectiveSessionId, sessionId });
      return;
    }

    // Store in ref for later use
    connectWebSocketRef.current = connectWebSocket;

    // Close existing if any
    if (socketRef.current) {
        socketRef.current.close();
    }

    // Initialize network adaptive manager
    if (!window.networkAdaptiveManager) {
      window.networkAdaptiveManager = new NetworkAdaptiveManager({
        enableLogging: true,
        onNetworkChange: (networkState) => {
          console.log('Network conditions changed:', networkState);
          // Update UI or streaming quality based on network conditions
        },
        onQualityChange: (newQuality, oldQuality) => {
          console.log('Network quality changed:', { old: oldQuality, new: newQuality });
          // Adapt streaming quality based on network quality
        }
      });
    }

    // Determine WebSocket URL based on environment
    let wsUrl;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const searchParams = new URLSearchParams(window.location.search);
    const scenario = searchParams.get('scenario');
    const topic = searchParams.get('topic');
    const voice = localStorage.getItem('ai_voice') || 'Serena';
    
    // Determine the correct WebSocket host
    let wsHost;
    if (window.location.hostname === 'localhost' && window.location.port === '3000') {
      // Development server - connect to API gateway on port 8081
      wsHost = 'localhost:8081';
    } else {
      // Production or Docker environment - use current host
      wsHost = window.location.host;
    }
    
    wsUrl = `${protocol}//${wsHost}/api/ws/?token=${token}&sessionId=${effectiveSessionId}${scenario ? `&scenario=${scenario}` : ''}${topic ? `&topic=${topic}` : ''}&voice=${voice}`;

    // Create optimized WebSocket connection
    socketRef.current = new OptimizedWebSocket(wsUrl, {
      reconnectInterval: 1000,
      maxReconnectAttempts: 5,
      connectionTimeout: 30000, // Increased to 30 seconds for AI service connection
      heartbeatInterval: 15000, // Reduced to 15 seconds for more frequent heartbeat
      enableLogging: true,
      enableCompression: true
    });

    // Set up network adaptive manager with WebSocket
    if (window.networkAdaptiveManager) {
      window.networkAdaptiveManager.setWebSocket(socketRef.current);
    }

    // Register event listeners BEFORE connecting to avoid missing events
    socketRef.current.addEventListener('open', () => {
      console.log('WS Open (Optimized)');
      setIsConnected(true);
      setWebSocketError(null);

      // Start ping interval to keep connection alive
      const pingInterval = setInterval(() => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'ping',
            timestamp: Date.now(),
            sequence: Math.floor(Math.random() * 1000)
          }));
        }
      }, 10000); // Send ping every 10 seconds

      // Store interval reference for cleanup
      socketRef.current.pingInterval = pingInterval;

      // Send session_start handshake
      const searchParams = new URLSearchParams(window.location.search);
      const payload = {
          type: 'session_start',
          userId: user.id,
          sessionId: sessionId,
          token: token,
          scenario: searchParams.get('scenario'),
          topic: searchParams.get('topic'),
          isRestoration: true,
          clientInfo: {
            optimized: true,
            version: '2.0',
            features: ['adaptive_streaming', 'compression', 'low_latency']
          }
      };
      socketRef.current.send(JSON.stringify(payload));
    });

    socketRef.current.addEventListener('message', async (event) => {
      console.log('[WS Message] Type:', event.data?.constructor?.name, 'Size:', event.data?.byteLength || event.data?.size || 'N/A');
      
      if (event.data instanceof ArrayBuffer) {
        // Handle binary audio data
        console.log('[Audio] Received binary audio data, size:', event.data.byteLength);
        playAudioChunk(event.data);
      } else if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          handleJsonMessage(data);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      } else if (event.data instanceof Blob) {
        // Handle blob data
        console.log('[Audio] Received blob data, size:', event.data.size);
        try {
          const arrayBuffer = await event.data.arrayBuffer();
          playAudioChunk(arrayBuffer);
        } catch (e) {
          console.error('Failed to handle blob:', e);
        }
      } else {
        console.warn('[WS] Unknown message type:', typeof event.data, event.data);
      }
    });

    socketRef.current.addEventListener('error', (error) => {
        console.error('WebSocket Error (Optimized):', error);
        setWebSocketError('连接异常');
        setIsConnected(false);
    });

    socketRef.current.addEventListener('close', async (event) => {
        console.log('WebSocket Closed (Optimized):', event.code, event.reason);
        setIsConnected(false);

        // Clear ping interval
        if (socketRef.current.pingInterval) {
          clearInterval(socketRef.current.pingInterval);
          socketRef.current.pingInterval = null;
        }

        // Save conversation history when connection closes
        await saveConversationHistory();

        // Stop network monitoring
        if (window.networkAdaptiveManager) {
          window.networkAdaptiveManager.stopMonitoring();
        }

        // Don't auto-reconnect if:
        // 1. It was a clean close (code 1000)
        // 2. User manually disconnected
        // 3. Max reconnect attempts reached
        const isCleanClose = event.code === 1000 || event.code === 1001;
        
        if (isCleanClose || isManualDisconnect || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            if (!isCleanClose && !isManualDisconnect) {
                setWebSocketError(`连接已关闭 (${event.code})`);
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                setWebSocketError(`已达到最大重试次数 (${MAX_RECONNECT_ATTEMPTS})，请刷新页面或点击重试`);
            }
            return;
        }

        // Auto-reconnect with exponential backoff for unexpected disconnections
        if (!isManualDisconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const attemptNum = reconnectAttempts + 1;
            console.log(`Attempting automatic reconnection ${attemptNum}/${MAX_RECONNECT_ATTEMPTS}...`);
            setReconnectAttempts(prev => prev + 1);
            
            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
            
            setTimeout(() => {
                // Check if we should still reconnect (not manually disconnected in the meantime)
                if (!isManualDisconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    connectWebSocket(sessionId);
                }
            }, delay);
        }
    });

    socketRef.current.addEventListener('pong', (data) => {
      console.log('Pong received:', data);
      // Update network metrics
      if (window.networkAdaptiveManager) {
        window.networkAdaptiveManager.handlePong(data);
      }
    });

    socketRef.current.addEventListener('reconnect', (data) => {
      console.log('WebSocket reconnecting:', data);
      setWebSocketError('重新连接中...');
    });

    // Start the connection AFTER all event listeners are registered
    socketRef.current.connect().catch(err => {
      console.error('WebSocket connection failed:', err);
      setWebSocketError('连接失败，请刷新页面重试');
    });

    // Start network monitoring
    if (window.networkAdaptiveManager) {
      window.networkAdaptiveManager.startMonitoring();
    }

  }, [token, sessionId, playAudioChunk, handleJsonMessage, user]);

  // Init Session
  useEffect(() => {
    const init = async () => {
      if (!user?.id || !token) return; // Wait for full auth
      
      // Don't auto-reconnect on every render - only on initial mount or manual retry
      if (isManualDisconnect) {
        console.log('Manual disconnect detected, skipping auto-init');
        return;
      }

      // Check URL for sessionId (e.g., ?sessionId=...)
      const searchParams = new URLSearchParams(window.location.search);
      const urlSessionId = searchParams.get('sessionId') || searchParams.get('session'); // Support both
      const scenario = searchParams.get('scenario') || location.state?.scenario;
      const topic = searchParams.get('topic');

      // Refresh Tasks if missing (Page Refresh)
      if (!location.state?.tasks && scenario) {
          try {
              console.log('Attempting to restore tasks for scenario:', scenario);
              console.log('Current location.state:', location.state);
              
              const goalRes = await userAPI.getActiveGoal();
              console.log('getActiveGoal response:', goalRes);
              
              let scenarios = [];
              let activeScenario = null;
              
              if (goalRes && goalRes.goal && goalRes.goal.scenarios) {
                  console.log('Available Scenarios:', goalRes.goal.scenarios.map(s => s.title));
                  console.log('Requested Scenario:', scenario);
                  scenarios = goalRes.goal.scenarios;
                  activeScenario = goalRes.goal.scenarios.find(s => s.title.trim() === scenario.trim());
                  console.log('Found active scenario:', activeScenario);
              } else {
                  console.log('No goal found, using default scenarios');
                  
                  // Determine goal type from scenario name
                  let goalType = 'daily_conversation'; // default
                  if (scenario.toLowerCase().includes('business') || scenario.toLowerCase().includes('meeting')) {
                      goalType = 'business_meeting';
                  } else if (scenario.toLowerCase().includes('travel') || scenario.toLowerCase().includes('airport')) {
                      goalType = 'travel_survival';
                  } else if (scenario.toLowerCase().includes('exam') || scenario.toLowerCase().includes('test')) {
                      goalType = 'exam_prep';
                  } else if (scenario.toLowerCase().includes('presentation') || scenario.toLowerCase().includes('speech')) {
                      goalType = 'presentation';
                  }
                  
                  scenarios = DEFAULT_SCENARIOS[goalType] || DEFAULT_SCENARIOS.daily_conversation;
                  activeScenario = scenarios.find(s => s.title.trim() === scenario.trim());
                  
                  if (!activeScenario) {
                      // Try to find a similar scenario
                      activeScenario = scenarios.find(s => 
                          s.title.toLowerCase().includes(scenario.toLowerCase()) ||
                          scenario.toLowerCase().includes(s.title.toLowerCase())
                      );
                  }
                  
                  if (!activeScenario && scenarios.length > 0) {
                      // Use first scenario as fallback
                      activeScenario = scenarios[0];
                  }
              }
              
              if (activeScenario && activeScenario.tasks) {
                  console.log('Setting tasks from active scenario:', activeScenario.tasks);
                  setTasks(activeScenario.tasks);
                  console.log('Restored tasks from active goal:', activeScenario.tasks);
              } else {
                  console.warn('Scenario not found in active goal or no tasks');
                  console.log('All scenarios:', scenarios);
              }
          } catch (e) {
              console.error('Failed to restore tasks from goal:', e);
              console.error('Error details:', e.message, e.stack);
              
              // Final fallback - use default scenarios
              console.log('Using default scenarios due to error');
              const defaultScenarios = DEFAULT_SCENARIOS.daily_conversation;
              const activeScenario = defaultScenarios.find(s => s.title.trim() === scenario.trim()) || defaultScenarios[0];
              
              if (activeScenario && activeScenario.tasks) {
                  setTasks(activeScenario.tasks);
                  console.log('Restored tasks from default scenarios:', activeScenario.tasks);
              }
          }
      } else {
          console.log('Tasks refresh skipped - location.state.tasks:', location.state?.tasks, 'scenario:', scenario);
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
                  if (historyRes && historyRes.messages && historyRes.messages.length > 0) {
                      effectiveSessionId = storedSessionId;
                      // Load history messages into state
                      // Set audioPlayed: true to prevent auto-play on page refresh
                      const historyMessages = historyRes.messages.map(msg => ({
                          type: msg.role === 'user' ? 'user' : 'ai',
                          content: msg.content,
                          audioUrl: msg.audioUrl,
                          isFinal: true,
                          audioPlayed: true
                      }));
                      setMessages(prev => {
                          // Keep initial system message, add history
                          const systemMsg = prev.find(m => m.type === 'system');
                          return systemMsg ? [systemMsg, ...historyMessages] : historyMessages;
                      });
                      console.log('Loaded history messages:', historyMessages.length);
                  }
              } catch (err) {
                  console.log('Stored session not valid, will create new one:', err);
                  // Clear invalid session from storage
                  localStorage.removeItem(`session_${scenario}`);
              }
          }
      }

      // If still no session ID, create a new one
      if (!effectiveSessionId) {
          effectiveSessionId = crypto.randomUUID();
      }

      // Persist session ID for this scenario
      if (scenario) {
          localStorage.setItem(`session_${scenario}`, effectiveSessionId);
      }

      setSessionId(effectiveSessionId);
      
      // Set current scenario info
      if (scenario) {
          setCurrentScenarioTitle(scenario);
      }
      if (location.state?.allScenarios) {
          setAllScenarios(location.state.allScenarios);
      }
      if (location.state?.currentIndex !== undefined) {
          setCurrentScenarioIndex(location.state.currentIndex);
      }

      // Connect WebSocket with the effective session ID (state may not be updated yet)
      connectWebSocket(effectiveSessionId);
    };

    init();
  }, [token, user, isManualDisconnect]); // Removed connectWebSocket from dependencies to prevent infinite loop

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-play AI audio when messages get audio URLs
  useEffect(() => {
    messages.forEach((message, index) => {
      // Only auto-play if explicitly marked as not played (audioPlayed === false)
      // Don't auto-play if audioPlayed is undefined or true
      if (message.type === 'ai' && message.audioUrl && message.audioPlayed === false) {
        // Mark message as played to prevent repeated playback
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[index] = { ...newMessages[index], audioPlayed: true };
          return newMessages;
        });

        // Play the audio
        console.log(`[AutoPlay] Playing AI audio for message ${index}:`, message.audioUrl);
        playFullAudio(message.audioUrl);
      }
    });
  }, [messages]);

  // Handle text selection for TTS
  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => document.removeEventListener('mouseup', handleTextSelection);
  }, []);

  // --- Recorder Callbacks ---

  const handleRecordingStart = () => {
    // CRITICAL: Check WebSocket connection before allowing recording
    const wsReadyState = socketRef.current?.getReadyState?.() || socketRef.current?.readyState;
    if (!isConnected || wsReadyState !== WebSocket.OPEN) {
        console.error('❌ Cannot start recording: WebSocket not connected, state:', wsReadyState);
        alert('AI 导师尚未连接，请稍后再试');
        return;
    }

    isInterruptedRef.current = false; // Reset flag for new turn
    const newId = Date.now().toString();
    currentUserMessageIdRef.current = newId; // New turn ID

    // Always stop audio playback immediately (interrupt AI response)
    stopAudioPlayback();
    isInterruptedRef.current = true; // Mark as interrupted

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

    // Send interruption signal to backend
    console.log('🔇 Interruption triggered - stopping AI response and starting new turn');
    if (socketRef.current?.getReadyState?.() === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'user_interruption' }));
    }
  };

  const handleRecordingStop = () => {
    const wsReadyState = socketRef.current?.getReadyState?.() || socketRef.current?.readyState;
    console.log('🎤 handleRecordingStop called, WebSocket state:', wsReadyState);

    // Wait for WebSocket to be ready before sending
    if (wsReadyState !== WebSocket.OPEN) {
        console.log('⏳ WebSocket not ready (state:', wsReadyState, '), waiting for connection...');
        
        // Wait for connection with timeout
        const waitForConnection = () => {
            const checkReady = () => {
                const currentState = socketRef.current?.getReadyState?.() || socketRef.current?.readyState;
                if (currentState === WebSocket.OPEN) {
                    console.log('✅ WebSocket now ready, sending user_audio_ended');
                    socketRef.current.send(JSON.stringify({ type: 'user_audio_ended' }));
                } else if (currentState === WebSocket.CONNECTING) {
                    // Still connecting, check again in 100ms
                    setTimeout(checkReady, 100);
                } else {
                    console.error('❌ WebSocket failed to connect (state:', currentState, ')');
                    setWebSocketError('连接失败，请刷新页面重试');
                }
            };
            checkReady();
        };
        
        // Set timeout to give up after 10 seconds
        setTimeout(() => {
            const finalState = socketRef.current?.getReadyState?.() || socketRef.current?.readyState;
            if (finalState !== WebSocket.OPEN) {
                console.error('❌ WebSocket connection timeout after waiting');
                setWebSocketError('连接超时，请刷新页面重试');
            }
        }, 10000);
        
        waitForConnection();
        return;
    }

    console.log('📤 Sending user_audio_ended');
    socketRef.current.send(JSON.stringify({ type: 'user_audio_ended' }));
    console.log('✅ user_audio_ended sent, keeping WebSocket open for AI response');
  };

  const handleRecordingCancel = () => {
    const wsReadyState = socketRef.current?.getReadyState?.() || socketRef.current?.readyState;
    if (wsReadyState === WebSocket.OPEN || wsReadyState === WebSocket.CONNECTING) {
        socketRef.current.send(JSON.stringify({ type: 'user_audio_cancelled' }));
    }
    const cancelId = currentUserMessageIdRef.current;
    setMessages(prev => prev.filter(m => !(m.type === 'user' && m.id === cancelId)));
    isInterruptedRef.current = false;
  };

  const handleAudioData = (data) => {
    const wsReadyState = socketRef.current?.getReadyState?.() || socketRef.current?.readyState;
    if (wsReadyState === WebSocket.OPEN) {
        socketRef.current.send(data);
    } else if (wsReadyState === WebSocket.CONNECTING) {
        // Queue audio data for when connection opens
        console.log('⏳ WebSocket connecting, queuing audio data');
        socketRef.current.send(data);
    } else {
        console.warn('⚠️ Cannot send audio data - WebSocket not connected, state:', wsReadyState);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-background-light dark:bg-background-dark relative">
      {/* Task Sidebar/Overlay */}
      {showTasks && (
          <div className={`fixed top-20 right-4 z-20 w-48 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 p-4 transition-transform duration-300 ${showTasks ? 'translate-x-0' : 'translate-x-[110%]'}`}>
              <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-xs uppercase tracking-wide text-slate-500">Mission Tasks</h3>
                  <button onClick={() => setShowTasks(false)} className="text-slate-400 hover:text-slate-600">
                      <span className="material-symbols-outlined text-sm">close</span>
                  </button>
              </div>
              <ul className="space-y-2">
                  {tasks.length > 0 ? (
                      tasks.map((task, idx) => {
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
                      })
                  ) : tasksLoading ? (
                      <li key="loading" className="text-xs text-slate-500">Loading tasks...</li>
                  ) : null}
              </ul>
          </div>
      )}
      
      {/* Toggle Tasks Button */}
      {(tasks.length > 0 || location.state?.scenario || new URLSearchParams(window.location.search).get('scenario')) && !showTasks && (
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
              enableCompression={true}
              enableMetrics={true}
            />
            
            {/* WebSocket Error Display with Retry Button */}
            {webSocketError && (
                <div className="flex items-center gap-3 w-full max-w-md">
                    <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-full flex-1">
                        {webSocketError}
                    </p>
                    
                    {/* Retry Button - show when connection fails or max attempts reached */}
                    <button
                        onClick={handleManualRetry}
                        className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-red-200 dark:hover:bg-red-900/50 transition animate-pulse"
                    >
                        <span className="material-symbols-outlined text-sm">refresh</span>
                        <span>重试</span>
                    </button>
                </div>
            )}
            
            {/* Connection Status Indicator */}
            {!isConnected && !webSocketError && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-1 rounded-full">
                    正在连接 AI 导师...
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