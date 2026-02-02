import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, conversationAPI, historyAPI } from '../services/api';

// --- Fallback Scenario Generator ---
const generateScenarios = (language, interestsStr) => {
    // Basic templates for common categories
    const templates = {
        'Business': [
             { title: "Business Introduction", tasks: ["Introduce yourself and your role", "Ask about the company", "Exchange business cards"] },
             { title: "Meeting Participation", tasks: ["State your opinion", "Agree with a colleague", "Ask for clarification"] },
             { title: "Negotiation Basics", tasks: ["Make an offer", "Reject a proposal politely", "Suggest a compromise"] },
             { title: "Client Call", tasks: ["Schedule a meeting", "Confirm details", "End the call professionally"] },
             { title: "Presentation Q&A", tasks: ["Answer a difficult question", "Thank the audience", "Summarize key points"] },
             { title: "Networking Event", tasks: ["Start a conversation", "Discuss industry trends", "Ask for contact info"] },
             { title: "Job Interview", tasks: ["Describe your strengths", "Explain a past challenge", "Ask about the team"] },
             { title: "Office Small Talk", tasks: ["Ask about the weekend", "Discuss lunch plans", "Talk about current events"] },
             { title: "Email Dictation", tasks: ["Draft a formal request", "Write a follow-up", "Close an email"] },
             { title: "Project Update", tasks: ["Report progress", "Mention a blocker", "Ask for resources"] }
        ],
        'Travel': [
             { title: "Airport Check-in", tasks: ["Ask for an aisle seat", "Check luggage", "Ask about boarding time"] },
             { title: "Hotel Reservation", tasks: ["Book a double room", "Ask for breakfast", "Request late check-out"] },
             { title: "Asking Directions", tasks: ["Ask where the subway is", "Ask how far it is", "Thank the person"] },
             { title: "Ordering Food", tasks: ["Ask for the menu", "Order a main dish", "Ask for the bill"] },
             { title: "Shopping", tasks: ["Ask for a different size", "Ask about the price", "Ask for a discount"] },
             { title: "Taxi/Uber", tasks: ["Give destination", "Ask about fare", "Ask to stop here"] },
             { title: "Emergency", tasks: ["Ask for help", "Report lost item", "Find a pharmacy"] },
             { title: "Museum Visit", tasks: ["Buy a ticket", "Ask for an audio guide", "Ask about closing time"] },
             { title: "Train Travel", tasks: ["Buy a ticket", "Find the platform", "Ask about delays"] },
             { title: "Making Friends", tasks: ["Introduce yourself", "Ask about hobbies", "Exchange contacts"] }
        ],
        'Daily Life': [
             { title: "Self Introduction", tasks: ["Name and age", "Where you live", "Your job/study"] },
             { title: "Ordering Coffee", tasks: ["Order a drink", "Ask for sugar/milk", "Pay by card"] },
             { title: "Grocery Shopping", tasks: ["Ask where milk is", "Ask about freshness", "Pay at checkout"] },
             { title: "Talking about Weather", tasks: ["Describe today's weather", "Ask about tomorrow", "Comment on the season"] },
             { title: "Hobbies", tasks: ["Describe what you like", "Ask someone's hobby", "Suggest doing it together"] },
             { title: "Family", tasks: ["Talk about siblings", "Describe parents", "Mention pets"] },
             { title: "Weekend Plans", tasks: ["Say what you will do", "Ask a friend's plan", "Invite someone out"] },
             { title: "At the Doctor", tasks: ["Describe symptoms", "Ask for medicine", "Ask about recovery"] },
             { title: "Asking Help", tasks: ["Ask to lift something", "Ask to hold the door", "Thank profusely"] },
             { title: "Small Talk", tasks: ["Compliment clothing", "Ask about the day", "Say goodbye"] }
        ]
    };

    // Determine category based on interest string (simple keyword matching)
    let category = 'Daily Life'; // Default
    const lowerInterests = (interestsStr || '').toLowerCase();
    
    if (lowerInterests.includes('business') || lowerInterests.includes('work') || lowerInterests.includes('career') || lowerInterests.includes('job') || lowerInterests.includes('商')) {
        category = 'Business';
    } else if (lowerInterests.includes('travel') || lowerInterests.includes('trip') || lowerInterests.includes('tour') || lowerInterests.includes('旅')) {
        category = 'Travel';
    }

    // Clone and adjust titles for language if needed (MVP: keep English titles for clarity, maybe add localized subtitles later)
    let selectedScenarios = [...templates[category]];

    // Ensure we have exactly 10
    return selectedScenarios.slice(0, 10);
};

function Discovery() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [activeGoal, setActiveGoal] = useState(null);
  const [activeSessions, setActiveSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [userProficiency, setUserProficiency] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Scenarios State
  const [scenarios, setScenarios] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
        if (!user) return;

        try {
            if (!user.native_language) {
                navigate('/onboarding');
                return;
            }

            const goalRes = await userAPI.getActiveGoal();
            if (!goalRes || !goalRes.goal) {
                navigate('/goal-setting');
                return;
            }
            setActiveGoal(goalRes.goal);
            
            // Set Scenarios
            if (goalRes.goal.scenarios && goalRes.goal.scenarios.length > 0) {
                setScenarios(goalRes.goal.scenarios);
            } else {
                // Smart Fallback Generation
                const generated = generateScenarios(goalRes.goal.target_language, goalRes.goal.interests);
                setScenarios(generated);
            }

            const statsRes = await historyAPI.getStats(user.id);
            if (statsRes && statsRes.data) {
                setStats(statsRes.data);
                setUserProficiency(statsRes.data.proficiency || 0);
            }

            // Fetch History to find sessions with metadata (like topic)
            const historyRes = await historyAPI.getUserHistory(user.id);
            if (historyRes && historyRes.data) {
                // historyRes.data is the list of conversations
                // Filter distinct sessions by topic? Or just keep them all.
                // We want to use this list to check if a scenario has been started.
                setActiveSessions(historyRes.data); 
            }

        } catch (e) {
            console.error('Error fetching discovery data:', e);
        } finally {
            setLoading(false);
        }
    };
    
    fetchData();
  }, [user, navigate, location.key]); // Trigger re-fetch on navigation back to this page

  const handleStartNewSession = () => {
      // Default to first scenario
      if (scenarios.length > 0) {
          handleScenarioClick(scenarios[0]);
      } else {
          navigate(`/conversation?scenario=tutor`);
      }
  };

  const handleResumeSession = (sessionId) => {
      navigate(`/conversation?sessionId=${sessionId}`);
  };

  const handleScenarioClick = (scenario) => {
      // Check if there is already an active session for this scenario/topic
      // We search in the history list we fetched (activeSessions now contains full objects)
      const existingSession = activeSessions.find(s => 
          s.topic === scenario.title || 
          (s.topic && s.topic.includes(scenario.title))
      );

      if (existingSession) {
          console.log('Resuming existing session for scenario:', scenario.title, existingSession.sessionId);
          navigate(`/conversation?sessionId=${existingSession.sessionId}&scenario=${encodeURIComponent(scenario.title)}`, {
              state: { tasks: scenario.tasks }
          });
      } else {
          // Navigate with scenario title and tasks
          navigate(`/conversation?scenario=${encodeURIComponent(scenario.title)}`, {
              state: { tasks: scenario.tasks }
          });
      }
  };

  if (loading) {
      return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  // Calculate overall progress
  // MVP: Simply based on proficiency or scenarios completed (if we tracked that)
  const progress = Math.min(100, userProficiency);

  return (
    <div className="relative flex flex-col min-h-screen w-full bg-background-light dark:bg-background-dark">
      
      <main className="flex-grow pb-28">
        {/* Header */}
        <div className="flex flex-col gap-2 p-4 pb-2">
          <div className="flex h-12 items-center justify-between">
            <p className="text-3xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white">发现</p>
            <div className="flex items-center gap-2">
                <div className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                    🔥 {stats?.learningDays || 0} 天
                </div>
            </div>
          </div>
        </div>

        {/* Active Goal / Progress Card */}
        {activeGoal && (
            <div className="px-4 py-2">
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
                     {/* Decorative Circles */}
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl"></div>
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500 opacity-20 rounded-full blur-xl"></div>
                    
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <p className="text-xs font-medium text-indigo-100 mb-1">当前目标 (Goal)</p>
                                <h2 className="text-2xl font-bold tracking-tight mb-1">{activeGoal.target_language}</h2>
                                <p className="text-sm text-indigo-100 opacity-90 mb-2">{activeGoal.description}</p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    <span className="bg-white/20 px-2 py-0.5 rounded text-xs backdrop-blur-sm">
                                        Level: {activeGoal.target_level}
                                    </span>
                                    {activeGoal.interests && (
                                        <span className="bg-white/20 px-2 py-0.5 rounded text-xs backdrop-blur-sm">
                                            Topic: {activeGoal.interests}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-3xl font-bold text-white">{userProficiency}</p>
                                <p className="text-xs text-indigo-200">熟练度</p>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div>
                            <div className="flex justify-between text-xs font-medium text-indigo-100 mb-2">
                                <span>总体进度</span>
                                <span>{progress}%</span>
                            </div>
                            <div className="h-3 bg-black/20 rounded-full overflow-hidden backdrop-blur-sm">
                                <div 
                                    className="h-full bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Scenario List (Grid Layout) */}
        <div className="px-4 py-6">
             <div className="flex items-center justify-between mb-4">
                 <h3 className="text-xl font-bold text-slate-900 dark:text-white">场景练习 (Scenarios)</h3>
                 <span className="text-xs text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                     {scenarios.length} Missions
                 </span>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 {scenarios.map((scenario, index) => {
                     // MVP Status Logic: Unlock 1 by 1 or all unlocked?
                     // Let's assume all unlocked for now to reduce complexity, or unlock based on index <= progress/10
                     const isLocked = false; 

                     return (
                         <div 
                            key={index}
                            onClick={() => !isLocked && handleScenarioClick(scenario)}
                            className={`relative p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer overflow-hidden group hover:shadow-lg
                                ${isLocked 
                                    ? 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 opacity-60'
                                    : 'bg-white dark:bg-slate-800 border-indigo-100 dark:border-indigo-900/30 hover:border-indigo-300' 
                                }
                            `}
                         >
                             <div className="flex justify-between items-start mb-3">
                                 <span className={`text-xs font-bold px-2 py-0.5 rounded-md
                                     ${isLocked ? 'bg-slate-200 text-slate-500' : 'bg-indigo-50 text-indigo-600'}
                                 `}>
                                     Mission {index + 1}
                                 </span>
                                 {isLocked ? (
                                     <span className="material-symbols-outlined text-slate-400 text-lg">lock</span>
                                 ) : (
                                     <span className="material-symbols-outlined text-indigo-500 text-lg group-hover:scale-110 transition-transform">arrow_forward</span>
                                 )}
                             </div>
                             
                             <h4 className="font-bold text-base mb-2 text-slate-800 dark:text-slate-100">
                                 {scenario.title}
                             </h4>
                             
                             {/* Tasks Preview */}
                             <div className="space-y-1">
                                 {scenario.tasks && scenario.tasks.slice(0, 3).map((task, tIdx) => {
                                     const taskText = typeof task === 'object' ? (task.text || task.description || JSON.stringify(task)) : task;
                                     return (
                                         <div key={tIdx} className="flex items-center gap-2 text-xs text-slate-500">
                                             <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                             <span className="truncate">{taskText}</span>
                                         </div>
                                     );
                                 })}
                             </div>
                         </div>
                     );
                 })}
             </div>
        </div>

        {/* My Sessions Section (Compact) */}
        <div className="px-4 py-2">
             <div className="flex justify-between items-center mb-3">
                 <h3 className="text-lg font-bold text-slate-900 dark:text-white">最近练习</h3>
                 <button 
                    onClick={handleStartNewSession}
                    className="text-primary text-sm font-medium hover:underline">
                    新建练习
                 </button>
             </div>
             
             {activeSessions.length > 0 ? (
                 <div className="space-y-3">
                     {activeSessions.slice(0, 3).map((session, index) => (
                         <div 
                             key={session.sessionId} 
                             onClick={() => handleResumeSession(session.sessionId)}
                             className="flex items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                             <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                                 <span className="material-symbols-outlined text-lg">history</span>
                             </div>
                             <div className="flex-1 min-w-0">
                                 <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                     {session.topic || `练习 #${index + 1}`}
                                 </p>
                                 <p className="text-xs text-slate-400 truncate font-mono">
                                     {new Date(session.startTime).toLocaleDateString()} • {session.sessionId.slice(0, 8)}...
                                 </p>
                             </div>
                         </div>
                     ))}
                 </div>
             ) : (
                 <p className="text-sm text-slate-400 text-center py-4">暂无历史记录</p>
             )}
        </div>
      </main>

      <BottomNav currentPage="discovery" />
    </div>
  );
}

export default Discovery;