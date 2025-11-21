import React from 'react';
import { useNavigate } from 'react-router-dom';

function BottomNav({ currentPage }) {
  const navigate = useNavigate();

  const navItems = [
    { id: 'home', icon: 'home', label: '首页', path: '/discovery' },
    { id: 'discovery', icon: 'explore', label: '发现', path: '/discovery' },
    { id: 'practice', icon: 'chat_bubble', label: '练习', path: '/conversation' },
    { id: 'profile', icon: 'person', label: '我的', path: '/profile' }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 dark:border-slate-800 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm">
      <div className="grid h-20 grid-cols-4 items-center justify-items-center px-4 max-w-lg mx-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center gap-1 ${
              currentPage === item.id 
                ? 'text-primary' 
                : 'text-slate-500 dark:text-slate-400'
            }`}>
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

export default BottomNav;
