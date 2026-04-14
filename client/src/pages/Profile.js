import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { historyAPI, feedbackAPI, userAPI } from '../services/api';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Settings, Flame, Check, CheckCircle, LogOut,
  History, User, Bell, Crown, Palette, MessageSquare,
  ChevronRight, PlusCircle, X, Info
} from 'lucide-react';

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
    { name: '打卡新手', icon: '🔥', desc: '完成首次打卡', unlocked: totalCheckins >= 1 },
    { name: '坚持一周', icon: '📅', desc: '连续打卡7天', unlocked: currentStreak >= 7 },
    { name: '坚持一月', icon: '🗓️', desc: '连续打卡30天', unlocked: currentStreak >= 30 },
    { name: '对话达人', icon: '💬', desc: '累计完成50次对话', unlocked: stats.totalSessions >= 50 },
    { name: '场景初探', icon: '🎯', desc: '完成首个场景全部任务', unlocked: masteredScenarios.length >= 1 },
    { name: '练习大师', icon: '🏆', desc: '100%完成3个以上学习目标', unlocked: false },
    { name: '多语言Master', icon: '🌍', desc: '掌握3种以上目标语言练习闭环', unlocked: false }
  ];

  const menuItems = [
    { icon: History, label: '对话历史', path: '/history' },
    { icon: User, label: '账户设置', path: '/settings' },
    { icon: Bell, label: '通知', path: '/notifications' },
    { icon: Crown, label: '订阅', path: '/subscription' },
    { icon: Palette, label: '主题', value: '深色' },
    { icon: MessageSquare, label: '意见反馈', onPress: () => setShowFeedbackModal(true) }
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
    return (
      <div className="flex h-screen items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col min-h-screen w-full bg-background-light dark:bg-background-dark">
      {/* Top App Bar */}
      <div className="flex items-center bg-white dark:bg-slate-800 px-4 py-3 justify-between sticky top-0 z-10 border-b border-slate-100 dark:border-slate-700 shadow-sm">
        <button
          onClick={() => navigate('/discovery')}
          className="flex items-center justify-center p-2 -ml-1 text-slate-600 dark:text-slate-400 hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">我的账户</h1>
        <button className="flex items-center justify-center p-2 -mr-1 text-slate-600 dark:text-slate-400 hover:text-primary transition-colors">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <main className="flex-grow pb-28">
        {/* Subscription Badge */}
        {user?.subscription_status === 'active' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-4 mt-4 p-3 rounded-xl"
            style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">👑</span>
                <div>
                  <p className="text-white font-bold text-sm">会员已激活</p>
                  <p className="text-white/70 text-xs">享受全部高级功能</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/subscription')}
                className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-xs rounded-lg transition"
              >
                管理
              </button>
            </div>
          </motion.div>
        )}

        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex p-4 pt-8"
        >
          <div className="flex w-full flex-col gap-4 items-center">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt="Avatar"
                className="w-24 h-24 rounded-full object-cover ring-4 ring-primary/30"
              />
            ) : (
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-3xl text-white font-bold ring-4 ring-primary/30"
                style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
              >
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="flex flex-col items-center gap-1">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{user?.username || '用户'}</p>
              {activeGoal ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  学习 {activeGoal.target_language}{activeGoal.target_level ? ` · ${activeGoal.target_level}` : ''}
                </p>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">开始你的语言之旅</p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Stats Overview */}
        <div className="flex gap-3 px-4 mb-2">
          {[
            { label: '对话次数', value: stats.sessions },
            { label: '总练习时长', value: stats.practiceTime }
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex flex-1 flex-col gap-1 rounded-2xl p-4 bg-white dark:bg-slate-800 shadow-brand"
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Daily Checkin Section */}
        <div id="checkin-section" className="px-4 py-4 space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white pt-2">🔥 每日打卡</h2>

          {/* Checkin Stats Card */}
          <div className="rounded-2xl p-6 text-white shadow-brand-lg" style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-white/70 text-sm">当前连续打卡</p>
                <p className="text-4xl font-bold">{checkinStats?.currentStreak || 0} <span className="text-lg font-normal">天</span></p>
              </div>
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <Flame className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <div>
                <p className="text-white/70">累计打卡</p>
                <p className="font-semibold">{checkinStats?.totalCheckins || 0} 天</p>
              </div>
              <div>
                <p className="text-white/70">获得积分</p>
                <p className="font-semibold">{checkinStats?.totalPointsFromCheckins || 0}</p>
              </div>
            </div>
          </div>

          {/* Week Calendar */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-brand border border-slate-100 dark:border-slate-700">
            <h3 className="font-medium text-slate-900 dark:text-white mb-4">本周打卡</h3>
            <div className="grid grid-cols-7 gap-2">
              {getLast7Days().map(date => {
                const checked = isDateCheckedIn(date);
                const isToday = date === new Date().toISOString().split('T')[0];
                return (
                  <div key={date} className="flex flex-col items-center">
                    <span className="text-xs text-slate-500 mb-1">{getDayLabel(date)}</span>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      checked
                        ? 'text-white'
                        : isToday
                          ? 'bg-primary/10 text-primary border-2 border-primary border-dashed'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                    }`}
                    style={checked ? { background: 'linear-gradient(135deg, #637FF1, #a47af6)' } : {}}>
                      {checked ? <Check className="w-4 h-4" /> : getDateNum(date)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Checkin Button */}
          <motion.button
            whileHover={!checkinStats?.checkedInToday ? { scale: 1.01 } : {}}
            whileTap={!checkinStats?.checkedInToday ? { scale: 0.98 } : {}}
            onClick={handleCheckin}
            disabled={isCheckinLoading || checkinStats?.checkedInToday}
            className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-brand ${
              checkinStats?.checkedInToday
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'text-white'
            }`}
            style={checkinStats?.checkedInToday ? {} : { background: 'linear-gradient(135deg, #10B981, #059669)' }}
          >
            {isCheckinLoading ? (
              <div className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : checkinStats?.checkedInToday ? (
              <>
                <CheckCircle className="w-5 h-5" />
                今日已打卡
              </>
            ) : (
              <>
                <PlusCircle className="w-5 h-5" />
                立即打卡
              </>
            )}
          </motion.button>

          {/* Checkin History */}
          {checkinHistory.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-brand border border-slate-100 dark:border-slate-700">
              <h3 className="font-medium text-slate-900 dark:text-white mb-3">打卡记录</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {checkinHistory.slice(0, 10).map((record, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-success/10 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-success" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {new Date(record.checkin_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                        </p>
                        <p className="text-xs text-slate-500">连续 {record.streak_count} 天</p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-success">+{record.points_earned}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Learning Goal Milestone */}
        <div className="px-4 pb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white pb-3">🎯 当前学习目标里程碑</h2>
          {activeGoal ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-brand border border-slate-100 dark:border-slate-700">
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
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5">
                <div
                  className="h-2.5 rounded-full transition-all"
                  style={{ width: `${goalProgress}%`, background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2 text-right">{goalProgress}% 完成</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-brand border border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">暂无学习目标</p>
              <button
                onClick={() => navigate('/goal-setting')}
                className="px-4 py-2 text-white text-sm rounded-xl font-medium transition"
                style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
              >
                去设置
              </button>
            </div>
          )}
        </div>

        {/* Mastered Scenarios */}
        {masteredScenarios.length > 0 && (
          <div className="px-4 pb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white pb-3">🏅 已掌握场景技能</h2>
            <div className="flex flex-wrap gap-2">
              {masteredScenarios.map((s, i) => (
                <span key={i} className="px-3 py-1.5 bg-success/10 text-success text-sm font-medium rounded-full">
                  ✓ {s.title || s.scenario_title || `场景 ${i + 1}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Achievements */}
        <h2 className="text-base font-bold px-4 pb-3 pt-2 text-slate-900 dark:text-white">🏆 成就徽章</h2>
        <div className="flex gap-3 px-4 overflow-x-auto pb-4">
          {achievements.map((achievement, index) => (
            <div key={index} className="flex flex-col items-center gap-2 flex-shrink-0 w-20">
              <div className={`flex items-center justify-center w-16 h-16 rounded-full text-3xl ${
                achievement.unlocked ? 'bg-primary/10' : 'bg-slate-100 dark:bg-slate-700 grayscale opacity-50'
              }`}>
                {achievement.icon}
              </div>
              <p className={`text-xs font-medium text-center leading-tight ${
                achievement.unlocked ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
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
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={index}
                whileTap={{ scale: 0.99 }}
                onClick={() => item.onPress ? item.onPress() : item.path && navigate(item.path)}
                className="flex items-center p-4 rounded-2xl bg-white dark:bg-slate-800 shadow-brand border border-slate-100 dark:border-slate-700 w-full cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
              >
                <Icon className="w-5 h-5 text-primary mr-3 flex-shrink-0" />
                <span className="text-slate-900 dark:text-white font-medium flex-1">{item.label}</span>
                {item.value && (
                  <span className="text-slate-500 dark:text-slate-400 text-sm mr-2">{item.value}</span>
                )}
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </motion.div>
            );
          })}
        </div>

        {/* Logout Button */}
        <div className="px-4 pt-6 pb-8">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-white dark:bg-slate-800 p-4 font-bold text-red-500 shadow-brand border border-slate-100 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            退出登录
          </motion.button>
        </div>
      </main>

      {/* Checkin Success Modal */}
      <AnimatePresence>
        {showCheckinSuccess && checkinResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="bg-white dark:bg-slate-800 rounded-3xl p-6 mx-4 max-w-sm w-full text-center shadow-brand-lg"
            >
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">打卡成功！</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-1">
                获得 <span className="text-success font-bold">{checkinResult.pointsEarned || checkinResult.checkin?.points_earned}</span> 积分
              </p>
              <p className="text-sm text-slate-500 mb-6">
                连续打卡 <span className="font-medium text-primary">{checkinResult.streak || checkinResult.checkin?.streak_count}</span> 天
              </p>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowCheckinSuccess(false)}
                className="w-full py-3 text-white rounded-xl font-bold"
                style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
              >
                太棒了！
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feedback Modal */}
      <AnimatePresence>
        {showFeedbackModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-800 rounded-3xl shadow-brand-lg w-full max-w-md p-6"
            >
              {feedbackSubmitted ? (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-success" />
                  </div>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">感谢你的反馈！</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center">你的意见对我们非常重要，我们会认真查看。</p>
                  <button
                    onClick={handleFeedbackClose}
                    className="mt-2 w-full py-3 rounded-xl text-white font-medium"
                    style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
                  >
                    关闭
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">意见反馈</h2>
                    <button
                      onClick={handleFeedbackClose}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">反馈类型</p>
                  <div className="flex gap-2 mb-4">
                    {FEEDBACK_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setFeedbackCategory(cat)}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${
                          feedbackCategory === cat
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400'
                        }`}
                      >
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
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p className="text-xs text-slate-400 text-right mt-1">
                    {feedbackText.length}/{FEEDBACK_MAX_LENGTH}
                  </p>
                  {feedbackError && (
                    <p className="text-sm text-red-500 mt-2">{feedbackError}</p>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleFeedbackSubmit}
                    disabled={feedbackSubmitting}
                    className="mt-4 w-full py-3 rounded-xl text-white font-medium disabled:opacity-50 transition-opacity"
                    style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
                  >
                    {feedbackSubmitting ? '提交中…' : '提交反馈'}
                  </motion.button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav currentPage="profile" />
    </div>
  );
}

export default Profile;
