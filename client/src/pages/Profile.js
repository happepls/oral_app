import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { historyAPI, feedbackAPI } from '../services/api';

function Profile() {
  const navigate = useNavigate();
  const { user, logout, refreshProfile } = useAuth();
  const [stats, setStats] = useState({
    vocab: '0',
    sessions: '0 次',
    messages: '0 条'
  });
  const [loading, setLoading] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState('功能建议');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  useEffect(() => {
    if (refreshProfile) refreshProfile();
  }, []);

  const achievements = [
    { name: '词汇大师', icon: '🏆', unlocked: true },
    { name: '10天连续', icon: '🔥', unlocked: true },
    { name: '对话达人', icon: '💬', unlocked: true },
    { name: '夜猫子', icon: '🦉', unlocked: false },
    { name: '完美一周', icon: '🎯', unlocked: false }
  ];

  const weeklyData = [
    { day: '周一', height: '40%' },
    { day: '周二', height: '25%' },
    { day: '周三', height: '90%', active: true },
    { day: '周四', height: '70%' },
    { day: '周五', height: '60%' },
    { day: '周六', height: '50%' },
    { day: '周日', height: '65%' }
  ];

  const menuItems = [
    { icon: 'local_fire_department', label: '每日打卡', path: '/checkin' },
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
    if (!feedbackText.trim()) {
      setFeedbackError('请输入反馈内容');
      return;
    }
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

  useEffect(() => {
    const fetchStats = async () => {
      if (user?.id) {
        try {
          const data = await historyAPI.getStats(user.id);
          setStats({
            vocab: ((data.totalSessions || 0) * 50).toString(),
            sessions: `${data.totalSessions || 0} 次`,
            messages: `${data.totalMessages || 0} 条`
          });
        } catch (error) {
          console.error('Failed to fetch stats:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-background-light dark:bg-background-dark text-slate-900 dark:text-white">加载中...</div>;
  }

  const statItems = [
    { label: '估计词汇', value: stats.vocab },
    { label: '对话次数', value: stats.sessions },
    { label: '消息数量', value: stats.messages }
  ];

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
                className="px-3 py-1 bg-white/20 text-white text-xs rounded-lg"
              >
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
                    {user?.username?.[0]?.toUpperCase() || 'User'}
                </div>
            )}
            <div className="flex flex-col items-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{user?.username || '用户'}</p>
              <p className="text-base text-slate-600 dark:text-slate-400">
                {user?.target_language ? `学习 ${user.target_language}` : '开始你的语言之旅'} 
                {user?.target_level ? ` - ${user.target_level}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="flex flex-wrap gap-4 p-4">
          {statItems.map((stat, index) => (
            <div key={index} className="flex min-w-[150px] flex-1 flex-col gap-2 rounded-xl p-4 bg-white dark:bg-slate-800 shadow-sm">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Weekly Progress */}
        <div className="flex flex-wrap gap-4 px-4 py-4">
          <div className="flex w-full flex-1 flex-col gap-4 rounded-xl bg-white dark:bg-slate-800 p-6 shadow-sm">
            <p className="text-lg font-bold text-slate-900 dark:text-white">每周进度</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{stats.sessions}</p>
            </div>
            <p className="text-base text-slate-600 dark:text-slate-400 -mt-2">对话次数</p>
            
            <div className="grid grid-flow-col gap-4 h-[180px] items-end pt-4">
              {weeklyData.map((item, index) => (
                <div key={index} className="flex flex-col items-center h-full justify-end gap-2">
                  <div 
                    className={`${item.active ? 'bg-primary' : 'bg-primary/20'} rounded-t-full w-full`}
                    style={{ height: item.height }}>
                  </div>
                  <p className={`text-xs ${item.active ? 'text-primary font-bold' : 'text-slate-600 dark:text-slate-400'}`}>
                    {item.day}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Achievements */}
        <h2 className="text-lg font-bold px-4 pb-3 pt-4 text-slate-900 dark:text-white">成就</h2>
        <div className="flex gap-4 px-4 overflow-x-auto pb-4">
          {achievements.map((achievement, index) => (
            <div key={index} className="flex flex-col items-center gap-2 flex-shrink-0 w-24">
              <div className={`flex items-center justify-center w-20 h-20 rounded-full text-4xl ${
                achievement.unlocked 
                  ? 'bg-primary/20 text-primary' 
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 grayscale'
              }`}>
                {achievement.icon}
              </div>
              <p className={`text-sm font-medium text-center ${
                achievement.unlocked 
                  ? 'text-slate-900 dark:text-white' 
                  : 'text-slate-500 dark:text-slate-400'
              }`}>
                {achievement.name}
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

                {/* Category */}
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

                {/* Message */}
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