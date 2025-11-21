import React from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

function Profile() {
  const navigate = useNavigate();

  const stats = [
    { label: '学习词汇', value: '850' },
    { label: '连续天数', value: '24 天' },
    { label: '练习时长', value: '102 小时' }
  ];

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
    { icon: 'person', label: '账户设置', path: '/settings' },
    { icon: 'notifications', label: '通知', path: '/notifications' },
    { icon: 'workspace_premium', label: '订阅', path: '/subscription' },
    { icon: 'palette', label: '主题', value: '深色' }
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
        {/* Profile Header */}
        <div className="flex p-4 pt-8">
          <div className="flex w-full flex-col gap-4 items-center">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 border-4 border-primary"></div>
            <div className="flex flex-col items-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">张三</p>
              <p className="text-base text-slate-600 dark:text-slate-400">学习英语 - B1 水平</p>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="flex flex-wrap gap-4 p-4">
          {stats.map((stat, index) => (
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
              <p className="text-3xl font-bold text-slate-900 dark:text-white">4小时30分</p>
              <p className="text-base font-medium text-green-500">+15%</p>
            </div>
            <p className="text-base text-slate-600 dark:text-slate-400 -mt-2">本周</p>
            
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
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-800 p-4 font-bold text-red-500 shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <span className="material-symbols-outlined">logout</span>
            退出登录
          </button>
        </div>
      </main>

      <BottomNav currentPage="profile" />
    </div>
  );
}

export default Profile;
