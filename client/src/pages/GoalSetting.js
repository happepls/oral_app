import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // Assuming AuthContext provides user info or token

function GoalSetting() {
  const navigate = useNavigate();
  const { user, loading } = useAuth(); // Assuming useAuth provides user info
  const [goalName, setGoalName] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Placeholder for API call to set user goals
    try {
      // Simulate API call
      // const result = await api.setUserGoal({ goalName, goalDescription, targetDate });
      // For now, simulate success
      const result = { success: true };

      if (result.success) {
        setSuccess('学习目标设置成功！');
        navigate('/discovery');
      } else {
        setError(result.message || '设置学习目标失败，请重试。');
      }
    } catch (err) {
      setError('网络或服务器错误，请稍后重试。');
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center bg-background-light dark:bg-background-dark p-4">
      <div className="flex w-full max-w-md flex-col items-center justify-center flex-grow">
        <div className="w-full px-4">
          <h1 className="text-slate-900 dark:text-white text-3xl font-bold mb-2">设置您的学习目标</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-8">设定明确的目标，让学习更高效。</p>

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
              <label htmlFor="goalName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                目标名称
              </label>
              <input
                type="text"
                id="goalName"
                value={goalName}
                onChange={(e) => setGoalName(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                placeholder="例如：提高口语流利度"
              />
            </div>

            <div>
              <label htmlFor="goalDescription" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                目标描述
              </label>
              <textarea
                id="goalDescription"
                value={goalDescription}
                onChange={(e) => setGoalDescription(e.target.value)}
                rows="4"
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                placeholder="详细描述您的学习目标，例如：希望能在日常交流中更自信地表达自己，减少语法错误。"
              ></textarea>
            </div>

            <div>
              <label htmlFor="targetDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                目标完成日期
              </label>
              <input
                type="date"
                id="targetDate"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? '保存中...' : '保存目标'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default GoalSetting;
