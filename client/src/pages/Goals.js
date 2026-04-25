import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp, Plus, Target, Flame, CheckCircle } from 'lucide-react';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../services/api';

const VOICE_OPTIONS = [
  { id: 'Tina',   name: 'Tina',   description: '清晰女声（默认）', emoji: '👩' },
  { id: 'Serena', name: 'Serena', description: '温柔女声',         emoji: '🎙️' },
  { id: 'Evan',   name: 'Evan',   description: '活力男声',         emoji: '👨' },
  { id: 'Arda',   name: 'Arda',   description: '稳重男声',         emoji: '🎤' },
];

function getGoalProgress(goal) {
  if (!goal?.scenarios?.length) return { completed: 0, total: 0, pct: 0 };
  const total = goal.scenarios.length;
  const completed = goal.scenarios.filter(s =>
    s.tasks?.length > 0 && s.tasks.every(t => t.status === 'completed')
  ).length;
  return { completed, total, pct: Math.round((completed / total) * 100) };
}

function GoalCard({ goal, isActive, onPractice, index }) {
  const { completed, total, pct } = getGoalProgress(goal);
  const [expanded, setExpanded] = useState(false);
  const visibleScenarios = expanded ? goal.scenarios : (goal.scenarios || []).slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="bg-white dark:bg-slate-800 rounded-2xl shadow-brand border border-slate-100 dark:border-slate-700 p-4 mb-3"
    >
      {/* Goal Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 pr-2">
          <p className="font-semibold text-slate-900 dark:text-white text-sm leading-snug mb-1 truncate">
            {goal.description || `${goal.target_language} ${goal.target_level}`}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {goal.target_language} · {goal.target_level}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                goal.status === 'active'
                  ? 'bg-primary/10 text-primary'
                  : goal.status === 'paused'
                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {goal.status === 'active' ? '进行中' : goal.status === 'paused' ? '已暂停' : '已完成'}
            </span>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-lg font-bold text-primary">{pct}%</p>
          <p className="text-xs text-slate-400">{completed}/{total}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: index * 0.08 + 0.2 }}
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
        />
      </div>

      {/* Scenario List */}
      {isActive && goal.scenarios?.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {visibleScenarios.map((s, i) => {
            const done = s.tasks?.length > 0 && s.tasks.every(t => t.status === 'completed');
            return (
              <div key={i} className="flex items-center gap-2">
                {done ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 flex-shrink-0" />
                )}
                <span className={`text-xs ${
                  done
                    ? 'text-slate-400 line-through'
                    : 'text-slate-700 dark:text-slate-300'
                }`}>
                  {s.title}
                </span>
              </div>
            );
          })}
          {goal.scenarios.length > 3 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-xs text-primary mt-1 hover:text-primary/80 transition-colors"
            >
              {expanded ? (
                <><ChevronUp className="w-3 h-3" /> 收起</>
              ) : (
                <><ChevronDown className="w-3 h-3" /> 查看全部 {goal.scenarios.length} 个场景</>
              )}
            </button>
          )}
        </div>
      )}

      {/* CTA Button */}
      {(goal.status === 'active' || goal.status === 'paused') && (
        <button
          onClick={onPractice}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
          style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
        >
          {goal.status === 'active' ? '继续练习 →' : '切换并练习 →'}
        </button>
      )}
    </motion.div>
  );
}

function Goals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [allGoals, setAllGoals] = useState([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState(() => {
    const saved = localStorage.getItem('ai_voice');
    return VOICE_OPTIONS.some(v => v.id === saved) ? saved : 'Tina';
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [goalsRes, checkinRes] = await Promise.all([
          userAPI.getUserGoals().catch(() => null),
          userAPI.getCheckinStats().catch(() => null),
        ]);
        if (goalsRes?.goals) setAllGoals(goalsRes.goals);
        else if (goalsRes?.goal) setAllGoals([goalsRes.goal]);
        if (checkinRes?.streak) setStreak(checkinRes.streak);
      } catch (e) {
        console.error('Goals load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleVoiceChange = (id) => {
    setSelectedVoice(id);
    localStorage.setItem('ai_voice', id);
  };

  const activeGoals = allGoals.filter(g => g.status === 'active' || g.status === 'paused');
  const completedGoals = allGoals.filter(g => g.status === 'completed');
  const totalCompletedScenes = allGoals.reduce((acc, g) => {
    return acc + (g.scenarios || []).filter(s =>
      s.tasks?.length > 0 && s.tasks.every(t => t.status === 'completed')
    ).length;
  }, 0);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col min-h-screen w-full bg-background-light dark:bg-background-dark">
      {/* Header */}
      <div className="flex items-center bg-white dark:bg-slate-800 px-4 py-3 justify-between sticky top-0 z-10 border-b border-slate-100 dark:border-slate-700 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">学习目标</h1>
        <button
          onClick={() => navigate('/goal-setting')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新目标
        </button>
      </div>

      <main className="flex-grow pb-28">
        {/* Summary Stats */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-3 px-4 pt-4 mb-4"
        >
          {[
            { label: '进行中', value: activeGoals.length, icon: <Target className="w-4 h-4" />, color: 'text-primary', bg: 'bg-primary/10' },
            { label: '已完成场景', value: totalCompletedScenes, icon: <CheckCircle className="w-4 h-4" />, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
            { label: '连续天数', value: streak, icon: <Flame className="w-4 h-4" />, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl p-3 bg-white dark:bg-slate-800 shadow-brand border border-slate-100 dark:border-slate-700"
            >
              <div className={`p-1.5 rounded-lg ${s.bg} ${s.color}`}>{s.icon}</div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center leading-tight">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>

        <div className="px-4">
          {/* Active Goals */}
          {activeGoals.length > 0 ? (
            <>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">进行中</p>
              {activeGoals.map((g, i) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  isActive
                  index={i}
                  onPractice={async () => {
                    if (g.status !== 'active') {
                      try {
                        await userAPI.switchGoal(g.id);
                      } catch (e) {
                        console.error('Failed to switch goal:', e);
                        return;
                      }
                    }
                    navigate('/discovery');
                  }}
                />
              ))}
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-brand border border-slate-100 dark:border-slate-700 p-8 text-center mb-4"
            >
              <div className="text-4xl mb-3">🎯</div>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">还没有进行中的目标</p>
              <button
                onClick={() => navigate('/goal-setting')}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
              >
                设定新目标
              </button>
            </motion.div>
          )}

          {/* AI Voice Selection */}
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 mt-2">AI 导师音色</p>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-brand border border-slate-100 dark:border-slate-700 p-4 mb-4"
          >
            <div className="grid grid-cols-2 gap-2">
              {VOICE_OPTIONS.map(v => (
                <button
                  key={v.id}
                  onClick={() => handleVoiceChange(v.id)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left ${
                    selectedVoice === v.id
                      ? 'border-primary bg-primary/5 dark:bg-primary/10'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 hover:border-primary/30'
                  }`}
                >
                  <span className="text-lg">{v.emoji}</span>
                  <div>
                    <p className={`text-sm font-semibold ${selectedVoice === v.id ? 'text-primary' : 'text-slate-800 dark:text-slate-200'}`}>
                      {v.name}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{v.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>

          {/* Completed Goals */}
          {completedGoals.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 mt-2">已完成</p>
              {completedGoals.map((g, i) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  isActive={false}
                  index={i}
                  onPractice={() => {}}
                />
              ))}
            </>
          )}
        </div>
      </main>

      <BottomNav currentPage="goals" />
    </div>
  );
}

export default Goals;
