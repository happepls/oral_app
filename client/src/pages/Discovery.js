import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, conversationAPI, historyAPI } from '../services/api';

// --- Level Configuration (MVP: Hardcoded) ---
const LEVELS = [
    { 
        id: 1, 
        minScore: 0, 
        title: "Level 1: 基础起步", 
        desc: "简单句型与日常问候",
        points: [
            { title: "Simple Present (一般现在时)", content: "Used for facts, habits, and general truths. e.g., 'I play tennis.'" },
            { title: "To Be Verbs", content: "Am, Is, Are usage. e.g., 'She is a doctor.'" }
        ]
    },
    { 
        id: 2, 
        minScore: 10, 
        title: "Level 2: 过去与未来", 
        desc: "描述经历与计划",
        points: [
            { title: "Simple Past (一般过去时)", content: "Actions completed in the past. e.g., 'I walked home.'" },
            { title: "Simple Future (一般将来时)", content: "Will / Going to. e.g., 'I will help you.'" }
        ]
    },
    { 
        id: 3, 
        minScore: 20, 
        title: "Level 3: 持续进行", 
        desc: "正在发生的动作",
        points: [
            { title: "Present Continuous", content: "Action happening now. e.g., 'I am eating.'" },
            { title: "Past Continuous", content: "Action in progress in the past. e.g., 'I was sleeping.'" }
        ]
    },
    { 
        id: 4, 
        minScore: 30, 
        title: "Level 4: 完成状态", 
        desc: "经验与结果",
        points: [
            { title: "Present Perfect", content: "Past action with present result. e.g., 'I have finished.'" },
            { title: "For vs Since", content: "Duration vs Start point." }
        ]
    },
    { 
        id: 5, 
        minScore: 40, 
        title: "Level 5: 比较与最高", 
        desc: "描述差异",
        points: [
            { title: "Comparatives", content: "Better, Faster, More interesting." },
            { title: "Superlatives", content: "Best, Fastest, Most interesting." }
        ]
    },
    { 
        id: 6, 
        minScore: 50, 
        title: "Level 6: 假设与条件", 
        desc: "如果...会怎样",
        points: [
            { title: "First Conditional", content: "Real possibility. 'If it rains, I will stay home.'" },
            { title: "Second Conditional", content: "Unreal/Hypothetical. 'If I won the lottery...'" }
        ]
    },
    { 
        id: 7, 
        minScore: 60, 
        title: "Level 7: 被动语态", 
        desc: "强调动作承受者",
        points: [
            { title: "Passive Voice", content: "Focus on object. 'The book was written by him.'" },
            { title: "By + Agent", content: "When to specify the doer." }
        ]
    },
    { 
        id: 8, 
        minScore: 70, 
        title: "Level 8: 复杂从句", 
        desc: "长难句构建",
        points: [
            { title: "Relative Clauses", content: "Who, Which, That. 'The man who called you...'" },
            { title: "Noun Clauses", content: "Using 'That' or 'Wh-' words as objects." }
        ]
    },
    { 
        id: 9, 
        minScore: 80, 
        title: "Level 9: 虚拟与倒装", 
        desc: "高级表达技巧",
        points: [
            { title: "Subjunctive Mood", content: "Wishes, demands. 'I suggest that he go.'" },
            { title: "Inversion", content: "Emphasis. 'Never have I seen such a thing.'" }
        ]
    },
    { 
        id: 10, 
        minScore: 90, 
        title: "Level 10: 毕业挑战", 
        desc: "综合运用与地道表达",
        points: [
            { title: "Idioms & Phrasal Verbs", content: "Native-like expressions." },
            { title: "Nuance & Register", content: "Formal vs Informal tone." }
        ]
    }
];

function Discovery() {
  const navigate = useNavigate();
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
            
            // Set Scenarios (with Fallback for legacy goals)
            if (goalRes.goal.scenarios && goalRes.goal.scenarios.length > 0) {
                setScenarios(goalRes.goal.scenarios);
            } else {
                // Fallback for existing goals without scenarios
                setScenarios([
                    { title: "General Practice", tasks: ["Discuss daily routine", "Practice past tense", "Talk about hobbies"] },
                    { title: "Travel Basics", tasks: ["Ask for directions", "Order food", "Book a hotel"] }
                ]);
            }

            const statsRes = await historyAPI.getStats(user.id);
            if (statsRes && statsRes.data) {
                setStats(statsRes.data);
                setUserProficiency(statsRes.data.proficiency || 0);
            }

            const goalId = goalRes.goal.id || goalRes.goal._id;
            const sessionsRes = await conversationAPI.getActiveSessions(user.id, goalId);
            if (sessionsRes && sessionsRes.sessions) {
                setActiveSessions(sessionsRes.sessions);
            }

        } catch (e) {
            console.error('Error fetching discovery data:', e);
        } finally {
            setLoading(false);
        }
    };
    
    fetchData();
  }, [user, navigate]);

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
      // Navigate with scenario title and tasks
      // We pass tasks via state to avoid re-fetching in Conversation
      navigate(`/conversation?scenario=${encodeURIComponent(scenario.title)}`, {
          state: { tasks: scenario.tasks }
      });
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
                                <p className="text-xs font-medium text-indigo-100 mb-1">当前目标</p>
                                <h2 className="text-2xl font-bold tracking-tight">{activeGoal.description || activeGoal.target_language}</h2>
                                <p className="text-sm text-indigo-100 opacity-80">{activeGoal.target_level} • {activeGoal.completion_time_days} Days</p>
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
                                 {scenario.tasks && scenario.tasks.slice(0, 3).map((task, tIdx) => (
                                     <div key={tIdx} className="flex items-center gap-2 text-xs text-slate-500">
                                         <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                         <span className="truncate">{task}</span>
                                     </div>
                                 ))}
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
                     {activeSessions.slice(0, 3).map((sessionId, index) => (
                         <div 
                             key={sessionId} 
                             onClick={() => handleResumeSession(sessionId)}
                             className="flex items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                             <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                                 <span className="material-symbols-outlined text-lg">history</span>
                             </div>
                             <div className="flex-1 min-w-0">
                                 <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                     练习 #{index + 1}
                                 </p>
                                 <p className="text-xs text-slate-400 truncate font-mono">
                                     {sessionId.slice(0, 8)}...
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