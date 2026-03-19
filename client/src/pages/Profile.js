import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { historyAPI, feedbackAPI, userAPI } from '../services/api';

function Profile() {
  const navigate = useNavigate();
  const { user, logout, refreshProfile } = useAuth();

  const [stats, setStats] = useState({ sessions: '0 次', practiceTime: '0 小时', totalSessions: 0 });
  const [loading, setLoading] = useState(true);

  // Checkin state
  const [checkinStats, setCheckinStats] = useState(null);
  const [checkinHistory, setCheckinHistory] = useState([]);
  const [isCheckinLoading, setIsCheckinLoading] = useState(false);
  const [showCheckinSuccess, setShowCheckinSuccess] = useState(false);
  const [checkinResult, setCheckinResult] = useState(null);

  // Goal state
  const [activeGoal, setActiveGoal] = useState(null);

  // Feedback state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState('功能建议');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  useEffect(() => {
    if (refreshProfile) refreshProfile();
  }, []);

  useEffect(() => {
    const fetchAll = async () => {
      if (!user?.id) { setLoading(false); return; }
      await Promise.allSettled([
        historyAPI.getStats(user.id).then(d => {
          const total = d?.totalSessions || 0;
          const hours = (total * 15 / 60).toFixed(1);
          setStats({
            sessions: `${total} 次`,
            practiceTime: `${hours} 小时`,
            totalSessions: total
          });
        }),
        userAPI.getCheckinStats().then(d => setCheckinStats(d)).catch(() => {}),
        userAPI.getCheckinHistory(30).then(d => setCheckinHistory(Array.isArray(d) ? d : [])).catch(() => {}),
        userAPI.getActiveGoal().then(d => setActiveGoal(d?.goal || d)).catch(() => {})
      ]);
      setLoading(false);
    };
    fetchAll();
  }, [user]);

  // Derive mastered scenarios from activeGoal (needed for achievements)
  const masteredScenarios = activeGoal?.scenarios
    ? activeGoal.scenarios.filter(s =>
        s.tasks && s.tasks.length > 0 && s.tasks.every(t => t.status === 'completed')
      )
    : [];

  // Data-driven achievements — computed after all state is loaded
  const totalCheckins = checkinStats?.totalCheckins || 0;
  const currentStreak = checkinStats?.currentStreak || 0;
  const achievements = [
    {
      name: '打卡新手',
      icon: '🔥',
      desc: '完成首次打卡',
      unlocked: totalCheckins >= 1
    },
    {
      name: '坚持一周',
      icon: '📅',
      desc: '连续打卡7天',
      unlocked: currentStreak >= 7
    },
    {
      name: '坚持一月',
      icon: '🗓️',
      desc: '连续打卡30天',
      unlocked: currentStreak >= 30
    },
    {
      name: '对话达人',
      icon: '💬',
      desc: '累计完成50次对话',
      unlocked: stats.totalSessions >= 50
    },
    {
      name: '场景初探',
      icon: '🎯',
      desc: '完成首个场景全部任务',
      unlocked: masteredScenarios.length >= 1
    },
    {
      name: '练习大师',
      icon: '🏆',
      desc: '100%完成3个以上学习目标',
      unlocked: false  // 需要历史目标完成数据
    },
    {
      name: '多语言Master',
      icon: '🌍',
      desc: '掌握3种以上目标语言练习闭环',
      unlocked: false  // 需要多目标语言完成数据
    }
  ];

  const menuItems = [
    { icon: 'history', label: '对话历史', path: '/history' },
    { icon: 'person', label: '账户设置', path: '/settings' },
    { icon: 'notifications', label: '通知', path: '/notifications' },
    { icon: 'workspace_premium', label: '订阅', path: '/subscription' },
    { icon: 'palette', label: '主题', value: '深色' },
    { icon: 'feedback', label: '意见反馈', onPress: () => setShowFeedbackModal(true) }
  ];

  const FEEDBACK_CATEGORIES = ['功能建议', '问题反馈', '其他'];
  const FEEDBACK_MAX_LENGTH = 500;

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim()) { setFeedbackError('请输入反馈内容'); return; }
    setFeedbackError('');
    setFeedbackSubmitting(true);
    try {
      await feedbackAPI.submit({ category: feedbackCategory, message: feedbackText.trim() });
      setFeedbackSubmitted(true);
    } catch (err) {
      setFeedbackError('提交失败，请稍后重试');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleFeedbackClose = () => {
    setShowFeedbackModal(false);
    setFeedbackText('');
    setFeedbackCategory('功能建议');
    setFeedbackError('');
    setFeedbackSubmitted(false);
  };

  const handleCheckin = async () => {
    if (checkinStats?.checkedInToday) return;
    setIsCheckinLoading(true);
    try {
      const result = await userAPI.checkin();
      setCheckinResult(result);
      setShowCheckinSuccess(true);
      const [newStats, newHistory] = await Promise.all([
        userAPI.getCheckinStats().catch(() => null),
        userAPI.getCheckinHistory(30).catch(() => [])
      ]);
      if (newStats) setCheckinStats(newStats);
      setCheckinHistory(Array.isArray(newHistory) ? newHistory : []);
    } catch (error) {
      console.error('Checkin failed:', error);
    } finally {
      setIsCheckinLoading(false);
    }
  };

  const getLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split('T')[0]);
    }
    return days;
  };

  const isDateCheckedIn = (dateStr) => {
    return checkinHistory.some(h => {
      const d = new Date(h.checkin_date).toISOString().split('T')[0];
      return d === dateStr;
    });
  };

  const getDayLabel = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) return '今';
    return ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  };

  const getDateNum = (dateStr) => new Date(dateStr).getDate();

  // Goal progress
  const goalTotalTasks = activeGoal?.scenarios
    ? activeGoal.scenarios.reduce((sum, s) => sum + (s.tasks?.length || 0), 0)
    : 0;
  const goalCompletedTasks = activeGoal?.scenarios
    ? activeGoal.scenarios.reduce((sum, s) =>
        sum + (s.tasks?.filter(t => t.status === 'completed').length || 0), 0)
    : 0;
  const goalProgress = goalTotalTasks > 0 ? Math.round((goalCompletedTasks / goalTotalTasks) * 100) : 0;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-background-light dark:bg-background-dark text-slate-900 dark:text-white">加载中...</div>;
  }

  return (
    <div className="relative flex flex-col min-h-screen w-full bg-background-light dark:bg-background-dark">
      {/* Top App Bar */}
      <div className="flex items-center bg-background-light dark:bg-background-dark p-4 pb-2 justify-between sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => navigate('/discovery')}
          className="flex items-center justify-center p-2 text-slate-900 dark:text-white">
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
        </button>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">我的账户</h1>
        <button className="flex items-center justify-center p-2 text-slate-900 dark:text-white">
          <span className="material-symbols-outlined text-2xl">settings</span>
        </button>
      </div>

      <main className="flex-grow pb-28">
        {/* Subscription Badge */}
        {user?.subscription_status === 'active' && (
          <div className="mx-4 mt-4 p-3 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">👑</span>
                <div>
                  <p className="text-white font-bold text-sm">会员已激活</p>
                  <p className="text-indigo-200 text-xs">享受全部高级功能</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/subscription')}
                className="px-3 py-1 bg-white/20 text-white text-xs rounded-lg">
                管理
              </button>
            </div>
          </div>
        )}

        {/* Profile Header */}
        <div className="flex p-4 pt-8">
          <div className="flex w-full flex-col gap-4 items-center">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Avatar" className="w-32 h-32 rounded-full border-4 border-primary object-cover" />
            ) : (
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 border-4 border-primary flex items-center justify-center text-4xl text-white font-bold">
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="flex flex-col items-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{user?.username || '用户'}</p>
              {activeGoal ? (
                <p className="text-base text-slate-600 dark:text-slate-400">
                  学习 {activeGoal.target_language}{activeGoal.target_level ? ` · ${activeGoal.target_level}` : ''}
                </p>
              ) : (
                <p className="text-base text-slate-600 dark:text-slate-400">开始你的语言之旅</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="flex gap-4 p-4">
          <div className="flex flex-1 flex-col gap-2 rounded-xl p-4 bg-white dark:bg-slate-800 shadow-sm">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">对话次数</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.sessions}</p>
          </div>
          <div className="flex flex-1 flex-col gap-2 rounded-xl p-4 bg-white dark:bg-slate-800 shadow-sm">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">总练习时长</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.practiceTime}</p>
          </div>
        </div>

        {/* Daily Checkin Section */}
        <div id="checkin-section" className="px-4 pb-4 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white pt-2">🔥 每日打卡</h2>

          {/* Checkin Stats Card */}
          <div className="bg-gradient-to-br from-primary to-blue-600 rounded-2xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-blue-100 text-sm">当前连续打卡</p>
                <p className="text-4xl font-bold">{checkinStats?.currentStreak || 0} <span className="text-lg font-normal">天</span></p>
              </div>
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl">local_fire_department</span>
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <div>
                <p className="text-blue-100">累计打卡</p>
                <p className="font-semibold">{checkinStats?.totalCheckins || 0} 天</p>
              </div>
              <div>
                <p className="text-blue-100">获得积分</p>
                <p className="font-semibold">{checkinStats?.totalPointsFromCheckins || 0}</p>
              </div>
            </div>
          </div>

          {/* Week Calendar */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="font-medium text-slate-900 dark:text-white mb-4">本周打卡</h3>
            <div className="grid grid-cols-7 gap-2">
              {getLast7Days().map(date => {
                const checked = isDateCheckedIn(date);
                const isToday = date === new Date().toISOString().split('T')[0];
                return (
                  <div key={date} className="flex flex-col items-center">
                    <span className="text-xs text-slate-500 mb-1">{getDayLabel(date)}</span>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      checked
                        ? 'bg-green-500 text-white'
                        : isToday
                          ? 'bg-primary/10 text-primary border-2 border-primary border-dashed'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                    }`}>
                      {checked ? (
                        <span className="material-symbols-outlined text-base">check</span>
                      ) : (
                        getDateNum(date)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Checkin Button */}
          <button
            onClick={handleCheckin}
            disabled={isCheckinLoading || checkinStats?.checkedInToday}
            className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg ${
              checkinStats?.checkedInToday
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-xl active:scale-[0.98]'
            }`}
          >
            {isCheckinLoading ? (
              <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : checkinStats?.checkedInToday ? (
              <>
                <span className="material-symbols-outlined">check_circle</span>
                今日已打卡
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">add_circle</span>
                立即打卡
              </>
            )}
          </button>

          {/* Checkin History */}
          {checkinHistory.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
              <h3 className="font-medium text-slate-900 dark:text-white mb-3">打卡记录</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {checkinHistory.slice(0, 10).map((record, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-green-600 text-sm">check</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {new Date(record.checkin_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                        </p>
                        <p className="text-xs text-slate-500">连续 {record.streak_count} 天</p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-green-600">+{record.points_earned}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Learning Goal Milestone */}
        <div className="px-4 pb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white pb-3">🎯 当前学习目标里程碑</h2>
          {activeGoal ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700">
              <p className="text-base font-semibold text-slate-900 dark:text-white mb-1">{activeGoal.description || '当前学习目标'}</p>
              {(activeGoal.target_language || activeGoal.target_level) && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                  {activeGoal.target_language}{activeGoal.target_level ? ` · ${activeGoal.target_level}` : ''}
                </p>
              )}
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600 dark:text-slate-400">任务进度</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{goalCompletedTasks} / {goalTotalTasks}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-primary to-blue-500 h-3 rounded-full transition-all"
                  style={{ width: `${goalProgress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2 text-right">{goalProgress}% 完成</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">暂无学习目标</p>
              <button
                onClick={() => navigate('/goal-setting')}
                className="px-4 py-2 bg-primary text-white text-sm rounded-xl font-medium hover:opacity-90 transition-opacity">
                去设置
              </button>
            </div>
          )}
        </div>

        {/* Mastered Scenarios */}
        {masteredScenarios.length > 0 && (
          <div className="px-4 pb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white pb-3">🏅 已掌握场景技能</h2>
            <div className="flex flex-wrap gap-2">
              {masteredScenarios.map((s, i) => (
                <span key={i} className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-medium rounded-full">
                  ✓ {s.title || s.scenario_title || `场景 ${i + 1}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Achievements */}
        <h2 className="text-lg font-bold px-4 pb-3 pt-2 text-slate-900 dark:text-white">🏆 成就徽章</h2>
        <div className="flex gap-3 px-4 overflow-x-auto pb-4">
          {achievements.map((achievement, index) => (
            <div key={index} className="flex flex-col items-center gap-2 flex-shrink-0 w-24">
              <div className={`flex items-center justify-center w-20 h-20 rounded-full text-4xl ${
                achievement.unlocked
                  ? 'bg-primary/20'
                  : 'bg-slate-200 dark:bg-slate-700 grayscale opacity-50'
              }`}>
                {achievement.icon}
              </div>
              <p className={`text-xs font-medium text-center leading-tight ${
                achievement.unlocked
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-400 dark:text-slate-500'
              }`}>
                {achievement.name}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center leading-tight">
                {achievement.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Menu Items */}
        <div className="p-4 flex flex-col gap-2">
          {menuItems.map((item, index) => (
            <div
              key={index}
              onClick={() => item.onPress ? item.onPress() : item.path && navigate(item.path)}
              className="flex items-center p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm w-full cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <span className="material-symbols-outlined text-primary mr-4">{item.icon}</span>
              <span className="text-slate-900 dark:text-white font-medium flex-1">{item.label}</span>
              {item.value && (
                <span className="text-slate-600 dark:text-slate-400 mr-2">{item.value}</span>
              )}
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">chevron_right</span>
            </div>
          ))}
        </div>

        {/* Logout Button */}
        <div className="p-4 pt-8 pb-8">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-800 p-4 font-bold text-red-500 shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <span className="material-symbols-outlined">logout</span>
            退出登录
          </button>
        </div>
      </main>

      {/* Checkin Success Modal */}
      {showCheckinSuccess && checkinResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 m-4 max-w-sm w-full text-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-green-600 text-5xl">celebration</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">打卡成功！</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              获得 <span className="text-green-600 font-bold">{checkinResult.pointsEarned || checkinResult.checkin?.points_earned}</span> 积分
            </p>
            <p className="text-sm text-slate-500 mb-6">
              连续打卡 <span className="font-medium text-primary">{checkinResult.streak || checkinResult.checkin?.streak_count}</span> 天
            </p>
            <button
              onClick={() => setShowCheckinSuccess(false)}
              className="w-full py-3 bg-primary text-white rounded-xl font-medium">
              太棒了！
            </button>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            {feedbackSubmitted ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <span className="material-symbols-outlined text-5xl text-green-500">check_circle</span>
                <p className="text-lg font-bold text-slate-900 dark:text-white">感谢你的反馈！</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center">你的意见对我们非常重要，我们会认真查看。</p>
                <button
                  onClick={handleFeedbackClose}
                  className="mt-2 w-full py-3 rounded-xl bg-primary text-white font-medium hover:opacity-90 transition-opacity">
                  关闭
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">意见反馈</h2>
                  <button onClick={handleFeedbackClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">反馈类型</p>
                <div className="flex gap-2 mb-4">
                  {FEEDBACK_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFeedbackCategory(cat)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        feedbackCategory === cat
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}>
                      {cat}
                    </button>
                  ))}
                </div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">反馈内容</p>
                <textarea
                  value={feedbackText}
                  onChange={(e) => {
                    if (e.target.value.length <= FEEDBACK_MAX_LENGTH) setFeedbackText(e.target.value);
                  }}
                  placeholder="请描述你的建议或遇到的问题…"
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 text-right mt-1">
                  {feedbackText.length}/{FEEDBACK_MAX_LENGTH}
                </p>
                {feedbackError && (
                  <p className="text-sm text-red-500 mt-2">{feedbackError}</p>
                )}
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={feedbackSubmitting}
                  className="mt-4 w-full py-3 rounded-xl bg-primary text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {feedbackSubmitting ? '提交中…' : '提交反馈'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <BottomNav currentPage="profile" />
    </div>
  );
}

export default Profile;
