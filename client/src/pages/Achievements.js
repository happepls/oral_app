import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { userAPI } from '../services/api';
import { motion } from 'motion/react';

const ACHIEVEMENT_ICONS = {
  first_steps: '👣',
  bookworm: '📖',
  scholar: '🎓',
  master: '🏅',
  getting_started: '🔥',
  dedicated: '💪',
  unstoppable: '⚡',
  legend: '👑',
  conversation_starter: '💬',
  perfect_score: '⭐',
  polyglot: '🌍',
  actor: '🎭',
};

const ACHIEVEMENT_NAMES = {
  first_steps: 'First Steps',
  bookworm: 'Bookworm',
  scholar: 'Scholar',
  master: 'Master',
  getting_started: 'Getting Started',
  dedicated: 'Dedicated',
  unstoppable: 'Unstoppable',
  legend: 'Legend',
  conversation_starter: 'Conversation Starter',
  perfect_score: 'Perfect Score',
  polyglot: 'Polyglot',
  actor: 'Actor',
};

const ACHIEVEMENT_CATEGORIES = {
  Learning: {
    icon: '📚',
    achievements: ['first_steps', 'bookworm', 'scholar', 'master'],
  },
  Streaks: {
    icon: '🔥',
    achievements: ['getting_started', 'dedicated', 'unstoppable', 'legend'],
  },
  Skills: {
    icon: '🎤',
    achievements: ['conversation_starter', 'perfect_score', 'polyglot', 'actor'],
  },
};

function Achievements() {
  const navigate = useNavigate();
  const [achievements, setAchievements] = useState([]);
  const [stats, setStats] = useState({ unlocked: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [unlockedAchievements, setUnlockedAchievements] = useState(new Set());

  useEffect(() => {
    const fetchAchievements = async () => {
      try {
        const data = await userAPI.achievements();
        if (data) {
          setAchievements(data.achievements || []);
          setStats({
            unlocked: data.unlocked || 0,
            total: data.total || 12,
          });
          const unlockedSet = new Set(
            (data.achievements || [])
              .filter(a => a.unlocked)
              .map(a => a.id)
          );
          setUnlockedAchievements(unlockedSet);
        }
      } catch (err) {
        console.error('Failed to fetch achievements:', err);
        setStats({ unlocked: 0, total: 12 });
      } finally {
        setLoading(false);
      }
    };

    fetchAchievements();
  }, []);

  const findFeaturedAchievement = () => {
    const unlocked = achievements.filter(a => unlockedAchievements.has(a.id));
    if (unlocked.length === achievements.length) return null;
    return achievements.find(a => !unlockedAchievements.has(a.id)) || null;
  };

  const featuredAchievement = findFeaturedAchievement();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: '#637FF1', borderTopColor: 'transparent' }} />
          <p className="text-sm text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col min-h-screen w-full bg-background-light dark:bg-background-dark">
      {/* ── Header ── */}
      <header className="px-5 pt-5 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Achievements 🏆</h1>
          </div>
        </div>

        {/* ── Progress ── */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {stats.unlocked} of {stats.total} unlocked
            </span>
            <span className="text-xs text-slate-500">
              {Math.round((stats.unlocked / stats.total) * 100)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(stats.unlocked / stats.total) * 100}%`,
                background: 'linear-gradient(135deg, #637FF1, #a47af6)',
              }}
            />
          </div>
        </div>
      </header>

      <main className="flex-grow pb-28 space-y-5 px-4 pt-3">
        {/* ── Featured Achievement ── */}
        {featuredAchievement && (
          <section>
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
              Next Target
            </h2>
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="rounded-2xl p-5 relative overflow-hidden shadow-lg"
              style={{
                background: 'linear-gradient(135deg, rgba(99,127,241,0.12), rgba(164,122,246,0.08))',
                border: '1px solid rgba(99,127,241,0.2)',
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-5xl mb-2">
                    {ACHIEVEMENT_ICONS[featuredAchievement.id] || '🎯'}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                    {ACHIEVEMENT_NAMES[featuredAchievement.id] || featuredAchievement.id}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {featuredAchievement.description || 'Keep working to unlock this achievement'}
                  </p>
                  {featuredAchievement.progress && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500">Progress</span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {featuredAchievement.progress}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${featuredAchievement.progress || 0}%`,
                            background: 'linear-gradient(135deg, #637FF1, #a47af6)',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </section>
        )}

        {/* ── Achievement Categories ── */}
        {Object.entries(ACHIEVEMENT_CATEGORIES).map(([category, { icon, achievements: achIds }]) => (
          <section key={category}>
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
              {icon} {category}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {achIds.map(achId => {
                const achData = achievements.find(a => a.id === achId);
                const isUnlocked = unlockedAchievements.has(achId);
                return (
                  <motion.div
                    key={achId}
                    whileHover={{ scale: 1.05 }}
                    className="rounded-xl p-4 text-center transition-all"
                    style={{
                      background: isUnlocked ? '#F9FAFB' : '#F3F4F6',
                      border: isUnlocked ? '1px solid #E5E7EB' : '1px solid #D1D5DB',
                      opacity: isUnlocked ? 1 : 0.6,
                      filter: isUnlocked ? 'grayscale(0%)' : 'grayscale(100%)',
                    }}
                  >
                    <div className="text-4xl mb-2">
                      {ACHIEVEMENT_ICONS[achId] || '🎯'}
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-1 line-clamp-2">
                      {ACHIEVEMENT_NAMES[achId] || achId}
                    </h3>
                    {isUnlocked && achData?.unlocked_date ? (
                      <p className="text-xs text-green-600 font-medium">
                        {new Date(achData.unlocked_date).toLocaleDateString('zh-CN')}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 font-medium">Locked</p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      <BottomNav currentPage="" />
    </div>
  );
}

export default Achievements;
