import React from 'react';
import { useNavigate } from 'react-router-dom';

function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center bg-background-light dark:bg-background-dark p-4">
      <div className="flex w-full max-w-md flex-col items-center justify-center text-center flex-grow">
        <div className="flex w-full grow flex-col items-center justify-center p-4">
          <div className="w-24 gap-1 overflow-hidden bg-transparent aspect-square rounded-lg flex">
            <div className="w-full bg-center bg-no-repeat bg-cover aspect-auto rounded-none flex-1" 
                 style={{backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}></div>
          </div>
          <h1 className="text-slate-900 dark:text-white tracking-light text-[32px] font-bold leading-tight pt-4">Guaji AI</h1>
          <p className="text-slate-600 dark:text-slate-400 text-base mt-2">高效、深度的AI口语练习</p>
        </div>

        <div className="flex w-full flex-col items-center">
          <div className="flex w-full flex-col items-stretch gap-3 max-w-[480px] px-4 py-3">
            <button 
              onClick={() => navigate('/register')}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-primary text-white text-base font-bold leading-normal tracking-[0.015em] w-full hover:bg-primary/90 transition-colors">
              <span className="truncate">创建账户</span>
            </button>
            <button 
              onClick={() => navigate('/login')}
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white text-base font-bold leading-normal tracking-[0.015em] w-full hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">
              <span className="truncate">登录</span>
            </button>
          </div>
        </div>

        <p className="text-slate-500 dark:text-slate-500 text-sm font-normal leading-normal pt-6 pb-4 px-4 text-center">或继续使用</p>
        
        <div className="flex w-full items-center justify-center gap-4 px-4">
          <button className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-slate-300 dark:border-slate-700 bg-background-light dark:bg-background-dark text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span className="material-symbols-outlined">account_circle</span>
          </button>
        </div>

        <div className="w-full max-w-md px-4 pt-8 pb-4">
          <select className="w-full appearance-none rounded-lg border border-slate-300 dark:border-slate-700 bg-background-light dark:bg-slate-800 px-4 py-3 text-center text-slate-700 dark:text-slate-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm">
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="ja">日本語</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default Welcome;
