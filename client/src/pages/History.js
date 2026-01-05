import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { historyAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

function History() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user?.id) return;
      
      try {
        setLoading(true);
        const data = await historyAPI.getUserHistory(user.id);
        // data is an array of conversations. Assume each item now includes 'summary' and 'rewards'
        setHistoryItems(data);
      } catch (err) {
        console.error('Failed to fetch history:', err);
        setError('无法加载历史记录');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [user]);

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown Date';
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateDuration = (start, end) => {
    if (!start || !end) return 'N/A';
    const diff = new Date(end) - new Date(start);
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark">
       {/* Top App Bar */}
       <div className="flex items-center bg-background-light dark:bg-background-dark p-4 pb-2 justify-between sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
        <button 
          onClick={() => navigate('/profile')}
          className="flex items-center justify-center p-2 text-slate-900 dark:text-white">
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
        </button>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">对话历史</h1>
        <div className="w-10"></div> {/* Spacer for centering title */}
      </div>

      <main className="flex-1 p-4">
        {loading && (
            <div className="flex justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )}
        
        {error && (
            <div className="text-center text-red-500 p-4">{error}</div>
        )}

        {!loading && !error && historyItems.length === 0 && (
            <div className="text-center text-gray-500 p-8">暂无历史记录</div>
        )}

        <div className="flex flex-col gap-3">
          {historyItems.map((item) => (
            <div 
              key={item._id || item.sessionId}
              className="flex flex-col p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              onClick={() => console.log('View history details', item.sessionId)}
            >
              <div className="flex items-center">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20 text-primary mr-4">
                  <span className="material-symbols-outlined">forum</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{item.topic || '自由对话'}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                      {formatDate(item.startTime)} • {calculateDuration(item.startTime, item.endTime)}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  {item.metrics?.fluency && (
                      <>
                          <span className="text-lg font-bold text-primary">{item.metrics.fluency}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">分</span>
                      </>
                  )}
                </div>
              </div>
              
              {item.summary && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-sm text-slate-700 dark:text-slate-300">总结: {item.summary}</p>
                </div>
              )}

              {(item.rewards !== undefined || item.metrics?.proficiencyScoreDelta !== undefined) && (
                <div className="mt-2 text-right">
                  <span className="text-sm font-medium text-amber-500">
                    奖励: {item.rewards !== undefined ? item.rewards : item.metrics?.proficiencyScoreDelta} 点
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default History;