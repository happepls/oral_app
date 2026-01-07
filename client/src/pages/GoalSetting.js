import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../services/api';

function GoalSetting() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  
  const [type, setType] = useState('daily_conversation');
  const [description, setDescription] = useState('');
  const [targetLevel, setTargetLevel] = useState('Intermediate');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Pre-fill target language from user profile if available, otherwise default
  const targetLanguage = user?.target_language || 'English';
  const currentProficiency = user?.points || 30;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      // Structure based on User.createGoal backend requirements
      const goalData = {
          type,
          description: description || `Practice ${targetLanguage} for ${type.replace('_', ' ')}`,
          target_language: targetLanguage,
          target_level: targetLevel,
          current_proficiency: currentProficiency,
          completion_time_days: 30, // Default to 30 days for now
          interests: user?.interests || ''
      };

      const result = await userAPI.createGoal(goalData);

      if (result) {
        setSuccess('学习目标设置成功！准备开始...');
        setTimeout(() => navigate('/conversation'), 1500);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || '设置学习目标失败，请重试。');
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center bg-background-light dark:bg-background-dark p-4">
      <div className="flex w-full max-w-md flex-col items-center justify-center flex-grow">
        <div className="w-full px-4">
          <h1 className="text-slate-900 dark:text-white text-3xl font-bold mb-2">设定{targetLanguage}学习目标</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-8">清晰的目标是成功的一半。</p>

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
              <label htmlFor="type" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                目标类型
              </label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
              >
                <option value="daily_conversation">日常对话</option>
                <option value="business_meeting">商务会议</option>
                <option value="travel_survival">旅游生存</option>
                <option value="exam_prep">考试准备</option>
                <option value="presentation">演讲演示</option>
              </select>
            </div>

            <div>
              <label htmlFor="targetLevel" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                期望达到的水平
              </label>
              <select
                id="targetLevel"
                value={targetLevel}
                onChange={(e) => setTargetLevel(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
              >
                <option value="Beginner">入门 (Beginner)</option>
                <option value="Intermediate">中级 (Intermediate)</option>
                <option value="Advanced">高级 (Advanced)</option>
                <option value="Native">母语级 (Native-like)</option>
              </select>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                具体描述 (选填)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows="4"
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                placeholder={`详细描述您的具体需求，例如："我下个月要去${targetLanguage === 'Japanese' ? '日本' : '美国'}出差，需要练习..."`}
              ></textarea>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? '保存中...' : '开始练习'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default GoalSetting;