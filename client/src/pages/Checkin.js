import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../services/api';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Flame, Check, CheckCircle, PlusCircle, Info } from 'lucide-react';

function Checkin() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [isCheckinLoading, setIsCheckinLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [checkinResult, setCheckinResult] = useState(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
      return;
    }
    if (user) {
      loadData();
    }
  }, [user, loading, navigate]);

  const loadData = async () => {
    try {
      const [statsRes, historyRes] = await Promise.all([
        userAPI.getCheckinStats(),
        userAPI.getCheckinHistory(30)
      ]);
      setStats(statsRes);
      setHistory(historyRes);
    } catch (error) {
      console.error('Failed to load checkin data:', error);
    }
  };

  const handleCheckin = async () => {
    if (stats?.checkedInToday) return;
    setIsCheckinLoading(true);
    try {
      const result = await userAPI.checkin();
      setCheckinResult(result);
      setShowSuccess(true);
      await loadData();
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
    return history.some(h => {
      const checkinDate = new Date(h.checkin_date).toISOString().split('T')[0];
      return checkinDate === dateStr;
    });
  };

  const getDayLabel = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) return '今';
    return ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  };

  const getDateNum = (dateStr) => new Date(dateStr).getDate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/discovery')}
            className="p-2 -ml-2 text-slate-600 dark:text-slate-400 hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg text-slate-900 dark:text-white">每日打卡</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Streak Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 text-white shadow-brand-lg"
          style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white/70 text-sm">当前连续打卡</p>
              <p className="text-4xl font-bold">{stats?.currentStreak || 0} <span className="text-lg font-normal">天</span></p>
            </div>
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <Flame className="w-8 h-8 text-white" />
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <div>
              <p className="text-white/70">累计打卡</p>
              <p className="font-semibold">{stats?.totalCheckins || 0} 天</p>
            </div>
            <div>
              <p className="text-white/70">获得积分</p>
              <p className="font-semibold">{stats?.totalPointsFromCheckins || 0}</p>
            </div>
          </div>
        </motion.div>

        {/* Week Calendar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-brand border border-slate-100 dark:border-slate-700"
        >
          <h3 className="font-medium text-slate-900 dark:text-white mb-4">本周打卡</h3>
          <div className="grid grid-cols-7 gap-2">
            {getLast7Days().map(date => {
              const checked = isDateCheckedIn(date);
              const isToday = date === new Date().toISOString().split('T')[0];
              return (
                <div key={date} className="flex flex-col items-center">
                  <span className="text-xs text-slate-500 mb-1">{getDayLabel(date)}</span>
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      checked
                        ? 'text-white'
                        : isToday
                          ? 'bg-primary/10 text-primary border-2 border-primary border-dashed'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                    }`}
                    style={checked ? { background: 'linear-gradient(135deg, #637FF1, #a47af6)' } : {}}
                  >
                    {checked ? <Check className="w-4 h-4" /> : getDateNum(date)}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Checkin Button */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          whileHover={!stats?.checkedInToday ? { scale: 1.01 } : {}}
          whileTap={!stats?.checkedInToday ? { scale: 0.98 } : {}}
          onClick={handleCheckin}
          disabled={isCheckinLoading || stats?.checkedInToday}
          className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-brand ${
            stats?.checkedInToday
              ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'text-white'
          }`}
          style={stats?.checkedInToday ? {} : { background: 'linear-gradient(135deg, #10B981, #059669)' }}
        >
          {isCheckinLoading ? (
            <div className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          ) : stats?.checkedInToday ? (
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

        {/* Rules */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-brand border border-slate-100 dark:border-slate-700"
        >
          <h3 className="font-medium text-slate-900 dark:text-white mb-3">打卡规则</h3>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
              每日打卡基础奖励 10 积分
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
              连续打卡每天额外 +2 积分（最高 +40）
            </li>
            <li className="flex items-start gap-2">
              <Info className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              中断打卡后连续天数将重置
            </li>
          </ul>
        </motion.div>

        {/* History */}
        {history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-brand border border-slate-100 dark:border-slate-700"
          >
            <h3 className="font-medium text-slate-900 dark:text-white mb-3">打卡记录</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {history.slice(0, 10).map((record, idx) => (
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
          </motion.div>
        )}
      </main>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccess && checkinResult && (
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
                onClick={() => setShowSuccess(false)}
                className="w-full py-3 text-white rounded-xl font-bold"
                style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
              >
                太棒了！
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Checkin;
