import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../services/api';

const VOICE_OPTIONS = [
  { id: 'Cherry', name: 'Cherry', description: '温柔女声' },
  { id: 'Serena', name: 'Serena', description: '活泼女声' },
  { id: 'Ethan', name: 'Ethan', description: '稳重男声' },
  { id: 'Chelsie', name: 'Chelsie', description: '甜美女声' }
];

function Goals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeGoal, setActiveGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState('Cherry');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchGoal = async () => {
      try {
        const res = await userAPI.getActiveGoal();
        if (res && res.goal) {
          setActiveGoal(res.goal);
        }
        const savedVoice = localStorage.getItem('ai_voice') || 'Cherry';
        setSelectedVoice(savedVoice);
      } catch (error) {
        console.error('Failed to fetch goal:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchGoal();
  }, []);

  const handleVoiceChange = (voiceId) => {
    setSelectedVoice(voiceId);
    localStorage.setItem('ai_voice', voiceId);
  };

  const handleNewGoal = () => {
    navigate('/goal-setting');
  };

  const calculateProgress = () => {
    if (!activeGoal?.scenarios) return 0;
    const completed = activeGoal.scenarios.filter(s => 
      s.tasks?.every(t => typeof t === 'object' ? t.status === 'completed' : false)
    ).length;
    return Math.round((completed / activeGoal.scenarios.length) * 100);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark">
      <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">学习目标</h1>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-24">
        {activeGoal ? (
          <div className="p-4 space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded">当前目标</span>
                <span className="text-xs text-slate-500">{activeGoal.target_language}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                {activeGoal.description || `达到${activeGoal.target_level}水平`}
              </h2>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                    style={{ width: `${activeGoal.current_proficiency || 0}%` }}
                  ></div>
                </div>
                <span className="text-sm font-bold text-indigo-600">{activeGoal.current_proficiency || 0}%</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span>📅 {activeGoal.completion_time_days || 30}天计划</span>
                <span>🎯 {activeGoal.scenarios?.length || 0}个场景</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">AI导师音色</h3>
              <div className="grid grid-cols-2 gap-3">
                {VOICE_OPTIONS.map((voice) => (
                  <button
                    key={voice.id}
                    onClick={() => handleVoiceChange(voice.id)}
                    className={`p-3 rounded-xl border-2 transition-all ${
                      selectedVoice === voice.id
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-indigo-500">
                        {selectedVoice === voice.id ? 'check_circle' : 'record_voice_over'}
                      </span>
                      <div className="text-left">
                        <p className="font-medium text-slate-900 dark:text-white text-sm">{voice.name}</p>
                        <p className="text-xs text-slate-500">{voice.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleNewGoal}
              className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:border-indigo-500 hover:text-indigo-500 transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">add</span>
              设定新目标
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">target</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">还没有学习目标</h2>
            <p className="text-slate-500 mb-6">设定一个目标开始你的口语练习之旅吧！</p>
            <button
              onClick={handleNewGoal}
              className="px-6 py-3 bg-primary text-white rounded-xl font-medium hover:opacity-90 transition-all"
            >
              设定目标
            </button>
          </div>
        )}
      </main>

      <BottomNav currentPage="goals" />
    </div>
  );
}

export default Goals;
