import React from 'react';
import { useNavigate } from 'react-router-dom';

function BottomNav({ currentPage, showFab = false }) {
  const navigate = useNavigate();

  // 原有 3-Tab 布局（showFab=false，保持向后兼容）
  const defaultItems = [
    { id: 'home',    icon: 'home',    label: '首页', path: '/discovery' },
    { id: 'goals',   icon: 'target',  label: '目标', path: '/goals' },
    { id: 'profile', icon: 'person',  label: '我的', path: '/profile' },
  ];

  // 5-Tab 布局（showFab=true）
  const fabItems = [
    { id: 'home',    icon: 'home',    label: '首页', path: '/discovery' },
    { id: 'history', icon: 'history', label: '记录', path: '/history' },
    null, // FAB 占位
    { id: 'goals',   icon: 'target',  label: '目标', path: '/goals' },
    { id: 'profile', icon: 'person',  label: '我的', path: '/profile' },
  ];

  if (!showFab) {
    return (
      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 dark:border-slate-800 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm">
        <div className="grid h-20 grid-cols-3 items-center justify-items-center px-4 max-w-lg mx-auto">
          {defaultItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-1 ${
                currentPage === item.id
                  ? 'text-primary'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <p className={`text-xs ${currentPage === item.id ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // FAB 版本
  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 dark:border-slate-800 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm">
      <div className="flex h-20 items-center justify-around px-2 max-w-lg mx-auto">
        {fabItems.map((item, idx) => {
          if (!item) {
            // 中央 FAB 按钮
            return (
              <button
                key="fab"
                onClick={() => navigate('/conversation?scenario=general')}
                className="relative -top-4 flex items-center justify-center w-14 h-14 rounded-full shadow-lg flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
                aria-label="开始练习"
              >
                <span className="material-symbols-outlined text-white text-2xl">mic</span>
              </button>
            );
          }
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-1 flex-1 ${
                currentPage === item.id
                  ? 'text-primary'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <span className="material-symbols-outlined text-xl">{item.icon}</span>
              <p className={`text-xs ${currentPage === item.id ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default BottomNav;
