import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../services/api';

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

  const getDateNum = (dateStr) => {
    return new Date(dateStr).getDate();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={() => navigate('/discovery')} className="p-2 -ml-2 text-slate-600 dark:text-slate-400">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="font-bold text-lg text-slate-900 dark:text-white">每日打卡</h1>
          <div className="w-10"></div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-6">
        <div className="bg-gradient-to-br from-primary to-blue-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-blue-100 text-sm">当前连续打卡</p>
              <p className="text-4xl font-bold">{stats?.currentStreak || 0} <span className="text-lg font-normal">天</span></p>
            </div>
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">local_fire_department</span>
            </div>
          </div>
          
          <div className="flex justify-between text-sm">
            <div>
              <p className="text-blue-100">累计打卡</p>
              <p className="font-semibold">{stats?.totalCheckins || 0} 天</p>
            </div>
            <div>
              <p className="text-blue-100">获得积分</p>
              <p className="font-semibold">{stats?.totalPointsFromCheckins || 0}</p>
            </div>
          </div>
        </div>

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

        <button
          onClick={handleCheckin}
          disabled={isCheckinLoading || stats?.checkedInToday}
          className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg ${
            stats?.checkedInToday
              ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-xl active:scale-[0.98]'
          }`}
        >
          {isCheckinLoading ? (
            <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          ) : stats?.checkedInToday ? (
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

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="font-medium text-slate-900 dark:text-white mb-3">打卡规则</h3>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2">
              <span className="material-symbols-outlined text-green-500 text-base mt-0.5">check</span>
              每日打卡基础奖励 10 积分
            </li>
            <li className="flex items-start gap-2">
              <span className="material-symbols-outlined text-green-500 text-base mt-0.5">check</span>
              连续打卡每天额外 +2 积分（最高 +40）
            </li>
            <li className="flex items-start gap-2">
              <span className="material-symbols-outlined text-amber-500 text-base mt-0.5">info</span>
              中断打卡后连续天数将重置
            </li>
          </ul>
        </div>

        {history.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="font-medium text-slate-900 dark:text-white mb-3">打卡记录</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {history.slice(0, 10).map((record, idx) => (
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
      </main>

      {showSuccess && checkinResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 m-4 max-w-sm w-full text-center animate-in zoom-in duration-300">
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
              onClick={() => setShowSuccess(false)}
              className="w-full py-3 bg-primary text-white rounded-xl font-medium"
            >
              太棒了！
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Checkin;
