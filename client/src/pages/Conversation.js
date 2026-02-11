import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { conversationAPI, aiAPI, userAPI } from '../services/api';
import { getAuthHeaders } from '../services/api';
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
  const [welcomeMessageShown, setWelcomeMessageShown] = useState(false); // Track if welcome message has been shown

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
          // Show tasks if we have tasks AND they're not all completed, OR if scenarios haven't loaded yet
          const shouldShowTasks = tasks.length > 0 && (hasIncompleteTasks || allScenarios.length === 0);
          setShowTasks(shouldShowTasks);
          console.log('Set showTasks to:', shouldShowTasks, 'hasIncompleteTasks:', hasIncompleteTasks, 'allScenarios.length:', allScenarios.length);

          // Check if all object tasks are completed
          const allCompleted = objectTaskCount > 0 && completedCount === objectTaskCount;

          // Trigger completion modal only once
          if (allCompleted && !completionCheckedRef.current) {
              completionCheckedRef.current = true;
              const avgScore = Math.round(totalScore / objectTaskCount);
              setScenarioScore(avgScore);
              setShowCompletionModal(true);
          }
      } else {
          console.log('No tasks to initialize'); // Debug log
          // If no tasks but we Have scenario info, we might get tasks later
          const searchParams = new URLSearchParams(window.location.search);
          const scenarioFromUrl = searchParams.get('scenario');
          const scenarioFromState = location.state?.scenario;
          // Show tasks panel if we have scenario info (tasks might load later)
          const shouldShowTasks = !!(scenarioFromUrl || scenarioFromState);
          setShowTasks(shouldShowTasks);
          console.log('Set showTasks based on scenario info:', shouldShowTasks, 'scenarioFromUrl:', scenarioFromUrl, 'scenarioFromState:', scenarioFromState);
      }
  }, [tasks, allScenarios.length, location.state?.scenario]);

  // Separate Effect: Fetch Tasks if missing (Page Refresh) + set scenario info
  useEffect(() => {
      console.log('Checking for tasks on page load/refresh'); // Debug log
      const searchParams = new URLSearchParams(window.location.search);
      const scenarioParam = searchParams.get('scenario');
      // Get scenario from URL or state
      const scenarioName = scenarioParam
          ? decodeURIComponent(scenarioParam)
          : location.state?.scenario;

      console.log('Scenario name from URL or state:', scenarioName); // Debug log
      console.log('Current tasks state:', tasks); // Debug log

      if (scenarioName) {
          setCurrentScenarioTitle(scenarioName);
      }

      if (scenarioName && user && token) {
          setTasksLoading(true); // Set loading state
          console.log('Fetching active goal to get tasks for scenario:', scenarioName); // Debug log
          
          // Always fetch from API to ensure we have the latest data
          userAPI.getActiveGoal().then(res => {
              console.log('Active goal response:', res); // Debug log
              console.log('Goal data structure:', JSON.stringify(res.goal, null, 2)); // Debug log
              
              let scenarios = [];
              let goalData = null;
              
              if (res && res.goal && res.goal.scenarios) {
                  goalData = res.goal;
                  scenarios = res.goal.scenarios;
                  console.log('Using goal scenarios from API');
              } else {
                  // Fallback to default scenarios if no goal found
                  console.log('No goal found, using default scenarios');
                  
                  // Try to determine goal type from scenario name
                  let goalType = 'daily_conversation'; // default
                  if (scenarioName.toLowerCase().includes('business') || scenarioName.toLowerCase().includes('meeting')) {
                      goalType = 'business_meeting';
                  } else if (scenarioName.toLowerCase().includes('travel') || scenarioName.toLowerCase().includes('airport')) {
                      goalType = 'travel_survival';
                  } else if (scenarioName.toLowerCase().includes('exam') || scenarioName.toLowerCase().includes('test')) {
                      goalType = 'exam_prep';
                  } else if (scenarioName.toLowerCase().includes('presentation') || scenarioName.toLowerCase().includes('speech')) {
                      goalType = 'presentation';
                  }
                  
                  goalData = {
                      type: goalType,
                      target_language: 'English',
                      target_level: 'Intermediate',
                      scenarios: DEFAULT_SCENARIOS[goalType] || DEFAULT_SCENARIOS.daily_conversation
                  };
                  scenarios = goalData.scenarios;
              }
              
              // Store all scenarios for navigation
              setAllScenarios(scenarios);

              // Find current scenario index (case-insensitive)
              const scenarioIndex = scenarios.findIndex(s =>
                  s.title.trim().toLowerCase() === scenarioName.trim().toLowerCase()
              );
              console.log('Found scenario index:', scenarioIndex); // Debug log
              if (scenarioIndex !== -1) {
                  setCurrentScenarioIndex(scenarioIndex);
                  setCurrentScenarioTitle(scenarios[scenarioIndex].title);
              }

              // Always set tasks from API response or default to ensure consistency
              if (scenarioIndex !== -1) {
                  const activeScenario = scenarios[scenarioIndex];
                  if (activeScenario && activeScenario.tasks) {
                      setTasks(activeScenario.tasks);
                      console.log('Tasks fetched and set:', activeScenario.tasks);
                      // Update showTasks to true since we now have tasks
                      setShowTasks(true);
                  } else {
                      console.log('No tasks found for scenario');
                      // Still show the task panel even if no tasks, so user knows what scenario they're in
                      setShowTasks(true);
                  }
              } else {
                  console.log('Scenario not found in available scenarios');
                  // Try to find a similar scenario or use first one
                  const similarScenario = scenarios.find(s => 
                      s.title.toLowerCase().includes(scenarioName.toLowerCase()) ||
                      scenarioName.toLowerCase().includes(s.title.toLowerCase())
                  );
                  if (similarScenario && similarScenario.tasks) {
                      setTasks(similarScenario.tasks);
                      setCurrentScenarioTitle(similarScenario.title);
                      setShowTasks(true);
                      console.log('Using similar scenario:', similarScenario.title);
                  } else if (scenarios.length > 0 && scenarios[0].tasks) {
                      // Use first scenario as fallback
                      setTasks(scenarios[0].tasks);
                      setCurrentScenarioTitle(scenarios[0].title);
                      setShowTasks(true);
                      console.log('Using first scenario as fallback:', scenarios[0].title);
                  } else {
                      setShowTasks(true);
                  }
              }
          }).catch(err => {
              console.error('Task fetch error:', err);
              console.log('Error details:', err.message, err.stack);
              
              // Even if fetch fails, use default scenarios
              console.log('Using default scenarios due to API error');
              const defaultScenarios = DEFAULT_SCENARIOS.daily_conversation;
              setAllScenarios(defaultScenarios);
              
              // Try to find matching scenario
              const scenarioIndex = defaultScenarios.findIndex(s =>
                  s.title.trim().toLowerCase() === scenarioName.trim().toLowerCase()
              );
              
              if (scenarioIndex !== -1) {
                  setTasks(defaultScenarios[scenarioIndex].tasks);
                  setCurrentScenarioTitle(defaultScenarios[scenarioIndex].title);
              } else {
                  // Use first scenario as fallback
                  setTasks(defaultScenarios[0].tasks);
                  setCurrentScenarioTitle(defaultScenarios[0].title);
              }
              
              setShowTasks(true);
          }).finally(() => {
              setTasksLoading(false); // Clear loading state
          });
      } else {
          console.log('Missing scenarioName, user, or token - conditions not met for fetching tasks');
          setTasksLoading(false); // Clear loading state if conditions aren't met
          // Still show tasks if we have them from state
          if (tasks.length > 0) {
              setShowTasks(true);
          }
      }
  }, [user, token, location.state?.scenario, location.search]); // Run when auth is ready, state changes, or URL search params change
  
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
      console.log('Received message from AI service:', data); // Debug log
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
                  // Check if this is a welcome message that duplicates the initial system message
                  const lowerContent = content.toLowerCase();
                  const isWelcomeMessage = lowerContent.includes('hello') || 
                                          lowerContent.includes('hi ') || 
                                          lowerContent.includes('ready') ||
                                          lowerContent.includes('welcome') ||
                                          lowerContent.includes('连接成功') ||  // Chinese for "connection successful"
                                          lowerContent.includes('开始说话') ||  // Chinese for "start speaking"
                                          lowerContent.includes('导师') ||     // Chinese for "tutor"
                                          lowerContent.includes('practice');
                  
                  // Skip duplicate welcome messages if we have conversation history
                  // Only skip if we have other messages in the conversation (not the first message)
                  const hasConversationHistory = prev.some(msg =>
                    (msg.type === 'ai' && !msg.content.includes('连接AI导师') && !msg.content.includes('新会话开始')) ||
                    msg.type === 'user'
                  );
                  
                  if (isWelcomeMessage && hasConversationHistory) {
                      console.log('Skipping duplicate welcome message:', content);
                      return prev;
                  }

                  // Find the matching AI message by responseId (search from end)
                  if (responseId) {
                      for (let i = prev.length - 1; i >= 0; i--) {
                          if (prev[i].type === 'ai' && prev[i].responseId === responseId && !prev[i].isFinal) {
                              // Found matching message, append to it
                              const updated = [...prev];
                              updated[i] = { ...updated[i], content: updated[i].content + content };
                              console.log('Updated existing AI message with responseId:', responseId, 'New content:', updated[i].content);
                              return updated;
                          }
                      }
                  }

                  // Fallback: check if last message is an in-progress AI message without responseId
                  const last = prev[prev.length - 1];
                  if (last && last.type === 'ai' && !last.isFinal && !last.responseId) {
                      const updated = [...prev.slice(0, -1), { ...last, content: last.content + content, responseId }];
                      console.log('Updated last AI message without responseId:', last.content + content);
                      return updated;
                  }

                  // Create new AI message
                  const newMessage = { type: 'ai', content: content, speaker: currentRoleRef.current, isFinal: false, responseId };
                  console.log('Created new AI message:', newMessage);
                  return [...prev, newMessage];
              });
          }
          break;
        case 'response.audio.done':
          setMessages(prev => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                  if (updated[i].type === 'ai' && !updated[i].isFinal) {
                      updated[i] = { ...updated[i], isFinal: true };
                      console.log('Marked AI message as final:', updated[i]);
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
        default:
           console.log('Unhandled message type:', data.type);
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
      // Only show connection success message if we don't have any conversation history yet
      // This prevents showing duplicate welcome messages when reconnecting to an existing session
      setMessages(prev => {
        // Check if we already have user or AI messages (not counting initial system messages)
        const hasConversationHistory = prev.some(msg =>
          msg.type === 'user' ||
          (msg.type === 'ai' && !msg.content.includes('连接AI导师') && !msg.content.includes('新会话开始'))
        );

        if (!hasConversationHistory) {
          return [...prev, { type: 'system', content: '连接成功！请按住麦克风开始说话。' }];
        }
        return prev;
      });
      setWebSocketError(null);

      // Send session_start handshake
      const searchParams = new URLSearchParams(window.location.search);
      const payload = {
          type: 'session_start',
          userId: user.id,
          sessionId: sessionId,
          token: token,
          scenario: searchParams.get('scenario'),
          topic: searchParams.get('topic'),
          // Indicate that this is a restoration of an existing session, not a new one
          isRestoration: true
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

    socketRef.current.onclose = async (event) => {
        console.log('WebSocket Closed:', event.code, event.reason);
        setIsConnected(false);

        // Save conversation history when connection closes
        await saveConversationHistory();

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
              console.log('Fetching history for session:', effectiveSessionId);
              const historyRes = await conversationAPI.getHistory(effectiveSessionId);
              console.log('History response:', historyRes);
              
              // handleResponse returns `data.data` (the conversation object)
              if (historyRes && historyRes.messages) {
                  console.log('Found messages in history:', historyRes.messages.length);
                  console.log('Last few messages:', historyRes.messages.slice(-3).map(m => ({role: m.role, content: m.content?.substring(0, 50)})));
                  
                  const restoredMessages = historyRes.messages.map((m, index) => {
                      console.log(`Processing message ${index}: role=${m.role}, content='${m.content?.substring(0, 100)}...'`);
                      const mappedMessage = {
                          type: m.role === 'user' ? 'user' : 'ai',
                          content: m.content,
                          isFinal: true, // History is always final
                          audioUrl: m.audioUrl || null,
                          speaker: m.role === 'user' ? 'Me' : 'OralTutor' // Basic mapping
                      };
                      console.log(`Mapped message ${index}:`, mappedMessage);
                      return mappedMessage;
                  });

                  // Just show history. If empty, show welcome.
                  if (restoredMessages.length > 0) {
                      console.log('Setting restored messages:', restoredMessages.length);
                      console.log('Last few restored messages:', restoredMessages.slice(-3).map((m, i) => ({index: restoredMessages.length - 3 + i, type: m.type, content: m.content?.substring(0, 50)})));
                      setMessages(restoredMessages);
                      // Mark that we have history, so no need to show welcome message
                      setWelcomeMessageShown(true);
                  } else {
                      // Keep or set default system message
                      console.log('No messages found, setting default welcome message');
                      setMessages([{ type: 'system', content: '新会话开始，请点击麦克风说话。' }]);
                      setWelcomeMessageShown(false);
                  }
              } else {
                  console.log('No history found or invalid response:', historyRes);
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
                          setWelcomeMessageShown(false);
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
                
                // For new sessions, set initial message
                setMessages([{ type: 'system', content: '正在连接AI导师...' }]);
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

  // Save conversation history when component unmounts
  useEffect(() => {
    return () => {
      saveConversationHistory();
    };
  }, [sessionId, messages, user]);


  // Function to save conversation history to backend
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

      console.log(`Saving ${messagesToSave.length} messages to session ${sessionId}`);
      
      // Save to history-analytics-service via conversationAPI
      // Using POST /conversation endpoint which handles both new and existing sessions
      const response = await fetch(`${process.env.REACT_APP_API_URL || '/api'}/conversation/history/${sessionId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          userId: user?.id,
          messages: messagesToSave
        })
      });
      
      if (!response.ok) {
        console.error('Failed to save conversation history:', response.status, response.statusText);
        // Attempt to read response body for more details
        const errorText = await response.text();
        console.error('Error details:', errorText);
        
        // If service is unavailable, try to save using the conversation service instead
        if (response.status === 503) {
          console.log('History service unavailable, attempting to save via conversation service');
          try {
            // Try to save via conversation service which might route to history service
            const convResponse = await fetch(`${process.env.REACT_APP_API_URL || '/api'}/conversation/history/${sessionId}`, {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                messages: messagesToSave
              })
            });
            
            if (!convResponse.ok) {
              console.error('Failed to save via conversation service:', convResponse.status, convResponse.statusText);
              const convErrorText = await convResponse.text();
              console.error('Conversation service error details:', convErrorText);
            } else {
              console.log('Conversation history saved via conversation service successfully');
            }
          } catch (convError) {
            console.error('Network error saving via conversation service:', convError);
          }
        }
      } else {
        console.log('Conversation history saved successfully');
      }
    } catch (error) {
      console.error('Error saving conversation history:', error);
      // Attempt fallback save method
      try {
        // Try to save via conversation service which might route to history service
        const convResponse = await fetch(`${process.env.REACT_APP_API_URL || '/api'}/conversation/history/${sessionId}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            userId: user?.id,
            messages: messages.map(msg => ({
              role: msg.type === 'user' ? 'user' : 'assistant',
              content: msg.content,
              audioUrl: msg.audioUrl || null
            })).filter(msg => msg.content) // Only save messages with content
          })
        });
        
        if (convResponse.ok) {
          console.log('Conversation history saved via fallback method successfully');
        } else {
          console.error('Fallback save also failed:', convResponse.status, convResponse.statusText);
        }
      } catch (fallbackError) {
        console.error('Fallback save failed with network error:', fallbackError);
      }
    }
  };

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
      {showTasks && ( // Show if showTasks is true (controlled by state)
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
                      // Show loading state if tasks are expected but not loaded yet
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
          console.log(`Rendering message ${index}: type=${msg.type}, content='${msg.content?.substring(0, 50)}...'`);
          
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

          console.log(`Message ${index} displayContent: '${displayContent}'`);

          if (!isAI && (!displayContent || displayContent === '...')) {
            console.log(`Filtering out user message ${index} due to empty content`);
            return null;
          }
          if (isAI && !displayContent) {
            console.log(`Filtering out AI message ${index} due to empty content`);
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