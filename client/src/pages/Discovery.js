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
  const [showAchievement, setShowAchievement] = useState(false);
  const [showGoalSwitch, setShowGoalSwitch] = useState(false);
  const [allGoals, setAllGoals] = useState([]);
  const [switching, setSwitching] = useState(false);
  const [hasOtherGoals, setHasOtherGoals] = useState(false);

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
            checkAchievement(goalRes.goal);

            // Check if user has other goals to enable the switch button
            try {
                const goalsRes = await userAPI.getUserGoals();
                const otherGoals = (goalsRes.goals || []).filter(g => g.status !== 'active');
                setHasOtherGoals(otherGoals.length > 0);
            } catch (e) {
                setHasOtherGoals(false);
            }

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

    const checkAchievement = (goal) => {
        if (!goal || !goal.scenarios || goal.scenarios.length === 0) return;
        const allDone = goal.scenarios.every(s =>
            s.tasks && s.tasks.length > 0 && s.tasks.every(t => typeof t === 'object' && t.status === 'completed')
        );
        if (allDone) {
            const key = `goal_all_completed_${goal.id}`;
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, 'true');
                setShowAchievement(true);
            }
        }
    };
    
    fetchData();
  }, [user, navigate, location.key]); // Trigger re-fetch on navigation back to this page

  const handleOpenSwitch = async () => {
    try {
      const res = await userAPI.getUserGoals();
      setAllGoals(res.goals || []);
      setShowGoalSwitch(true);
    } catch (e) {
      console.error('Failed to load goals:', e);
    }
  };

  const handleSwitchGoal = async (goalId) => {
    setSwitching(true);
    try {
      await userAPI.switchGoal(goalId);
      setShowGoalSwitch(false);
      navigate(location.pathname, { replace: true });
    } catch (e) {
      console.error('Failed to switch goal:', e);
    } finally {
      setSwitching(false);
    }
  };

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

  // Calculate overall progress based on scenario completion
  let progress = 0;
  let nextMission = null; // { index, title, nextTask } of first incomplete scenario
  if (activeGoal && activeGoal.scenarios && activeGoal.scenarios.length > 0) {
    const totalScenarios = activeGoal.scenarios.length;
    let completedScenarios = 0;

    activeGoal.scenarios.forEach((scenario, idx) => {
      const hasTasks = scenario.tasks && scenario.tasks.length > 0;
      const allDone = hasTasks && scenario.tasks.every(task =>
        typeof task === 'object' && task.status === 'completed'
      );
      if (allDone) {
        completedScenarios++;
      } else if (!nextMission) {
        // Find the first incomplete task within this scenario
        const firstIncompleteTask = scenario.tasks && scenario.tasks.find(task =>
          typeof task === 'object' ? task.status !== 'completed' : true
        );
        const nextTaskText = firstIncompleteTask
          ? (typeof firstIncompleteTask === 'object' ? firstIncompleteTask.text || firstIncompleteTask.description : firstIncompleteTask)
          : null;
        nextMission = { index: idx + 1, title: scenario.title, nextTask: nextTaskText };
      }
    });

    progress = Math.round((completedScenarios / totalScenarios) * 100);
  } else {
    // Fallback to proficiency if no scenarios
    progress = Math.min(100, userProficiency);
  }

  // Calculate remaining days
  let remainingDays = null;
  if (activeGoal) {
    const durationDays = activeGoal.duration_days || 60;
    const createdAt = activeGoal.created_at ? new Date(activeGoal.created_at) : null;
    if (createdAt) {
      const daysElapsed = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      remainingDays = Math.max(0, durationDays - daysElapsed);
    }
  }

  return (
    <div className="relative flex flex-col min-h-screen w-full bg-background-light dark:bg-background-dark">

      {/* Achievement Badge Modal */}
      {showAchievement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="text-7xl mb-3">🏆</div>
            <div className="flex justify-center gap-1 mb-3">
              {['🌟','🌟','🌟'].map((s, i) => <span key={i} className="text-2xl">{s}</span>)}
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">目标全部完成！</h2>
            <p className="text-sm text-indigo-600 font-semibold mb-2">Achievement Unlocked</p>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
              太棒了！你已完成所有 {scenarios.length} 个场景练习，成功达到 <span className="font-bold text-indigo-600">{activeGoal?.target_level}</span> 水平目标！<br />
              是时候挑战下一个更高的目标了！
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAchievement(false)}
                className="flex-1 py-3 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                稍后再说
              </button>
              <button
                onClick={() => { setShowAchievement(false); navigate('/goal-setting'); }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium text-sm hover:opacity-90 transition-opacity"
              >
                制定新目标
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goal Switch Modal */}
      {showGoalSwitch && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
             onClick={() => setShowGoalSwitch(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-t-2xl w-full max-w-lg p-5 pb-8 max-h-[70vh] overflow-y-auto"
               onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">切换学习目标</h3>
            {allGoals.filter(g => g.status !== 'active').map(goal => {
              const pct = goal.current_proficiency || 0;
              const badgeColor = pct >= 80 ? 'bg-emerald-100 text-emerald-700'
                               : pct >= 40 ? 'bg-indigo-100 text-indigo-600'
                                           : 'bg-slate-100 text-slate-500';
              return (
                <button key={goal.id}
                  onClick={() => handleSwitchGoal(goal.id)}
                  disabled={switching}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors mb-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">{goal.target_language}</p>
                    <p className="text-xs text-slate-500">{goal.target_level} · {new Date(goal.created_at).toLocaleDateString('zh-CN')}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>{pct}%</span>
                </button>
              );
            })}
            {allGoals.filter(g => g.status !== 'active').length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">暂无其他存量目标</p>
            )}
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
                            <div className="flex-1 min-w-0 pr-4">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-xs font-medium text-indigo-100">当前目标 (Goal)</p>
                                  {hasOtherGoals && (
                                    <button
                                      onClick={handleOpenSwitch}
                                      className="flex items-center gap-0.5 text-xs text-indigo-200 hover:text-white transition-colors"
                                      title="切换目标"
                                    >
                                      <span className="material-symbols-outlined text-sm">swap_horiz</span>
                                      <span>切换</span>
                                    </button>
                                  )}
                                </div>
                                <h2 className="text-2xl font-bold tracking-tight mb-1">{activeGoal.target_language}</h2>
                                {nextMission ? (
                                    <div className="mb-2">
                                        <p className="text-xs text-indigo-200 opacity-80">
                                            Mission {nextMission.index}: {nextMission.title}
                                        </p>
                                        {nextMission.nextTask && (
                                            <p
                                                className="text-sm font-semibold text-yellow-300 mt-0.5 cursor-pointer hover:text-yellow-100 transition-colors underline-offset-2 hover:underline"
                                                onClick={() => {
                                                    const scenario = scenarios[nextMission.index - 1];
                                                    if (scenario) handleScenarioClick(scenario);
                                                }}
                                            >
                                                → {nextMission.nextTask}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm text-emerald-300 font-semibold mb-2">🎉 所有任务已完成！</p>
                                )}
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-2xl font-bold text-white">{activeGoal.target_level || 'B1'}</p>
                                <p className="text-xs text-indigo-200">目标水平</p>
                                {remainingDays !== null && (
                                    <div className={`mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${remainingDays <= 7 ? 'bg-red-400/40 text-red-100' : remainingDays <= 14 ? 'bg-yellow-400/30 text-yellow-100' : 'bg-white/20 text-indigo-100'}`}>
                                        剩 {remainingDays} 天
                                    </div>
                                )}
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

        {/* All Complete CTA Banner */}
        {progress === 100 && (
          <div className="px-4 pt-2 pb-0">
            <div
              onClick={() => navigate('/goal-setting')}
              className="flex items-center gap-3 bg-gradient-to-r from-yellow-400/20 to-orange-400/20 border-2 border-yellow-400/60 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all"
            >
              <span className="text-3xl">🏆</span>
              <div className="flex-1">
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">所有场景已完成！</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">点击制定下一阶段新目标 →</p>
              </div>
              <span className="material-symbols-outlined text-yellow-500">arrow_forward</span>
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
                     const isLocked = false;
                     const hasTasks = scenario.tasks && scenario.tasks.length > 0;
                     const isCompleted = hasTasks && scenario.tasks.every(task =>
                         typeof task === 'object' && task.status === 'completed'
                     );

                     return (
                         <div
                            key={index}
                            onClick={() => !isLocked && handleScenarioClick(scenario)}
                            className={`relative p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer overflow-hidden group hover:shadow-lg
                                ${isLocked
                                    ? 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 opacity-60'
                                    : isCompleted
                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'
                                        : 'bg-white dark:bg-slate-800 border-indigo-100 dark:border-indigo-900/30 hover:border-indigo-300'
                                }
                            `}
                         >
                             <div className="flex justify-between items-start mb-3">
                                 <span className={`text-xs font-bold px-2 py-0.5 rounded-md
                                     ${isLocked ? 'bg-slate-200 text-slate-500' : isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-50 text-indigo-600'}
                                 `}>
                                     Mission {index + 1}
                                 </span>
                                 {isLocked ? (
                                     <span className="material-symbols-outlined text-slate-400 text-lg">lock</span>
                                 ) : isCompleted ? (
                                     <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
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
                                     const taskDone = typeof task === 'object' && task.status === 'completed';
                                     return (
                                         <div key={tIdx} className="flex items-center gap-2 text-xs text-slate-500">
                                             <span className={`w-1.5 h-1.5 rounded-full ${taskDone ? 'bg-emerald-400' : 'bg-slate-300'}`}></span>
                                             <span className={`truncate ${taskDone ? 'line-through text-slate-400' : ''}`}>{taskText}</span>
                                         </div>
                                     );
                                 })}
                             </div>

                             {isCompleted && (
                                 <div className="mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                     已完成 ✓
                                 </div>
                             )}
                         </div>
                     );
                 })}
             </div>
        </div>

        {/* Free Chat Section */}
        <div className="px-4 py-4">
             <div 
                onClick={() => navigate('/conversation?scenario=general')}
                className="flex items-center gap-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 p-4 rounded-xl border-2 border-purple-200 dark:border-purple-900/50 cursor-pointer hover:shadow-lg transition-all">
                 <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white flex items-center justify-center shrink-0">
                     <span className="material-symbols-outlined text-2xl">chat</span>
                 </div>
                 <div className="flex-1">
                     <h3 className="text-lg font-bold text-slate-900 dark:text-white">随便聊俩</h3>
                     <p className="text-sm text-slate-500 dark:text-slate-400">自由对话模式，随心练习口语</p>
                 </div>
                 <span className="material-symbols-outlined text-purple-500">arrow_forward</span>
             </div>
        </div>
      </main>

      <BottomNav currentPage="discovery" />
    </div>
  );
}

export default Discovery;