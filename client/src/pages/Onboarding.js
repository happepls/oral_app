import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../services/api';

function Onboarding() {
  const navigate = useNavigate();
  const { user, loading, updateProfile } = useAuth(); // Assuming updateProfile will be part of AuthContext or a separate API service
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [nativeLanguage, setNativeLanguage] = useState(user?.nativeLanguage || '');
  const [learningLanguage, setLearningLanguage] = useState(user?.learningLanguage || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      // Call API to update user profile
      const result = await userAPI.updateProfile({ 
          nickname, 
          gender, 
          native_language: nativeLanguage, 
          target_language: learningLanguage 
      });

      if (result) {
        setSuccess('个人资料更新成功！');
        // Optionally update the user context immediately
        if (updateProfile) {
            await updateProfile();
        }
        // Navigate to the next step
        navigate('/discovery'); 
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
          <p className="text-slate-600 dark:text-slate-400 mb-8">这些信息有助于我们为您提供更个性化的学习体验。</p>

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
                placeholder="请输入您的昵称"
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
                required
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
              >
                <option value="">请选择</option>
                <option value="male">男性</option>
                <option value="female">女性</option>
                <option value="other">其他</option>
                <option value="prefer_not_to_say">不愿透露</option>
              </select>
            </div>

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
                <option value="">请选择</option>
                <option value="Chinese">中文</option>
                <option value="English">英语</option>
                <option value="Spanish">西班牙语</option>
                <option value="French">法语</option>
                <option value="German">德语</option>
                <option value="Japanese">日语</option>
                <option value="Korean">韩语</option>
              </select>
            </div>

            <div>
              <label htmlFor="learningLanguage" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                学习语言
              </label>
              <select
                id="learningLanguage"
                value={learningLanguage}
                onChange={(e) => setLearningLanguage(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
              >
                <option value="">请选择</option>
                <option value="english">英语</option>
                <option value="spanish">西班牙语</option>
                <option value="chinese">中文</option>
                <option value="french">法语</option>
                <option value="german">德语</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? '保存中...' : '保存'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
