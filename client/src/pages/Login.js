import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Login() {
  const navigate = useNavigate();
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const result = await login({ email, password });
    
    if (result.success) {
      navigate('/discovery');
    } else {
      setError(result.message || '登录失败，请检查您的邮箱和密码');
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center bg-background-light dark:bg-background-dark p-4">
      <div className="flex w-full max-w-md flex-col items-center justify-center flex-grow">
        <div className="w-full px-4">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 mb-8">
            <span className="material-symbols-outlined">arrow_back</span>
            <span>返回</span>
          </button>

          <h1 className="text-slate-900 dark:text-white text-3xl font-bold mb-2">欢迎回来</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-8">登录您的账户继续学习</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                邮箱地址
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          <p className="text-center text-slate-600 dark:text-slate-400 mt-6">
            还没有账户？{' '}
            <button 
              onClick={() => navigate('/register')}
              className="text-primary font-semibold hover:underline">
              立即注册
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
