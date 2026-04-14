import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { conversationAPI, aiAPI, userAPI } from '../services/api';
import { getAuthHeaders } from '../services/api';
import RealTimeRecorder from '../components/RealTimeRecorder';
import { AiAvatar } from '../components/AiAvatar';
import { PracticeReport } from '../components/PracticeReport';
import { MessageBubble } from '../components/MessageBubble';
import { useAuth } from '../contexts/AuthContext';
import AudioBar from '../components/AudioBar.jsx'; // Import the new AudioBar component
import NetworkAdaptiveManager from '../utils/network-adaptive-manager';
import OptimizedWebSocket from '../utils/websocket-optimized';

const MAGIC_TIPS = [
  '点击消息气泡右侧的喇叭图标，可重听 AI 的示范发音。',
  '跟读时保持和 AI 相同的语速和停顿，节奏感是流利度的关键。',
  '背诵时先回想句子结构，再补充词汇细节，效果更好。',
  '遇到长句，可拆成 2-3 个短片段分别练习，再连起来说。',
  '重复 3-5 次才能真正记住一个句型，不用担心次数多。',
  '闭眼想象句子的画面，有助于将语言与情景绑定记忆。',
  '说出来的速度不需要追求完美，意思准确是第一步。',
];

function Conversation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token, loading } = useAuth(); // Added loading state
  
  // UI States
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [currentRole, setCurrentRole] = useState('OralTutor'); // Default role
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isUserRecording, setIsUserRecording] = useState(false);
  const [webSocketError, setWebSocketError] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [selection, setSelection] = useState({ text: '', x: 0, y: 0, visible: false });
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [playingAudioUrl, setPlayingAudioUrl] = useState(null);
  const [taskBarFaded, setTaskBarFaded] = useState(false);
  const taskBarFadeTimerRef = useRef(null);
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

  // localStorage key helper — encodes scenario name to prevent key injection via crafted URLs
  const _lsScenarioKey = (prefix, raw) => `${prefix}${encodeURIComponent(raw || '')}`;

  // Scenario Tasks State
  // Initialize as empty - will be populated from backend in useEffect
  const [tasks, setTasks] = useState([]);
  const [completedTasks, setCompletedTasks] = useState(new Set());
  
  // Task Progress State (for progress bar)
  const [currentTaskProgress, setCurrentTaskProgress] = useState(() => {
    // Try to load from localStorage for persistence
    const searchParams = new URLSearchParams(window.location.search);
    const scenario = searchParams.get('scenario') || location.state?.scenario;
    if (scenario) {
      const saved = localStorage.getItem(_lsScenarioKey('task_progress_', scenario));
      return saved ? parseInt(saved, 10) : 0;
    }
    return 0;
  });
  const [currentTaskScore, setCurrentTaskScore] = useState(0);
  const [engagementLevel, setEngagementLevel] = useState('中'); // 高/中/低
  const previousProgressRef = useRef(0); // Track previous progress to prevent unreasonable jumps
  
  // Initialize showTasks based on whether we have scenario info
  // Tasks will be loaded from backend, so we show tasks if scenario is specified
  const [showTasks, setShowTasks] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const scenarioFromUrl = searchParams.get('scenario');
    const scenarioFromState = location.state?.scenario;
    // Show tasks if we have scenario info (tasks will be loaded from backend)
    return !!scenarioFromUrl || !!scenarioFromState;
  });
  
  // Track if tasks are loading to prevent showing "Loading tasks" when we know tasks exist
  const [tasksLoading, setTasksLoading] = useState(false);
  
  // Scenario Completion State
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [scenarioScore, setScenarioScore] = useState(0);
  const [scenarioReviewData, setScenarioReviewData] = useState(null); // Store review data for AI feedback
  const [allScenarios, setAllScenarios] = useState([]);
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
  const [currentScenarioTitle, setCurrentScenarioTitle] = useState('');
  const completionCheckedRef = useRef(false); // Prevent duplicate modal triggers
  const hasViewedCompletionModalRef = useRef(false); // Track if user has already viewed and closed the modal

  // 双阶段 UI State（Magic Repetition 和 Scene Theater）
  // useRef 保证只在首次挂载时读取 URL，避免每次 render 重新解析
  const isRecallMode = useRef(new URLSearchParams(window.location.search).get('mode') === 'recall').current;
  const [currentPhase, setCurrentPhase] = useState(isRecallMode ? 'magic_repetition' : 'scene_theater');
  const currentPhaseRef = useRef(isRecallMode ? 'magic_repetition' : 'scene_theater');
  const [sceneImageUrl, setSceneImageUrl] = useState(null);
  const [magicPassedTasks, setMagicPassedTasks] = useState(() => {
    try {
      const sc = new URLSearchParams(window.location.search).get('scenario') || '';
      const stored = sc && localStorage.getItem(_lsScenarioKey('magic_passed_', sc));
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  }); // task indices that passed magic（localStorage 持久化，key: magic_passed_{scenario}）
  const [theaterCompletedTasks, setTheaterCompletedTasks] = useState(new Set());
  const [aiFeedback, setAiFeedback] = useState('');
  const [dailyScenariosUsed, setDailyScenariosUsed] = useState(0);
  const [currentMagicSentence, setCurrentMagicSentence] = useState(() => {
    try {
      const sc = new URLSearchParams(window.location.search).get('scenario') || '';
      return sc ? (localStorage.getItem(_lsScenarioKey('magic_sentence_', sc)) || '') : '';
    } catch { return ''; }
  }); // 魔法重复阶段当前需复述的句子（持久化到 localStorage，key: magic_sentence_{scenario}）
  const [magicCardState, setMagicCardState] = useState('waiting'); // 'waiting'|'reciting'|'passed'
  const [magicCardCovered, setMagicCardCovered] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);

  const getScoreFeedback = (score, reviewData = null) => {
    const stripEmoji = (s) => s.replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, ''
    ).trim();

    if (reviewData) {
        const parts = [];

        // 1. analysis.summary — 最个性化：含实际轮数、任务数、平均分，后端已语言感知
        const summary = reviewData.analysis?.summary;
        if (summary && typeof summary === 'string') {
            parts.push(stripEmoji(summary));
        }

        // 2. 首条 recommendations — 具体改进建议，后端已按 native_language 生成
        const recs = reviewData.recommendations;
        if (Array.isArray(recs) && recs.length > 0) {
            const rec = stripEmoji(recs[0]);
            // 只在与 summary 不同时追加，避免重复
            if (rec && rec !== parts[0]) {
                parts.push(rec);
            }
        }

        if (parts.length > 0) {
            return { emoji: '', text: parts.join('\n'), level: 'excellent' };
        }
    }

    // Fallback：无 reviewData 时按分数给出简洁反馈
    if (score >= 90) return { emoji: '', text: '表现优秀，表达流利自然，词汇使用准确。', level: 'excellent' };
    if (score >= 75) return { emoji: '', text: '表现良好，表达清晰准确，可继续练习复杂句型。', level: 'good' };
    if (score >= 60) return { emoji: '', text: '进步明显，建议多练习口语表达的流畅度。', level: 'fair' };
    return { emoji: '', text: '建议继续练习，多听多说以提高表达能力。', level: 'needsWork' };
  };

  // 查询每日场景数（mount 时，使用 localStorage）
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10); // '2026-03-30'
    const key = `daily_scenarios_${today}`;
    const count = parseInt(localStorage.getItem(key) || '0', 10);
    setDailyScenariosUsed(Math.min(count, 3));
  }, []);

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
          // Only show if user hasn't already viewed and closed the modal
          if (objectTaskCount > 0 && completedCount === objectTaskCount &&
              !completionCheckedRef.current && !hasViewedCompletionModalRef.current) {
              completionCheckedRef.current = true;
              
              // Fetch scenario review from backend for personalized AI feedback
              const fetchReviewAndShowModal = async () => {
                  try {
                      const review = await userAPI.getScenarioReview(currentScenarioTitle);
                      if (review) {
                          console.log('📊 Fetched scenario review:', review);
                          setScenarioReviewData(review);
                      }
                  } catch (error) {
                      console.error('Failed to fetch scenario review:', error);
                  } finally {
                      // Show modal after 1 second delay; clear magic progress for this scenario
                      setTimeout(() => {
                          setShowCompletionModal(true);
                          try {
                              const sc = new URLSearchParams(window.location.search).get('scenario') || '';
                              if (sc) localStorage.removeItem(_lsScenarioKey('magic_passed_', sc));
                              if (sc) localStorage.removeItem(_lsScenarioKey('magic_sentence_', sc));
                          } catch {}
                      }, 1000);
                  }
              };
              fetchReviewAndShowModal();
          }
      }
  }, [tasks, allScenarios]);

  // 同步 currentPhase → ref（供 handleJsonMessage 等 callback 读取）
  useEffect(() => { currentPhaseRef.current = currentPhase; }, [currentPhase]);

  // 持久化 currentMagicSentence → localStorage（刷新页面后可恢复，key: magic_sentence_{scenario}）
  useEffect(() => {
    try {
      const sc = new URLSearchParams(window.location.search).get('scenario') || '';
      if (!sc) return;
      if (currentMagicSentence) {
        localStorage.setItem(_lsScenarioKey('magic_sentence_', sc), currentMagicSentence);
      } else {
        localStorage.removeItem(_lsScenarioKey('magic_sentence_', sc));
      }
    } catch {}
  }, [currentMagicSentence]);

  // Tips 轮播（魔法重复 waiting 阶段每 9s 切换）
  useEffect(() => {
    if (currentPhase !== 'magic_repetition' || magicCardState !== 'waiting') return;
    const timer = setInterval(() => {
      setTipIndex(prev => (prev + 1) % MAGIC_TIPS.length);
    }, 9000);
    return () => clearInterval(timer);
  }, [currentPhase, magicCardState]);

  // 监听 showCompletionModal，当显示时增加每日场景计数
  useEffect(() => {
    if (showCompletionModal) {
      const today = new Date().toISOString().slice(0, 10);
      const key = `daily_scenarios_${today}`;
      const count = parseInt(localStorage.getItem(key) || '0', 10);
      const newCount = Math.min(count + 1, 3);
      localStorage.setItem(key, String(newCount));
      setDailyScenariosUsed(newCount);
    }
  }, [showCompletionModal]);

  // Audio context and refs
  const audioContextRef = useRef(null);
  const nextStartTimeRef = useRef(0);
  const audioQueueRef = useRef([]);
  const isInterruptedRef = useRef(false);
  const currentUserMessageIdRef = useRef(null);
  const currentRecordingSessionIdRef = useRef(null); // Track current recording session to ignore cancelled audio
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const lastProficiencyUpdateRef = useRef(null); // Track last processed proficiency update to prevent duplicates
  const recorderRef = useRef(null); // Ref for RealTimeRecorder to control session ID

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
    nextStartTimeRef.current = 0;
    setIsAISpeaking(false);
    setPlayingAudioUrl(null);
  };

  // Play full audio (for AudioBar) - use proxy for cross-origin audio
  // autoQueue=false (default): interrupt current audio and play immediately (audio_back replay)
  // autoQueue=true: schedule after current audio without interruption (auto-play on new AI message)
  const playFullAudio = (audioUrl, autoQueue = false) => {
    console.log('Playing full audio from:', audioUrl, autoQueue ? '(queued)' : '(interrupt)');

    if (!autoQueue) {
      // User-triggered replay: stop current audio and play immediately
      stopAudioPlayback();
      isInterruptedRef.current = false;
    }

    // Check if URL is cross-origin
    const isCrossOrigin = audioUrl.startsWith('http') && !audioUrl.startsWith(window.location.origin);

    if (isCrossOrigin) {
      // For cross-origin audio, always use proxy to avoid CORS issues
      console.log('Using proxy for cross-origin audio:', audioUrl);
      fetchAudioViaProxy(audioUrl, autoQueue);
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
          const ctx = audioContextRef.current;
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);

          // Add to queue for stop functionality
          audioQueueRef.current.push(source);

          // Reset time drift if autoQueue has drifted more than 30 seconds
          const TIME_DRIFT_THRESHOLD = 30;
          if (autoQueue && nextStartTimeRef.current - ctx.currentTime > TIME_DRIFT_THRESHOLD) {
            console.warn(`Auto-queue time drift detected (${(nextStartTimeRef.current - ctx.currentTime).toFixed(2)}s). Resetting to current time.`);
            nextStartTimeRef.current = ctx.currentTime;
          }

          const start = autoQueue ? Math.max(ctx.currentTime, nextStartTimeRef.current) : ctx.currentTime;
          source.start(start);
          if (autoQueue) nextStartTimeRef.current = start + audioBuffer.duration;

          setIsAISpeaking(true);
          setPlayingAudioUrl(audioUrl);
          source.onended = () => {
            setIsAISpeaking(false);
            setPlayingAudioUrl(null);
            // Remove from queue when done
            audioQueueRef.current = audioQueueRef.current.filter(s => s !== source);
            console.log('Audio playback ended');
          };
        })
        .catch(err => console.error('Error playing same-origin audio:', err));
    }
  };

  // Fetch audio via API proxy to avoid CORS issues
  const fetchAudioViaProxy = async (audioUrl, autoQueue = false) => {
    try {
      // Use our API gateway as a proxy to fetch the audio
      const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(audioUrl)}`;

      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();

      initAudioContext();
      if (!audioContextRef.current) return;

      const ctx = audioContextRef.current;
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      // Add to queue for stop functionality
      audioQueueRef.current.push(source);

      // Reset time drift if autoQueue has drifted more than 30 seconds
      const TIME_DRIFT_THRESHOLD = 30;
      if (autoQueue && nextStartTimeRef.current - ctx.currentTime > TIME_DRIFT_THRESHOLD) {
        console.warn(`Auto-queue time drift detected (${(nextStartTimeRef.current - ctx.currentTime).toFixed(2)}s). Resetting to current time.`);
        nextStartTimeRef.current = ctx.currentTime;
      }

      const start = autoQueue ? Math.max(ctx.currentTime, nextStartTimeRef.current) : ctx.currentTime;
      source.start(start);
      if (autoQueue) nextStartTimeRef.current = start + audioBuffer.duration;

      setIsAISpeaking(true);
      setPlayingAudioUrl(audioUrl);
      source.onended = () => {
        setIsAISpeaking(false);
        setPlayingAudioUrl(null);
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
      const blob = await aiAPI.tts(selection.text);
      const audioUrl = URL.createObjectURL(blob);
      playFullAudio(audioUrl);
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
  // Options: { keepHistory: boolean, resetProgress: boolean }
  // - keepHistory: 是否保留对话历史
  // - resetProgress: 是否重置进度（true=重新开始，false=继续练习）
  const handleRetryCurrentScenario = async (options = {}) => {
    const { keepHistory = true, resetProgress = false } = options;
    
    // Get scenario from URL params or state
    const searchParams = new URLSearchParams(window.location.search);
    const scenarioFromUrl = searchParams.get('scenario');
    const scenarioFromState = location.state?.scenario;
    const scenarioTitle = scenarioFromState || scenarioFromUrl;

    console.log('Retrying scenario:', scenarioTitle, 'Keep history:', keepHistory, 'Reset progress:', resetProgress);

    // Only reset tasks if user explicitly wants to start over
    if (resetProgress) {
      try {
        if (scenarioTitle) {
          console.log('Resetting all tasks in scenario:', scenarioTitle);
          await userAPI.resetTask(null, scenarioTitle);
        }
      } catch (err) {
        console.error('Failed to reset scenario:', err);
      }
    }

    setShowCompletionModal(false);
    // Keep completedTasks if not resetting progress
    if (resetProgress) {
      setCompletedTasks(new Set());
    }
    completionCheckedRef.current = resetProgress ? false : true;
    // Keep modal view tracking to prevent re-showing on refresh
    hasViewedCompletionModalRef.current = true;
    // Keep progress at 100% if not resetting, otherwise reset to 0
    if (resetProgress) {
      setCurrentTaskProgress(0);
      setCurrentTaskScore(0);
      // 重置魔法重复阶段状态
      setMagicPassedTasks(new Set());
      setCurrentMagicSentence('');
      setMagicCardState('waiting');
      setMagicCardCovered(false);
      setCurrentPhase(isRecallMode ? 'magic_repetition' : 'scene_theater');
      // 清除 localStorage 里的魔法通过记录
      const scKey = scenarioFromUrl || '';
      if (scKey) localStorage.removeItem(_lsScenarioKey('magic_passed_', scKey));
      if (scKey) localStorage.removeItem(_lsScenarioKey('magic_sentence_', scKey));
    } else {
      // Continue practice: show 100% progress
      setCurrentTaskProgress(100);
      setCurrentTaskScore(9); // Max score for completed tasks
    }
    previousProgressRef.current = resetProgress ? 0 : 100; // Reset progress tracking
    lastProficiencyUpdateRef.current = null; // Reset deduplication

    // Optionally clear messages (default: keep history)
    if (!keepHistory) {
      setMessages([
        {
          type: 'system',
          content: '重新开始练习当前场景...'
        }
      ]);
    }

    // Refresh tasks from backend to get updated status
    try {
      const updatedGoal = await userAPI.getActiveGoal();
      if (updatedGoal && updatedGoal.goal && updatedGoal.goal.scenarios) {
        const matchedScenario = updatedGoal.goal.scenarios.find(
          s => s.title === scenarioTitle ||
               (scenarioTitle && s.title.toLowerCase().includes(scenarioTitle.toLowerCase()))
        );
        if (matchedScenario) {
          setTasks(matchedScenario.tasks);
          console.log('Tasks refreshed after retry:', matchedScenario.tasks);
        }
      }
    } catch (err) {
      console.error('Failed to refresh tasks:', err);
    }

    // Reset session to clear AI context and restart with first task prompt
    // Only reset session when user wants to start over
    if (resetProgress) {
      try {
        if (sessionId) {
          // Properly cleanup WebSocket connection
          if (socketRef.current) {
            // Clear ping interval first to prevent errors - use optional chaining
            if (socketRef.current?.pingInterval) {
              clearInterval(socketRef.current.pingInterval);
              socketRef.current.pingInterval = null;
            }

            // Stop heartbeat if the method exists
            if (socketRef.current._stopHeartbeat) {
              socketRef.current._stopHeartbeat();
            }

            // Remove all event listeners to prevent callbacks after close
            socketRef.current.removeAllListeners();

            // Close the connection
            socketRef.current.close();
            socketRef.current = null;
          }

          // Clear old session from sessionStorage and localStorage
          sessionStorage.removeItem('session_id');

          // Clear scenario-specific session from localStorage to prevent history reload on refresh
          if (scenarioTitle) {
            localStorage.removeItem(_lsScenarioKey('session_', scenarioTitle));
            console.log('Cleared localStorage session for scenario:', scenarioTitle);
          }

          setSessionId(null);

          // Create new session which will trigger AI to use first task prompt
          const newSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          sessionStorage.setItem('session_id', newSessionId);
          setSessionId(newSessionId);

          console.log('New session created for retry:', newSessionId);
        }
      } catch (err) {
        console.error('Failed to reset session:', err);
      }
    }

    // Clear localStorage for this scenario to prevent old progress restoration
    if (resetProgress && scenarioTitle) {
      localStorage.removeItem(_lsScenarioKey('task_progress_', scenarioTitle));
      // Mark that welcome message should not be played after refresh
      localStorage.setItem(_lsScenarioKey('welcome_muted_', scenarioTitle), 'true');
      console.log('Cleared localStorage progress for scenario:', scenarioTitle);
    }

    // Only refresh page when resetting progress (to establish new WebSocket connection)
    // For "continue practice", just close the modal and keep current state
    if (resetProgress) {
      console.log('Refreshing page to establish new connection...');
      window.location.reload();
    }
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

           // Don't show connection message in chat - it's handled by UI status indicator
           // Just log the connection for debugging
           console.log('WebSocket connected, role:', data.payload?.role);

           // Re-fetch tasks after connection to ensure we have the latest state
           // This is especially important after page refresh
           const searchParams = new URLSearchParams(window.location.search);
           const scenario = searchParams.get('scenario') || location.state?.scenario;
           if (scenario) {
               // Re-fetch the latest goal state from DB to sync task progress
               userAPI.getActiveGoal().then(res => {
                   if (res && res.goal && res.goal.scenarios) {
                       let activeScenario = res.goal.scenarios.find(s => s.title.trim() === scenario.trim());
                       
                       // Try case-insensitive match if exact match fails
                       if (!activeScenario) {
                           activeScenario = res.goal.scenarios.find(s => 
                               s.title.toLowerCase() === scenario.toLowerCase()
                           );
                       }
                       
                       // Try partial match as fallback
                       if (!activeScenario) {
                           activeScenario = res.goal.scenarios.find(s =>
                               s.title.toLowerCase().includes(scenario.toLowerCase()) ||
                               scenario.toLowerCase().includes(s.title.toLowerCase())
                           );
                       }
                       
                       if (activeScenario && activeScenario.tasks) {
                           setTasks(activeScenario.tasks);
                           console.log('Updated tasks from backend:', activeScenario.tasks);

                           // Re-calculate completed set and current task progress
                           const newCompleted = new Set();
                           let currentTaskProgress = 0;
                           let currentTaskScore = 0;

                           activeScenario.tasks.forEach(t => {
                               if (typeof t === 'object') {
                                   if (t.status === 'completed') {
                                       newCompleted.add(t.text);
                                   } else if (t.status === 'pending' || t.status === 'in_progress') {
                                       // Get progress from the first incomplete task
                                       if (currentTaskProgress === 0) {
                                           currentTaskProgress = t.progress || 0;
                                           currentTaskScore = t.score || 0;
                                       }
                                   }
                               }
                           });
                           setCompletedTasks(newCompleted);

                           // Update progress bar from backend
                           if (currentTaskProgress > 0) {
                               setCurrentTaskProgress(currentTaskProgress);
                               setCurrentTaskScore(currentTaskScore);
                               // Save to localStorage for persistence
                               localStorage.setItem(_lsScenarioKey('task_progress_', scenario), currentTaskProgress.toString());
                           }

                           // Show toast for newly completed task
                           const completedTask = activeScenario.tasks.find(t => t.status === 'completed' && !newCompleted.has(t.text));
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

           // Check if welcome message is muted (after retry)
           const currentScenario = new URLSearchParams(window.location.search).get('scenario');
           const welcomeMuted = currentScenario ? localStorage.getItem(_lsScenarioKey('welcome_muted_', currentScenario)) === 'true' : false;

           if (role === 'assistant') {
               setMessages(prev => {
                   const newMessages = [...prev];

                   // 1. Try Strict Match by Response ID
                   if (targetResponseId) {
                       const index = newMessages.findIndex(m => m.type === 'ai' && m.responseId === targetResponseId);
                       if (index !== -1) {
                           console.log(`[AudioURL] Attached to message ${index} via ID ${targetResponseId}`);
                           // If welcome is muted and this is the first AI message, don't auto-play
                           const isFirstAIMessage = index === 0 || (index === 1 && newMessages[0]?.type === 'system');
                           newMessages[index] = {
                               ...newMessages[index],
                               audioUrl: url,
                               audioPlayed: (welcomeMuted && isFirstAIMessage) ? true : false
                           };
                           return newMessages;
                       }
                   }

                   // 2. Fallback: Attach to the LAST AI message that doesn't have a URL
                   for (let i = newMessages.length - 1; i >= 0; i--) {
                       if (newMessages[i].type === 'ai' && !newMessages[i].audioUrl) {
                           console.log(`[AudioURL] Fallback attachment to message ${i}`);
                           const isFirstAIMessage = i === 0 || (i === 1 && newMessages[0]?.type === 'system');
                           newMessages[i] = {
                               ...newMessages[i],
                               audioUrl: url,
                               audioPlayed: (welcomeMuted && isFirstAIMessage) ? true : false
                           };
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

           // 检测文本标记（降级方案）
           let cleanContent = aiContent;

           // 提取 MAGIC_SENTENCE（兼容 [ ] 和 < > 两种括号，兼容缺少结尾符的情况）
           if (aiContent && (aiContent.includes('[MAGIC_SENTENCE:') || aiContent.includes('<MAGIC_SENTENCE:'))) {
               const sentenceMatch = aiContent.match(/[\[<]MAGIC_SENTENCE:\s*([^\]>]+?)(?:[\]>]|$)/s);
               if (sentenceMatch) {
                   // 去掉末尾的 "Please repeat..." 等指令文字
                   const sentence = sentenceMatch[1]
                       .replace(/\.?\s*[Pp]lease\s+(repeat|say|try|recite)[\s\S]*/i, '')
                       .trim();
                   setCurrentMagicSentence(sentence || sentenceMatch[1].trim());
               }
               // 从显示文字中移除标记（兼容 [ ] 和 < > 两种括号）
               cleanContent = aiContent.replace(/[\[<]MAGIC_SENTENCE:[^\]>]*[\]>]?\s*/g, '').trim();
           }

           if (aiContent && aiContent.includes('[MAGIC_PASS]')) {
               // 从显示文字中移除标记
               cleanContent = cleanContent.replace(/\s*\[MAGIC_PASS[^\]]*\]/g, '');
               // 触发台词卡"通过"动画：仅在背诵模式下才生效（防止跟读阶段误触发）
               if (magicCardState === 'reciting') {
                   setMagicCardCovered(false);  // 背诵模式立即揭开
                   setMagicCardState('passed');
                   setTimeout(() => {
                       setMagicCardState('waiting');
                   }, 1800);
               }
           }
           if (aiContent && /\[TASK_\d+_COMPLETE\]/.test(aiContent)) {
               // 提取任务索引（假设格式: [TASK_0_COMPLETE])
               const match = aiContent.match(/\[TASK_(\d+)_COMPLETE\]/);
               if (match) {
                   const taskIdx = parseInt(match[1], 10);
                   setTheaterCompletedTasks(prev => new Set([...prev, taskIdx]));
               }
           }

           if (cleanContent) {
               setMessages(prev => {
                   const last = prev[prev.length - 1];
                   // If last message is an in-progress AI message, update it
                   if (last && last.type === 'ai' && !last.isFinal) {
                       return [
                           ...prev.slice(0, -1),
                           {
                               ...last,
                               content: cleanContent,
                               isFinal: true,
                               responseId: responseId || last.responseId
                           }
                       ];
                   }
                   // Otherwise create new AI message
                   return [...prev, {
                       type: 'ai',
                       content: cleanContent,
                       isFinal: true,
                       responseId: responseId
                   }];
               });
           }
           break;
        case 'ai_response': {
           // Handle AI text response from comms-service
           let responseText = data.text || '';
           console.log('🤖 AI Response:', responseText);

           // 提取 MAGIC_SENTENCE 标记（兼容 [ ] 和 < > 两种括号，兼容缺少结尾符）
           if (responseText.includes('[MAGIC_SENTENCE:') || responseText.includes('<MAGIC_SENTENCE:')) {
               const sentenceMatch = responseText.match(/[\[<]MAGIC_SENTENCE:\s*([^\]>]+?)(?:[\]>]|$)/s);
               if (sentenceMatch) {
                   const sentence = sentenceMatch[1]
                       .replace(/\.?\s*[Pp]lease\s+(repeat|say|try|recite)[\s\S]*/i, '')
                       .trim();
                   setCurrentMagicSentence(sentence || sentenceMatch[1].trim());
               }
               responseText = responseText.replace(/[\[<]MAGIC_SENTENCE:[^\]>]+[\]>]?\s*/g, '');
           }

           // 提取并移除 MAGIC_PASS 标记
           if (responseText.includes('[MAGIC_PASS]')) {
               responseText = responseText.replace(/\s*\[MAGIC_PASS[^\]]*\]/g, '');
               // 仅在背诵模式下才触发通过动画（防止跟读阶段误触发）
               if (magicCardState === 'reciting') {
                   setMagicCardCovered(false);
                   setMagicCardState('passed');
                   setTimeout(() => {
                       setMagicCardState('waiting');
                   }, 1800);
               }
           }

           const finalText = responseText.trim();
           setMessages(prev => {
               const last = prev[prev.length - 1];
               if (last && last.type === 'ai' && !last.isFinal) {
                   return [...prev.slice(0, -1), { ...last, content: finalText, isFinal: true }];
               }
               return [...prev, { type: 'ai', content: finalText, isFinal: true }];
           });
           break;
        }
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
           // Handle proficiency update notification with deduplication
           const profPayload = data.payload || {};
           const updateKey = `${profPayload.task_id}-${profPayload.task_score}-${profPayload.delta}`;

           // Skip if we've already processed this exact update
           if (lastProficiencyUpdateRef.current === updateKey) {
               console.log('Skipping duplicate proficiency update:', updateKey);
               break;
           }
           lastProficiencyUpdateRef.current = updateKey;

           console.log('📈 Proficiency Update:', profPayload);
           const delta = profPayload.delta || profPayload.proficiency_delta || 0;
           const total = profPayload.total || profPayload.current_proficiency || 0;
           const taskScore = profPayload.task_score || 0;
           const message = profPayload.message || '';
           const improvementTips = profPayload.improvement_tips || [];

           // Show improvement tips only outside magic_repetition phase
           if (improvementTips.length > 0 && currentPhaseRef.current !== 'magic_repetition') {
               const tipsText = '💡 建议：' + improvementTips.join('；');
               setMessages(prev => [...prev, {
                   type: 'system',
                   content: tipsText,
                   isFinal: true,
                   className: 'text-sm text-slate-500'
               }]);
           }

           // Update proficiency and progress bar only if delta > 0
           if (delta > 0) {
               const total = profPayload.total || profPayload.current_proficiency || 0;
               const taskScore = profPayload.task_score || 0;
               const message = profPayload.message || '';

               // Build message with improvement tips if available
               let content = `+${delta} 熟练度 | 总分：${total}`;
               if (message && message !== '+1 熟练度 | 表现良好，继续保持' && message !== '+2 熟练度 | 表现优秀！继续加油！') {
                   content += ` - ${message}`;
               }

               setMessages(prev => [...prev, {
                   type: 'system',
                   content: content,
                   isFinal: true
               }]);

               // Update progress bar with safeguard against unreasonable jumps
               // Task completion threshold: score >= 9 (100% progress at 9 points)
               const rawProgress = Math.min(100, Math.round((taskScore / 9) * 100));
               // Prevent progress from jumping more than 34% (which would be +1 score jump)
               // If the jump is larger, it might be due to duplicate workflow calls
               const maxAllowedProgress = previousProgressRef.current + 34;
               const newProgress = Math.min(rawProgress, maxAllowedProgress);

               // Only update if there's a valid delta (progress increased or stayed same)
               if (newProgress >= previousProgressRef.current) {
                   setCurrentTaskProgress(newProgress);
                   previousProgressRef.current = newProgress;
               }
               setCurrentTaskScore(taskScore);
               
               // Update engagement level based on delta
               if (delta >= 3) {
                   setEngagementLevel('高');
               } else if (delta >= 2) {
                   setEngagementLevel('中');
               } else {
                   setEngagementLevel('低');
               }
               
               // Save to localStorage for persistence
               const searchParams = new URLSearchParams(window.location.search);
               const scenario = searchParams.get('scenario') || location.state?.scenario;
               if (scenario) {
                   localStorage.setItem(_lsScenarioKey('task_progress_', scenario), newProgress.toString());
               }
               
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
               // 构建提示消息，包含下一个任务预告
               let completionMessage = `✅ 任务完成：${taskPayload.task_title}`;
               if (taskPayload.next_task) {
                   completionMessage += ` | 下个任务：${taskPayload.next_task}`;
               }
               
               setMessages(prev => [...prev, {
                   type: 'system',
                   content: completionMessage,
                   isFinal: true
               }]);
               // Update completed tasks
               if (taskPayload.task_title) {
                   setCompletedTasks(prev => new Set([...prev, taskPayload.task_title]));
               }
               
               lastProficiencyUpdateRef.current = null; // Reset deduplication for next task

               // next_task is null/undefined when this was the last task in the scenario.
               // In that case keep progress at 100% until the completion modal appears.
               const isLastTask = !taskPayload.next_task;
               const searchParams = new URLSearchParams(window.location.search);
               const scenario = searchParams.get('scenario') || location.state?.scenario;
               if (isLastTask) {
                   setCurrentTaskProgress(100);
                   previousProgressRef.current = 100;
               } else {
                   // Reset progress bar for the next task
                   setCurrentTaskProgress(0);
                   setCurrentTaskScore(0);
                   setEngagementLevel('中');
                   previousProgressRef.current = 0;

                   // Clear localStorage for this scenario (will be refreshed from backend)
                   if (scenario) {
                       localStorage.removeItem(_lsScenarioKey('task_progress_', scenario));
                   }
               }
               
               // Refresh tasks from backend to get next task
               setTimeout(async () => {
                   try {
                       const res = await userAPI.getActiveGoal();
                       if (res && res.goal && res.goal.scenarios) {
                           let activeScenario = res.goal.scenarios.find(s => s.title.trim() === scenario?.trim());
                           
                           // Try case-insensitive match if exact match fails
                           if (!activeScenario) {
                               activeScenario = res.goal.scenarios.find(s => 
                                   s.title.toLowerCase() === scenario?.toLowerCase()
                               );
                           }
                           
                           // Try partial match as fallback
                           if (!activeScenario) {
                               activeScenario = res.goal.scenarios.find(s =>
                                   s.title.toLowerCase().includes(scenario?.toLowerCase() || '') ||
                                   (scenario && scenario.toLowerCase().includes(s.title.toLowerCase()))
                               );
                           }
                           
                           if (activeScenario && activeScenario.tasks) {
                               setTasks(activeScenario.tasks);
                               // Update completed set
                               const newCompleted = new Set();
                               activeScenario.tasks.forEach(t => {
                                   if (typeof t === 'object' && t.status === 'completed') {
                                       newCompleted.add(t.text);
                                   }
                               });
                               setCompletedTasks(newCompleted);
                           }
                       }
                   } catch (err) {
                       console.error('Failed to refresh tasks after completion:', err);
                   }
               }, 1500);
           }
           break;
        case 'phase_transition': {
           const phase = data.payload?.phase || data.phase;
           // recall 模式：魔法重复全部完成后跳回 Dashboard
           if (isRecallMode && phase === 'scene_theater') {
               navigate('/discovery');
               return;
           }
           if (phase) {
               setCurrentPhase(phase);
               setTipIndex(Math.floor(Math.random() * MAGIC_TIPS.length));
           }
           if (phase === 'magic_repetition') {
               setMagicCardState('waiting');
               setMagicCardCovered(false);
               // stop_audio=false 表示 AI 已在同一响应中合并输出 A+B，不打断正在播放的音频
               // stop_audio=true（或未设置）表示后端另发了 response.create，需要清空旧音频
               if (data.payload?.stop_audio !== false) {
                   stopAudioPlayback();
               }
               // 若 AI 在同一响应中嵌入了 [MAGIC_SENTENCE]，直接从 payload 取句子更新台词卡
               if (data.payload?.magic_sentence) {
                   const sc = new URLSearchParams(window.location.search).get('scenario') || '';
                   setCurrentMagicSentence(data.payload.magic_sentence);
                   try { if (sc) localStorage.setItem(_lsScenarioKey('magic_sentence_', sc), data.payload.magic_sentence); } catch {}
                   console.log('[Magic] Embedded sentence from phase_transition:', data.payload.magic_sentence);
               }
           } else {
               // 切换到其他阶段（scene_theater 等）时重置卡片状态
               setMagicCardCovered(false);
               setMagicCardState('waiting');
           }
           setShowSkipButton(false);
           console.log('📊 Phase Transition:', phase);
           break;
        }
        case 'scene_image': {
           const imageUrl = data.payload?.image_url || data.image_url;
           if (imageUrl) setSceneImageUrl(imageUrl);
           console.log('🖼️ Scene Image:', imageUrl);
           break;
        }
        case 'magic_pass_first': {
           setMagicCardCovered(true);
           setMagicCardState('reciting');
           setShowSkipButton(false);
           setTipIndex(Math.floor(Math.random() * MAGIC_TIPS.length));
           console.log('🎭 Magic Pass First — card covered, memory mode');
           break;
        }
        case 'magic_pass': {
           const magicTaskIndex = data.payload?.task_index ?? data.task_index;
           setMagicPassedTasks(prev => {
               const next = new Set([...prev, magicTaskIndex]);
               try {
                   const sc = new URLSearchParams(window.location.search).get('scenario') || '';
                   if (sc) localStorage.setItem(_lsScenarioKey('magic_passed_', sc), JSON.stringify([...next]));
               } catch {}
               return next;
           });
           setMagicCardState('passed');
           setMagicCardCovered(false);
           setShowSkipButton(false);
           setTipIndex(Math.floor(Math.random() * MAGIC_TIPS.length));
           setTimeout(() => {
               setMagicCardState('waiting');
           }, 1800);
           // Stop response A audio and delete its bubble — it may say "try from memory" which
           // conflicts with the new task intro (Response B). Only Response B should appear.
           stopAudioPlayback();
           setMessages(prev => {
               // Find last AI message index via reverse scan (O(n) single pass, no intermediate arrays)
               let lastAiIdx = -1;
               for (let i = prev.length - 1; i >= 0; i--) {
                   if (prev[i].type === 'ai') { lastAiIdx = i; break; }
               }
               if (lastAiIdx === -1) return prev;
               console.log('[magic_pass] Removing Response A bubble at index', lastAiIdx);
               return prev.filter((_, i) => i !== lastAiIdx);
           });
           console.log('✨ Magic Pass Task:', magicTaskIndex);
           break;
        }
        case 'theater_task_complete': {
           const theaterTaskIndex = data.payload?.task_index ?? data.task_index;
           setTheaterCompletedTasks(prev => new Set([...prev, theaterTaskIndex]));
           console.log('🎭 Theater Task Complete:', theaterTaskIndex);
           break;
        }
        case 'scenario_review':
           // Handle scenario review data from backend (when all tasks in scenario are completed)
           console.log('📚 [Scenario Review] 场景完成，获取 AI 点评：', data.payload);
           if (data.payload) {
               // Store review data for personalized AI feedback in completion modal
               setScenarioReviewData(data.payload);
               window.currentScenarioReview = data.payload;
               console.log('📚 AI 点评数据已存储，场景完成时将显示个性化点评');
           }
           break;
        case 'test_scenario_review':
           // Handle test scenario review data (for debugging)
           console.log('🧪 [Test Scenario Review] 通关口令生效！');
           console.log('🧪 Test Scenario Review:', data.payload);
           if (data.payload) {
               // Store review data for personalized AI feedback in completion modal
               setScenarioReviewData(data.payload);
               window.currentScenarioReview = data.payload;
               console.log('🧪 测试数据已存储，场景完成时将显示个性化 AI 点评');
           }
           break;
        case 'dashscope_response':
           // Internal DashScope events - ignore
           break;
        default:
           // Ignore unknown message types silently
           break;
      }
  }, [setCurrentTaskProgress, setCurrentTaskScore, setEngagementLevel, setCompletedTasks, setTasks, location.state, userAPI]);

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
    // Cookie-based auth: check user instead of token
    if (!user || !effectiveSessionId) {
      console.log('connectWebSocket: missing user or sessionId', { user, effectiveSessionId, sessionId });
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
    
    // Cookie-based auth: token is now in httpOnly cookie, no need to pass in URL
    wsUrl = `${protocol}//${wsHost}/api/ws/?sessionId=${effectiveSessionId}${scenario ? `&scenario=${scenario}` : ''}${topic ? `&topic=${topic}` : ''}&voice=${voice}`;

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

    // Note: Ping/heartbeat is handled by OptimizedWebSocket internally
    // No need for manual ping interval here

    // Send session_start handshake
    const searchParams = new URLSearchParams(window.location.search);
    const scenario = searchParams.get('scenario');

    // Check if welcome message should be muted (after retry)
    const welcomeMuted = scenario ? localStorage.getItem(_lsScenarioKey('welcome_muted_', scenario)) === 'true' : false;

      const payload = {
        type: 'session_start',
        userId: user.id,
          sessionId: sessionId,
        token: token,
        scenario: scenario,
        topic: searchParams.get('topic'),
          isRestoration: true,
        welcomeMuted: welcomeMuted,  // Flag to suppress welcome message
        clientInfo: {
            optimized: true,
          version: '2.0',
      features: ['adaptive_streaming', 'compression', 'low_latency']
    }
    };
    socketRef.current.send(JSON.stringify(payload));

    // 刷新重连：如果处于 magic_repetition 且句子为空，请求后端重发
    setTimeout(() => {
      try {
        const sc = new URLSearchParams(window.location.search).get('scenario') || '';
        const hasSentence = sc ? !!localStorage.getItem(_lsScenarioKey('magic_sentence_', sc)) : false;
        if (currentPhaseRef.current === 'magic_repetition' && !hasSentence) {
          socketRef.current.send(JSON.stringify({ type: 'resend_magic_sentence' }));
          console.log('[Magic] Requested resend_magic_sentence after reconnect');
        }
      } catch {}
    }, 600);
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

        // Clear ping interval - safely check socketRef.current first
        if (socketRef.current?.pingInterval) {
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

  }, [user, sessionId, playAudioChunk, handleJsonMessage]);

  // Init Session
  useEffect(() => {
    // Create AbortController for this effect
    const abortController = new AbortController();

    const init = async () => {
      if (!user?.id) return; // Cookie-based auth: only need user, token is in httpOnly cookie

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

      // Always refresh tasks from backend to ensure consistency
      if (scenario) {
          try {
              console.log('Fetching tasks from backend for scenario:', scenario);

              const goalRes = await userAPI.getActiveGoal({ signal: abortController.signal });
              console.log('getActiveGoal response:', goalRes);

              let scenarios = [];
              let activeScenario = null;

              if (goalRes && goalRes.goal && goalRes.goal.scenarios) {
                  console.log('Available Scenarios:', goalRes.goal.scenarios.map(s => s.title));
                  console.log('Requested Scenario:', scenario);
                  scenarios = goalRes.goal.scenarios;
                  
                  // Try exact match first
                  activeScenario = goalRes.goal.scenarios.find(s => s.title.trim() === scenario.trim());
                  
                  // Try case-insensitive match
                  if (!activeScenario) {
                      activeScenario = goalRes.goal.scenarios.find(s => 
                          s.title.toLowerCase() === scenario.toLowerCase()
                      );
                  }
                  
                  // Try partial match as fallback
                  if (!activeScenario) {
                      activeScenario = goalRes.goal.scenarios.find(s =>
                          s.title.toLowerCase().includes(scenario.toLowerCase()) ||
                          scenario.toLowerCase().includes(s.title.toLowerCase())
                      );
                  }
                  
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
      }

      // Determine session ID priority: URL > localStorage > new session
      let effectiveSessionId = urlSessionId;

      // If no URL session ID, check localStorage for persisted session
      if (!effectiveSessionId && scenario) {
          const storedSessionId = localStorage.getItem(_lsScenarioKey('session_', scenario));
          if (storedSessionId) {
              // Verify that the stored session ID is still valid by checking history
              try {
                  const historyRes = await conversationAPI.getHistory(storedSessionId, { signal: abortController.signal });
                  if (historyRes && historyRes.messages && historyRes.messages.length > 0) {
                      effectiveSessionId = storedSessionId;
                      // Load history messages into state
                      // Set audioPlayed: true to prevent auto-play on page refresh
                      let lastMagicSentence = '';
                      const historyMessages = historyRes.messages.map(msg => {
                          let content = msg.content || '';
                          if (msg.role !== 'user') {
                              // 提取最新的 MAGIC_SENTENCE（取最后一条）
                              const match = content.match(/\[MAGIC_SENTENCE:\s*(.+?)\]/);
                              if (match) lastMagicSentence = match[1].trim();
                              // 剥离所有标记
                              content = content
                                  .replace(/\[MAGIC_SENTENCE:[^\]]+\]\s*/g, '')
                                  .replace(/\s*\[MAGIC_PASS[^\]]*\]/g, '')
                                  .replace(/\[TASK_\d+_COMPLETE\]/g, '')
                                  .trim();
                          }
                          return {
                              type: msg.role === 'user' ? 'user' : 'ai',
                              content,
                              audioUrl: msg.audioUrl,
                              isFinal: true,
                              audioPlayed: true
                          };
                      });
                      if (lastMagicSentence) {
                          setCurrentMagicSentence(lastMagicSentence);
                      }
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
                  localStorage.removeItem(_lsScenarioKey('session_', scenario));
              }
          }
      }

      // If still no session ID, create a new one
      if (!effectiveSessionId) {
          effectiveSessionId = crypto.randomUUID();
      }

      // Persist session ID for this scenario
      if (scenario) {
          localStorage.setItem(_lsScenarioKey('session_', scenario), effectiveSessionId);
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
    
    // Cleanup function to prevent memory leaks and stale callbacks
    return () => {
      console.log('[Cleanup] Conversation component unmounting, cleaning up resources...');

      // Abort any pending API requests
      abortController.abort();

      // Close WebSocket connection
      if (socketRef.current) {
        console.log('[Cleanup] Closing WebSocket connection');
        socketRef.current.close(1000, 'Component unmounting');
        socketRef.current = null;
      }

      // Stop any ongoing audio playback
      stopAudioPlayback();

      // Stop network monitoring
      if (window.networkAdaptiveManager) {
        window.networkAdaptiveManager.stopMonitoring();
      }

      // Clear any pending audio queue
      if (audioQueueRef.current) {
        audioQueueRef.current = [];
      }
    };
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

        // Play the audio — autoQueue=true: schedule after current audio, no interruption
        console.log(`[AutoPlay] Playing AI audio for message ${index}:`, message.audioUrl);
        playFullAudio(message.audioUrl, true);
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
    setIsUserRecording(true);

    isInterruptedRef.current = false; // Reset flag for new turn
    const newId = Date.now().toString();
    currentUserMessageIdRef.current = newId; // New turn ID

    // Get session ID from recorder (generated in startRecording)
    const newSessionId = recorderRef.current?.getSessionId();
    if (!newSessionId) {
        console.error('❌ No session ID available from recorder');
        return;
    }
    currentRecordingSessionIdRef.current = newSessionId;
    console.log('🎤 Recording started, session ID:', newSessionId);

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

  const handleRecordingStop = (audioBuffers) => {
    setIsUserRecording(false);
    const wsReadyState = socketRef.current?.getReadyState?.() || socketRef.current?.readyState;
    console.log('🎤 handleRecordingStop called, WebSocket state:', wsReadyState, 'audio buffers:', audioBuffers?.length);

    // Clear recording session ID to prevent any late audio data from being sent
    console.log('🛑 Recording stopped, clearing session ID:', currentRecordingSessionIdRef.current);
    currentRecordingSessionIdRef.current = null;

    // Clear session ID in recorder
    if (recorderRef.current) {
        recorderRef.current.clearSessionId();
    }

    // Send buffered audio data as JSON-wrapped base64
    if (audioBuffers && audioBuffers.length > 0) {
        console.log('🎤 Sending buffered audio data, count:', audioBuffers.length);
        audioBuffers.forEach(buffer => {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                const uint8 = new Uint8Array(buffer.buffer !== undefined ? buffer.buffer : buffer);
                let binary = '';
                for (let i = 0; i < uint8.byteLength; i++) {
                    binary += String.fromCharCode(uint8[i]);
                }
                const b64 = btoa(binary);
                socketRef.current.send(JSON.stringify({
                    type: 'audio_stream',
                    payload: { audio: b64 }
                }));
            } else {
                console.warn('⚠️ Cannot send buffered audio - WebSocket not connected, state:', wsReadyState);
            }
        });
    } else {
        console.log('🎤 No buffered audio to send');
    }

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
    setIsUserRecording(false);
    console.log('🚫 Recording cancelled, clearing session ID:', currentRecordingSessionIdRef.current);
    currentRecordingSessionIdRef.current = null; // Clear session ID to ignore any pending audio data

    // Clear session ID in recorder
    if (recorderRef.current) {
        // 直接调用 internalCancelRecording 方法，它会清空缓存
        recorderRef.current.cancelRecording();
    }

    const wsReadyState = socketRef.current?.getReadyState?.() || socketRef.current?.readyState;
    if (wsReadyState === WebSocket.OPEN || wsReadyState === WebSocket.CONNECTING) {
        socketRef.current.send(JSON.stringify({ type: 'user_audio_cancelled' }));
    }
    const cancelId = currentUserMessageIdRef.current;
    setMessages(prev => prev.filter(m => !(m.type === 'user' && m.id === cancelId)));
    isInterruptedRef.current = false;
  };

  // Removed handleAudioData since we now cache audio and send only on stop

  // PhaseIndicator 组件：两阶段 tab 指示器（Minimalist 风格）
  const PhaseIndicator = () => {
    const phases = [
      { id: 'magic_repetition', label: '魔法重复', count: 3 },
      { id: 'scene_theater', label: '情景剧场', count: 3 },
    ];

    const handlePhaseClick = (phaseId) => {
      if (phaseId === 'magic_repetition' && currentPhase !== 'magic_repetition') {
        // 回退到魔法重复阶段：重置前端状态 + 通知后端
        setCurrentPhase('magic_repetition');
        setMagicPassedTasks(new Set());
        setCurrentMagicSentence('');
        setMagicCardState('waiting');
        setMagicCardCovered(false);
        try {
          const sc = new URLSearchParams(window.location.search).get('scenario') || '';
          if (sc) localStorage.removeItem(_lsScenarioKey('magic_passed_', sc));
          if (sc) localStorage.removeItem(_lsScenarioKey('magic_sentence_', sc));
        } catch {}
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: 'reset_magic_phase' }));
          console.log('🔄 Reset magic phase requested');
        }
      } else {
        setCurrentPhase(phaseId);
      }
    };

    return (
      <div className="h-12 flex items-center gap-2 px-4 bg-slate-900 dark:bg-slate-950 justify-center transition-all duration-500">
        {phases.map((phase) => {
          const isActive = currentPhase === phase.id;
          const completedTasks = phase.id === 'magic_repetition' ? magicPassedTasks : theaterCompletedTasks;
          return (
            <button
              key={phase.id}
              onClick={() => handlePhaseClick(phase.id)}
              className={`flex flex-col items-center gap-1 px-4 transition-colors duration-300 ${
                isActive ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <div className="text-xs font-medium">{phase.label}</div>
              <div className="flex gap-0.5">
                {Array.from({ length: phase.count }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 h-1 rounded-full transition-colors duration-300 ${
                      completedTasks.has(i) ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  // AIFeedbackStrip 组件：简洁的反馈条（底部淡入）
  const AIFeedbackStrip = () => {
    if (!aiFeedback) return null;
    return (
      <div className="px-4 py-2 bg-amber-950/30 dark:bg-amber-900/20 border-t border-amber-800/30 text-amber-200 text-xs flex items-center gap-2 animate-in fade-in duration-500">
        {/* 闪烁点动画 */}
        <span className="inline-flex gap-1">
          <span className="w-0.5 h-0.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="w-0.5 h-0.5 rounded-full bg-amber-400 animate-pulse delay-100" />
          <span className="w-0.5 h-0.5 rounded-full bg-amber-400 animate-pulse delay-200" />
        </span>
        <span className="flex-1">{aiFeedback}</span>
      </div>
    );
  };

  // AiAvatar status derived from recording / AI speaking states
  const avatarStatus = isAISpeaking ? 'speaking'
    : isUserRecording ? 'listening'
    : 'idle';

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-background-light dark:bg-background-dark relative">

      {/* ── Scene Panel: 场景图全宽置顶，控制按钮叠加 ── */}
      <div className="relative w-full shrink-0 overflow-hidden bg-slate-900" style={{height:'220px'}}>

        {/* 背景：情景剧场阶段显示场景图，魔法重复阶段显示 AiAvatar，其他阶段显示深色渐变 */}
        {(currentPhase === 'scene_theater' && sceneImageUrl) ? (
          <img
            src={sceneImageUrl}
            alt="scene"
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
          />
        ) : currentPhase === 'magic_repetition' ? (
          /* AiAvatar 填满 magic_repetition 场景面板 */
          <div className="absolute inset-0 pb-10">
            <AiAvatar status={avatarStatus} name="AI 导师" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950" />
        )}

        {/* 全局渐变叠加层 */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80 pointer-events-none" />

        {/* 情景剧场骨架屏（有图位置但图片未加载） */}
        {currentPhase === 'scene_theater' && !sceneImageUrl && (
          <div className="absolute inset-0 flex items-center justify-center gap-3 px-8">
            <div className="w-14 h-14 rounded-lg bg-slate-700 animate-pulse shrink-0" />
            <div className="flex flex-col gap-2 flex-1">
              <div className="h-3 bg-slate-700 rounded w-3/4 animate-pulse" />
              <div className="h-3 bg-slate-700 rounded w-1/2 animate-pulse" />
            </div>
          </div>
        )}

        {/* ── 顶部控制层：× 按钮 + 连接状态 ── */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 z-10">
          <button
            onClick={() => navigate('/discovery')}
            className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full backdrop-blur-sm flex items-center gap-1 ${
              isConnected ? 'bg-emerald-500/80 text-white' : 'bg-amber-500/80 text-white'
            }`}>
              <span className={`w-1 h-1 rounded-full ${isConnected ? 'bg-white' : 'bg-white/70'}`} />
              {isConnected ? '在线' : '连接中'}
            </span>
          </div>
        </div>

        {/* ── 底部叠加层：话题引导词 + 场景标题 + 阶段指示 ── */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 z-10">

          <div className="flex items-end justify-between">
            {/* 场景标题 + 阶段名 */}
            <div>
              <p className="text-white font-semibold text-sm leading-tight" style={{textShadow:'0 1px 6px rgba(0,0,0,0.8)'}}>
                {currentScenarioTitle || 'AI 口语导师'}
              </p>
              <p className="text-white/50 text-xs mt-0.5">
                {currentPhase === 'magic_repetition' ? '魔法重复阶段' : currentPhase === 'scene_theater' ? '情景剧场阶段' : '复盘点评'}
              </p>
            </div>

            {/* 阶段进度点（recall 模式显示两阶段，普通场景只显示剧场） */}
            <div className="flex items-center gap-3">
              {[
                ...(isRecallMode ? [{ id: 'magic_repetition', label: '复述', set: magicPassedTasks }] : []),
                { id: 'scene_theater', label: '剧场', set: theaterCompletedTasks },
              ].map((ph) => (
                <button
                  key={ph.id}
                  onClick={() => {
                    if (ph.id === 'magic_repetition' && currentPhase !== 'magic_repetition') {
                      setCurrentPhase('magic_repetition');
                      setMagicPassedTasks(new Set());
                      setCurrentMagicSentence('');
                      setMagicCardState('waiting');
                      setMagicCardCovered(false);
                      try {
                        const sc = new URLSearchParams(window.location.search).get('scenario') || '';
                        if (sc) localStorage.removeItem(_lsScenarioKey('magic_passed_', sc));
                        if (sc) localStorage.removeItem(_lsScenarioKey('magic_sentence_', sc));
                      } catch {}
                      if (socketRef.current?.readyState === WebSocket.OPEN) {
                        socketRef.current.send(JSON.stringify({ type: 'reset_magic_phase' }));
                      }
                    }
                  }}
                  className={`flex flex-col items-center gap-1 transition-opacity ${
                    ph.id === 'magic_repetition' && currentPhase !== 'magic_repetition'
                      ? 'cursor-pointer opacity-70 hover:opacity-100'
                      : 'cursor-default'
                  }`}
                >
                  <span className={`text-[10px] tracking-wide ${currentPhase === ph.id ? 'text-indigo-300' : 'text-white/30'}`}>
                    {ph.label}
                  </span>
                  <div className="flex gap-0.5">
                    {[0,1,2].map(i => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                        ph.set.has(i) ? 'bg-emerald-400' : 'bg-white/20'
                      }`} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 每日限制 Banner */}
      {dailyScenariosUsed >= 3 && (
        <div className="flex items-center justify-center px-4 py-1.5 bg-amber-900/40 text-amber-300 text-xs">
          今日练习已满 3 个场景，明天继续加油
        </div>
      )}

      {/* Mission Tasks Dropdown Bar — only visible in scene_theater phase */}
      {currentPhase === 'scene_theater' && (tasks.length > 0 || tasksLoading) && (
        <div
          className={`z-10 bg-green-500 border-b border-green-400 transition-all duration-700 shrink-0 relative ${!showTasks && taskBarFaded ? 'opacity-30' : 'opacity-100'}`}
          onMouseEnter={() => {
            if (!showTasks && taskBarFaded) {
              clearTimeout(taskBarFadeTimerRef.current);
              setTaskBarFaded(false);
              taskBarFadeTimerRef.current = setTimeout(() => setTaskBarFaded(true), 3000);
            }
          }}
        >
          {/* Collapsed / Expanded header button */}
          <button
            onClick={() => {
              setShowTasks(prev => {
                const next = !prev;
                clearTimeout(taskBarFadeTimerRef.current);
                if (!next) {
                  taskBarFadeTimerRef.current = setTimeout(() => setTaskBarFaded(true), 3000);
                } else {
                  setTaskBarFaded(false);
                }
                return next;
              });
            }}
            className="w-full bg-green-500 hover:bg-green-600 active:bg-green-700 transition-colors"
          >
            <div className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-white">
                  任务 ({completedTasks.size}/{tasks.length} 完成)
                </span>
              </div>
              <span className="material-symbols-outlined text-white text-base">
                {showTasks ? 'expand_less' : 'expand_more'}
              </span>
            </div>
            {/* Overall progress bar — always visible in header */}
            <div className="w-full h-1 bg-green-700/40">
              <div
                className="h-full bg-white/80 transition-all duration-500 ease-out"
                style={{ width: `${currentTaskProgress}%` }}
              />
            </div>
          </button>

          {showTasks && (
            <ul className="bg-green-500 px-5 pb-4 pt-2 space-y-3 border-t border-green-400">
              {tasksLoading ? (
                <li className="text-xs text-white/80 py-1">Loading tasks...</li>
              ) : (() => {
                // determine which is the current in-progress task (first incomplete)
                const firstIncompleteIdx = tasks.findIndex(t => {
                  const txt = typeof t === 'string' ? t : t.text;
                  return !completedTasks.has(txt);
                });
                return tasks.map((task, idx) => {
                  const taskText = typeof task === 'string' ? task : task.text;
                  const isCompleted = completedTasks.has(taskText);
                  const isCurrent = idx === firstIncompleteIdx;
                  const progress = isCompleted ? 100 : isCurrent ? currentTaskProgress : 0;
                  return (
                    <li key={idx} className="space-y-1.5">
                      <div className="flex items-start gap-2.5">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isCompleted ? 'bg-white' : 'bg-white/30 border border-white'}`}>
                          {isCompleted && (
                            <span className="material-symbols-outlined text-green-600 text-[13px] font-bold">check</span>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm ${isCompleted ? 'text-white/60 line-through' : 'text-white font-medium'}`}>
                            {isCurrent && !isCompleted && '→ '}
                            {taskText}
                          </span>
                          {/* Per-task progress bar */}
                          <div className="w-full h-1 mt-1 bg-green-700/40 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ease-out ${isCompleted ? 'bg-white' : 'bg-white/70'}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          {isCurrent && !isCompleted && (
                            <span className="text-[10px] text-white/70 mt-0.5 inline-block">{progress}%</span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                });
              })()}
            </ul>
          )}
        </div>
      )}

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

        {/* 魔法重复阶段：台词卡（句子跟读卡片，仅 recall 模式显示）*/}
        {isRecallMode && currentPhase === 'magic_repetition' && (
          <div>
            {/* 台词卡主体 */}
            <div
              className={`bg-white rounded-2xl shadow-md transition-all duration-300 overflow-hidden ${
                magicCardState === 'passed' ? 'border-l-4 border-emerald-500' : 'border-l-4 border-primary'
              }`}
              onPointerDown={() => magicCardCovered && setIsPeeking(true)}
              onPointerUp={() => setIsPeeking(false)}
              onPointerLeave={() => setIsPeeking(false)}
              style={{ userSelect: 'none', touchAction: 'none' }}
            >
              <div className="p-5">
                {magicCardState === 'passed' ? (
                  /* 通过状态 */
                  <div className="flex items-center gap-3 py-1 animate-in zoom-in duration-200">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <span className="text-xl">✅</span>
                    </div>
                    <div>
                      <p className="font-semibold text-emerald-700">通过！</p>
                      <p className="text-sm text-emerald-600/70">继续下一个句子</p>
                    </div>
                  </div>
                ) : magicCardCovered && !isPeeking ? (
                  /* 背诵模式（台词已隐藏）*/
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                      <span className="text-lg">🧠</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 mb-2">从记忆复述</p>
                      <div className="space-y-2">
                        <div className="h-3 rounded-full bg-indigo-100 animate-pulse w-full" />
                        <div className="h-3 rounded-full bg-indigo-100 animate-pulse w-4/5" />
                      </div>
                      <p className="text-xs text-gray-400 mt-3">💡 按住卡片可偷看</p>
                    </div>
                  </div>
                ) : magicCardCovered && isPeeking ? (
                  /* 偷看模式 */
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                      <span className="text-lg">👀</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-indigo-600 mb-1.5 text-sm">偷看模式</p>
                      <p className="text-gray-700 leading-relaxed text-[15px]">
                        {currentMagicSentence || <span className="text-slate-400 italic">AI 正在准备...</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">松开后隐藏</p>
                    </div>
                  </div>
                ) : (
                  /* 跟读模式（默认：展示台词）*/
                  <div>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: '#637FF120' }}>
                        <span className="text-lg">📝</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 mb-1.5">台词卡</h3>
                        <p className="text-gray-700 leading-relaxed text-[15px]">
                          {currentMagicSentence || <span className="text-slate-400 italic">AI 正在准备台词...</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: '#637FF115', color: '#637FF1' }}>
                        {currentScenarioTitle || '魔法重复'}
                      </span>
                      <span>•</span>
                      <span>跟读练习</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 提示 + 跳过按钮 */}
            {magicCardState !== 'passed' && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-2">
                  <span className="text-yellow-500 text-xs mt-0.5 shrink-0">💡</span>
                  <p key={tipIndex} className="text-xs text-amber-700/80 leading-relaxed">
                    {MAGIC_TIPS[tipIndex]}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (socketRef.current?.readyState === WebSocket.OPEN) {
                      socketRef.current.send(JSON.stringify({ type: 'force_advance_magic' }));
                      console.log('⏭️ Manual advance magic task');
                    }
                  }}
                  className="shrink-0 px-3 py-2 rounded-xl text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 transition-all"
                  title="跳过当前句子"
                >
                  跳过 →
                </button>
              </div>
            )}
          </div>
        )}

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
            <MessageBubble
              key={index}
              type={isAI ? 'ai' : 'user'}
              message={displayContent}
              state={!msg.isFinal && isAI ? 'loading' : 'default'}
              footer={msg.audioUrl ? (
                <AudioBar
                  audioUrl={msg.audioUrl}
                  duration={0}
                  onClick={() => {
                    if (playingAudioUrl === msg.audioUrl) {
                      stopAudioPlayback();
                    } else {
                      playFullAudio(msg.audioUrl);
                    }
                  }}
                  isOwnMessage={!isAI}
                  isActive={playingAudioUrl === msg.audioUrl}
                />
              ) : null}
            />
          );
        })}
        <div ref={messagesEndRef} className="h-4" />
      </main>

      {/* Footer / Controls */}
      <footer className="pb-4 pt-3 px-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col items-center gap-3">
            {/* Main Controls: Recorder + Restart Button */}
            <div className="flex items-center gap-3 w-full max-w-md">
                <div className="flex-1 relative">
                    {dailyScenariosUsed >= 3 && (
                      <div className="absolute inset-0 z-10 rounded-full pointer-events-none" />
                    )}
                    <RealTimeRecorder
                      ref={recorderRef}
                      isConnected={isConnected}
                      onStart={handleRecordingStart}
                      onStop={handleRecordingStop}
                      onCancel={handleRecordingCancel}
                      enableCompression={true}
                      enableMetrics={true}
                      disabled={dailyScenariosUsed >= 3}
                    />
                </div>
                
                {/* Restart Practice Button - Icon only */}
                {(tasks.length > 0 || location.state?.scenario || new URLSearchParams(window.location.search).get('scenario')) && (
                    <button
                      onClick={() => handleRetryCurrentScenario({ keepHistory: false, resetProgress: true })}
                      className="flex-shrink-0 w-12 h-12 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-xl flex items-center justify-center transition border border-amber-200 dark:border-amber-700"
                      title="重新练习"
                    >
                      <span className="material-symbols-outlined">replay</span>
                    </button>
                )}
            </div>

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
        </div>
      </footer>

      {/* AI Feedback Strip */}
      <AIFeedbackStrip />

      {/* Scenario Completion Modal */}
      {showCompletionModal && (
        <PracticeReport
          scenarioTitle={currentScenarioTitle}
          scenarioScore={scenarioScore}
          reviewData={scenarioReviewData}
          messages={messages}
          onClose={() => {
            setShowCompletionModal(false);
            hasViewedCompletionModalRef.current = true;
          }}
          onRetry={() => handleRetryCurrentScenario({ keepHistory: true, resetProgress: false })}
          onRestart={() => handleRetryCurrentScenario({ keepHistory: false, resetProgress: true })}
          onNextScenario={handleNextScenario}
          onSelectOther={handleSelectOtherScenario}
          hasNextScenario={currentScenarioIndex < allScenarios.length - 1}
          onCheckin={() => userAPI.checkin()}
        />
      )}
    </div>
  );
}

export default Conversation;