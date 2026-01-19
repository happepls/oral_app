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
  
  // Modal State
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(null);

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

            const statsRes = await historyAPI.getStats(user.id);
            if (statsRes && statsRes.data) {
                setStats(statsRes.data);
                // Use proficiency from API (which now syncs with user-service)
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
      // Find first uncompleted level
      const nextLevel = LEVELS.find(l => userProficiency < l.minScore + 10) || LEVELS[LEVELS.length - 1];
      const defaultTopic = nextLevel.points[0].title;
      navigate(`/conversation?scenario=tutor&topic=${encodeURIComponent(defaultTopic)}`);
  };

  const handleResumeSession = (sessionId) => {
      navigate(`/conversation?sessionId=${sessionId}`);
  };

  const handleLevelClick = (level) => {
      if (userProficiency >= level.minScore) {
          // Unlocked
          setSelectedLevel(level);
          setShowLevelModal(true);
      } else {
          // Locked - Show simple toast or alert
          alert(`请先将熟练度提升至 ${level.minScore} 分以解锁此关卡！(当前: ${userProficiency})`);
      }
  };

  const handleStartLevelPractice = () => {
      if (!selectedLevel) return;
      // Use first point as topic, or maybe generic level topic
      const topic = `${selectedLevel.title}: ${selectedLevel.points.map(p => p.title).join(', ')}`;
      navigate(`/conversation?scenario=tutor&topic=${encodeURIComponent(topic)}`);
      setShowLevelModal(false);
  };

  if (loading) {
      return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  // Calculate overall progress based on proficiency (0-100)
  const progress = Math.min(100, userProficiency);

  return (
    <div className="relative flex flex-col min-h-screen w-full bg-background-light dark:bg-background-dark">
      
      {/* Level Detail Modal */}
      {showLevelModal && selectedLevel && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white dark:bg-slate-800 w-full sm:w-96 sm:rounded-2xl rounded-t-2xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
                  <div className="flex justify-between items-start mb-4">
                      <div>
                          <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedLevel.title}</h3>
                          <p className="text-sm text-slate-500">{selectedLevel.desc}</p>
                      </div>
                      <button 
                        onClick={() => setShowLevelModal(false)}
                        className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
                        <span className="material-symbols-outlined text-slate-400">close</span>
                      </button>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">语法要点</h4>
                      {selectedLevel.points.map((p, idx) => (
                          <div key={idx} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                              <p className="font-semibold text-primary text-sm mb-1">{p.title}</p>
                              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{p.content}</p>
                          </div>
                      ))}
                  </div>

                  <button 
                      onClick={handleStartLevelPractice}
                      className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-lg shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all active:scale-[0.98]">
                      开始练习
                  </button>
              </div>
          </div>
      )}

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
                                <h2 className="text-2xl font-bold tracking-tight">{activeGoal.target_language}</h2>
                                <p className="text-sm text-indigo-100 opacity-80">{activeGoal.type}</p>
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

        {/* Level Map (Grid Layout) */}
        <div className="px-4 py-6">
             <div className="flex items-center justify-between mb-4">
                 <h3 className="text-xl font-bold text-slate-900 dark:text-white">练习关卡</h3>
                 <span className="text-xs text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                     Level {Math.floor(userProficiency / 10) + 1}
                 </span>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                 {LEVELS.map((level) => {
                     const isUnlocked = userProficiency >= level.minScore;
                     const isCompleted = userProficiency >= (level.minScore + 10); // Simple logic
                     const isCurrent = isUnlocked && !isCompleted;

                     return (
                         <div 
                            key={level.id}
                            onClick={() => handleLevelClick(level)}
                            className={`relative p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer overflow-hidden group
                                ${isCurrent 
                                    ? 'bg-white dark:bg-slate-800 border-primary shadow-md scale-[1.02]' 
                                    : isCompleted 
                                        ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30' 
                                        : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 opacity-70'
                                }
                            `}
                         >
                             <div className="flex justify-between items-start mb-3">
                                 <span className={`text-xs font-bold px-2 py-0.5 rounded-md
                                     ${isCurrent ? 'bg-primary/10 text-primary' : isCompleted ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}
                                 `}>
                                     Lv.{level.id}
                                 </span>
                                 {isCompleted ? (
                                     <span className="material-symbols-outlined text-green-500 text-lg">check_circle</span>
                                 ) : !isUnlocked ? (
                                     <span className="material-symbols-outlined text-slate-400 text-lg">lock</span>
                                 ) : (
                                     <span className="material-symbols-outlined text-primary text-lg animate-pulse">play_circle</span>
                                 )}
                             </div>
                             
                             <h4 className={`font-bold text-sm mb-1 ${!isUnlocked && 'text-slate-400'}`}>
                                 {level.title.split(': ')[1]}
                             </h4>
                             <p className="text-xs text-slate-500 line-clamp-1">{level.desc}</p>
                             
                             {/* Progress Indication within Level (Optional) */}
                             {isCurrent && (
                                 <div className="absolute bottom-0 left-0 w-full h-1 bg-primary/10">
                                     <div 
                                        className="h-full bg-primary" 
                                        style={{ width: `${Math.min(100, (userProficiency - level.minScore) * 10)}%` }}
                                     ></div>
                                 </div>
                             )}
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