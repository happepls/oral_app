import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Onboarding() {
  const navigate = useNavigate();
  const { user, loading, updateProfile } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [nativeLanguage, setNativeLanguage] = useState(user?.native_language || 'Chinese');
  const [targetLanguage, setTargetLanguage] = useState(user?.target_language || 'English');
  const [proficiency, setProficiency] = useState(user?.points || 30); // Using 'points' as proxy for proficiency or just sending it
  const [interests, setInterests] = useState(user?.interests || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const result = await updateProfile({ 
          nickname, 
          gender, 
          native_language: nativeLanguage, 
          target_language: targetLanguage,
          proficiency: parseInt(proficiency), // Ensure it's a number
          interests: interests
      });

      if (result.success) {
        setSuccess('个人资料更新成功！');
        // Navigate to goal setting instead of discovery directly
        setTimeout(() => navigate('/goal-setting'), 1000);
      } else {
        setError(result.message || '更新失败');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || '网络或服务器错误，请稍后重试。');
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center bg-background-light dark:bg-background-dark p-4">
      <div className="flex w-full max-w-md flex-col items-center justify-center flex-grow">
        <div className="w-full px-4">
          <h1 className="text-slate-900 dark:text-white text-3xl font-bold mb-2">完善您的个人资料</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-8">告诉我们您的语言背景，以便为您定制课程。</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-500/10 border border-green-500/50 text-green-500 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            <div>
              <label htmlFor="nickname" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                昵称
              </label>
              <input
                type="text"
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
              />
            </div>

            <div>
              <label htmlFor="gender" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                性别
              </label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
              >
                <option value="">请选择</option>
                <option value="male">男性</option>
                <option value="female">女性</option>
                <option value="other">其他</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="nativeLanguage" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  母语
                </label>
                <select
                  id="nativeLanguage"
                  value={nativeLanguage}
                  onChange={(e) => setNativeLanguage(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                >
                  <option value="Chinese">中文</option>
                  <option value="English">英语</option>
                  <option value="Japanese">日语</option>
                  <option value="French">法语</option>
                </select>
              </div>

              <div>
                <label htmlFor="targetLanguage" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  学习语言
                </label>
                <select
                  id="targetLanguage"
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                >
                  <option value="English">英语</option>
                  <option value="Japanese">日语</option>
                  <option value="Chinese">中文</option>
                  <option value="French">法语</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="proficiency" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                当前水平 (0-100)
              </label>
              <input
                type="range"
                id="proficiency"
                min="0"
                max="100"
                value={proficiency}
                onChange={(e) => setProficiency(e.target.value)}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
              />
              <div className="text-right text-sm text-slate-500">{proficiency}</div>
            </div>

            <div>
              <label htmlFor="interests" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                兴趣爱好 / 学习重点
              </label>
              <textarea
                id="interests"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                rows="3"
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                placeholder="例如：商务谈判, 旅游对话, 雅思口语..."
              ></textarea>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? '保存中...' : '下一步：设定目标'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Onboarding;