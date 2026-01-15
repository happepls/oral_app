import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, conversationAPI } from '../services/api';

function Discovery() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeGoal, setActiveGoal] = useState(null);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
        if (!user) return;

        try {
            // 1. Check Profile (Native Language as proxy for Onboarding completion)
            if (!user.native_language) {
                navigate('/onboarding');
                return;
            }

            // 2. Check Active Goal
            const goalRes = await userAPI.getActiveGoal();
            if (!goalRes || !goalRes.goal) {
                navigate('/goal-setting');
                return;
            }
            setActiveGoal(goalRes.goal);

            // 3. Fetch Active Sessions for this Goal
            const goalId = goalRes.goal.id || goalRes.goal._id;
            const sessionsRes = await conversationAPI.getActiveSessions(user.id, goalId);
            if (sessionsRes && sessionsRes.sessions) {
                setActiveSessions(sessionsRes.sessions);
            }

        } catch (e) {
            console.error('Error fetching discovery data:', e);
            // navigate('/goal-setting');
        } finally {
            setLoading(false);
        }
    };
    
    fetchData();
  }, [user, navigate]);

  const handleStartNewSession = () => {
      // Navigating to /conversation without params triggers new session creation
      navigate('/conversation');
  };

  const handleResumeSession = (sessionId) => {
      navigate(`/conversation?sessionId=${sessionId}`);
  };

  const handleSwitchGoal = () => {
      navigate('/goal-setting');
  };

  const topics = [
    { name: '旅游观光', level: '中级', gradient: 'from-purple-400 to-orange-400' },
    { name: '商务英语', level: '高级', gradient: 'from-blue-400 to-green-400' },
    { name: '日常生活', level: '初级', gradient: 'from-pink-400 to-yellow-400' }
  ];

  const aiPartners = [
    { name: 'Tom', role: '科技爱好者', avatar: '👨‍💻' },
    { name: 'Maria', role: '旅行博主', avatar: '✈️' },
    { name: 'Leo', role: '音乐评论家', avatar: '🎵' },
    { name: 'Chloe', role: 'CEO', avatar: '👩‍💼' }
  ];

  const conversations = [
    { title: '餐厅点餐', duration: '10 分钟', icon: 'restaurant' },
    { title: '面试练习', duration: '20 分钟', icon: 'work' }
  ];

  if (loading) {
      return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="relative flex flex-col min-h-screen w-full bg-background-light dark:bg-background-dark">
      <main className="flex-grow pb-28">
        {/* Header */}
        <div className="flex flex-col gap-2 p-4 pb-2">
          <div className="flex h-12 items-center justify-between">
            <p className="text-3xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white">发现</p>
            <button className="flex h-12 w-12 items-center justify-center text-slate-900 dark:text-white">
              <span className="material-symbols-outlined text-2xl">notifications</span>
            </button>
          </div>
        </div>

        {/* Active Goal Section */}
        {activeGoal && (
            <div className="px-4 py-2">
                <div className="bg-gradient-to-r from-primary to-blue-600 rounded-xl p-4 text-white shadow-lg">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm opacity-90">当前目标</p>
                            <h2 className="text-xl font-bold mt-1">{activeGoal.target_language} - {activeGoal.type}</h2>
                            <p className="text-sm opacity-80 mt-1">
                                {activeGoal.duration_days} 天计划 • {activeGoal.daily_minutes} 分钟/天
                            </p>
                        </div>
                        <button 
                            onClick={handleSwitchGoal}
                            className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-xs transition-colors backdrop-blur-sm">
                            切换
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* My Sessions Section (New Feature) */}
        <div className="px-4 py-4">
             <div className="flex justify-between items-center mb-3">
                 <h3 className="text-xl font-bold text-slate-900 dark:text-white">我的练习</h3>
                 <button 
                    onClick={handleStartNewSession}
                    className="flex items-center gap-1 text-primary font-medium text-sm">
                    <span className="material-symbols-outlined text-lg">add_circle</span>
                    新建
                 </button>
             </div>
             
             {activeSessions.length > 0 ? (
                 <div className="grid gap-3">
                     {activeSessions.map((sessionId, index) => (
                         <div 
                             key={sessionId} 
                             onClick={() => handleResumeSession(sessionId)}
                             className="flex items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 cursor-pointer hover:border-primary transition-colors">
                             <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                 <span className="material-symbols-outlined">forum</span>
                             </div>
                             <div className="flex-1 min-w-0">
                                 <p className="font-medium truncate text-slate-900 dark:text-white">
                                     会话 #{index + 1}
                                 </p>
                                 <p className="text-xs text-slate-500 truncate font-mono mt-0.5">
                                     ID: {sessionId.slice(0, 8)}...
                                 </p>
                             </div>
                             <span className="material-symbols-outlined text-slate-400">arrow_forward_ios</span>
                         </div>
                     ))}
                 </div>
             ) : (
                 <div className="text-center py-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                     <p className="text-slate-500 text-sm">暂无活跃会话</p>
                     <button 
                        onClick={handleStartNewSession}
                        className="mt-2 text-primary text-sm font-medium">
                        开始第一次练习
                     </button>
                 </div>
             )}
        </div>

        {/* Search Bar */}
        <div className="px-4 py-3">
          <label className="flex h-12 w-full flex-col">
            <div className="flex h-full w-full items-stretch rounded-xl overflow-hidden">
              <div className="flex items-center justify-center bg-slate-200 dark:bg-slate-800 pl-4 text-slate-500 dark:text-slate-400">
                <span className="material-symbols-outlined text-2xl">search</span>
              </div>
              <input 
                className="flex-1 px-2 py-2 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 border-none outline-none focus:ring-0"
                placeholder="搜索主题、伙伴..."
              />
            </div>
          </label>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-3 overflow-x-auto p-4 pt-1 no-scrollbar">
          <div className="flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-full bg-primary px-4 text-white cursor-pointer">
            <p className="text-sm font-medium">全部</p>
          </div>
          <div className="flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-full bg-slate-200 dark:bg-slate-800 px-4 cursor-pointer">
            <p className="text-sm font-medium text-slate-900 dark:text-white">主题</p>
          </div>
          <div className="flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-full bg-slate-200 dark:bg-slate-800 px-4 cursor-pointer">
            <p className="text-sm font-medium text-slate-900 dark:text-white">会话</p>
          </div>
          <div className="flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-full bg-slate-200 dark:bg-slate-800 px-4 cursor-pointer">
            <p className="text-sm font-medium text-slate-900 dark:text-white">课程</p>
          </div>
        </div>

        {/* Recommended Topics */}
        <h3 className="px-4 pb-2 pt-4 text-xl font-bold text-slate-900 dark:text-white">为您推荐</h3>
        <div className="flex overflow-x-auto no-scrollbar">
          <div className="flex items-stretch gap-4 px-4 py-2">
            {topics.map((topic, index) => (
              <div key={index} className="flex w-64 shrink-0 flex-col gap-3 rounded-xl bg-white dark:bg-slate-800 p-3 cursor-pointer hover:shadow-lg transition-shadow">
                <div className={`aspect-video w-full rounded-lg bg-gradient-to-br ${topic.gradient}`}></div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{topic.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{topic.level}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Partners */}
        <h3 className="px-4 pb-2 pt-6 text-xl font-bold text-slate-900 dark:text-white">新的AI伙伴</h3>
        <div className="flex overflow-x-auto no-scrollbar">
          <div className="flex items-stretch gap-4 px-4 py-2">
            {aiPartners.map((partner, index) => (
              <div key={index} className="flex w-40 shrink-0 flex-col items-center gap-3 rounded-xl bg-white dark:bg-slate-800 p-4 text-center cursor-pointer hover:shadow-lg transition-shadow">
                <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-4xl">
                  {partner.avatar}
                </div>
                <div className="flex flex-col">
                  <p className="font-semibold text-slate-900 dark:text-white">{partner.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{partner.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trending Conversations */}
        <h3 className="px-4 pb-2 pt-6 text-xl font-bold text-slate-900 dark:text-white">热门会话</h3>
        <div className="flex flex-col gap-3 px-4 py-2">
          {conversations.map((conv, index) => (
            <div 
              key={index}
              onClick={() => navigate('/conversation')}
              className="flex items-center gap-4 rounded-xl bg-white dark:bg-slate-800 p-3 cursor-pointer hover:shadow-lg transition-shadow">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
                <span className="material-symbols-outlined">{conv.icon}</span>
              </div>
              <div className="flex-grow">
                <p className="font-medium text-slate-900 dark:text-white">{conv.title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{conv.duration}</p>
              </div>
              <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">chevron_right</span>
            </div>
          ))}
        </div>
      </main>

      <BottomNav currentPage="discovery" />
    </div>
  );
}

export default Discovery;
