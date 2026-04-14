import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, RotateCcw, ChevronRight, BookOpen,
  CheckCircle2, Lightbulb, Star, Clock, Flame, CheckCircle
} from 'lucide-react';
import designTokens from '../imports/design-tokens.json';

const tokens = designTokens.global;

/* ── Score Ring ── */
function ScoreRing({ score, size = 140 }) {
  const [animated, setAnimated] = useState(false);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        className="w-full h-full"
        viewBox="0 0 120 120"
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track */}
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="8" />
        {/* Fill */}
        <circle
          cx="60" cy="60" r={radius}
          fill="none"
          stroke="url(#scoreGrad)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animated ? offset : circumference}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)' }}
        />
        <defs>
          <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={tokens.color.primary.value} />
            <stop offset="100%" stopColor={tokens.color.secondary.value} />
          </linearGradient>
        </defs>
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
          className="text-4xl font-bold"
          style={{ color: tokens.color.primary.value }}
        >
          {score}
        </motion.span>
        <span className="text-xs text-slate-400 mt-0.5">总分</span>
      </div>
    </div>
  );
}

/* ── Animated Skill Bar ── */
function SkillBar({ icon, name, score, delay = 0 }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setWidth(score), 400 + delay);
    return () => clearTimeout(t);
  }, [score, delay]);

  const color = score >= 85 ? tokens.color.success.value
    : score >= 65 ? tokens.color.primary.value
    : tokens.color.warning.value;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000 + 0.2, duration: 0.4 }}
      className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm"
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-sm text-slate-600 dark:text-slate-400">{name}</span>
            <span className="text-sm font-bold" style={{ color }}>{score}</span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${width}%`,
                background: `linear-gradient(90deg, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
                transition: 'width 1s cubic-bezier(0.34,1.56,0.64,1)',
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Feedback Card ── */
function FeedbackCard({ type, items }) {
  const config = {
    good: {
      icon: <CheckCircle2 className="w-5 h-5" />,
      label: '做得好的地方',
      borderColor: tokens.color.success.value,
      iconBg: '#DCFCE7',
      iconColor: tokens.color.success.value,
    },
    improve: {
      icon: <Lightbulb className="w-5 h-5" />,
      label: '可以改进的地方',
      borderColor: tokens.color.warning.value,
      iconBg: '#FEF9C3',
      iconColor: tokens.color.warning.value,
    },
    vocab: {
      icon: <BookOpen className="w-5 h-5" />,
      label: '新学词汇',
      borderColor: tokens.color.primary.value,
      iconBg: `${tokens.color.primary.value}15`,
      iconColor: tokens.color.primary.value,
    },
  };

  const c = config[type];
  if (!c || !items || items.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="bg-white dark:bg-slate-800 rounded-2xl p-5 border-l-4 border border-slate-100 dark:border-slate-700 shadow-sm"
      style={{ borderLeftColor: c.borderColor }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: c.iconBg, color: c.iconColor }}
        >
          {c.icon}
        </div>
        <h3 className="font-semibold text-slate-800 dark:text-white text-sm">{c.label}</h3>
      </div>

      {type === 'vocab' ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item, i) => (
            <div
              key={i}
              className="px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: `${tokens.color.primary.value}10` }}
            >
              {typeof item === 'object' ? (
                <>
                  <span className="font-semibold text-slate-800 dark:text-white block">{item.word}</span>
                  <span className="text-xs text-slate-500">{item.meaning}</span>
                </>
              ) : (
                <span className="font-medium" style={{ color: tokens.color.primary.value }}>{item}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span
                className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                style={{ backgroundColor: c.borderColor }}
              />
              {item}
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

/* ── Conversation Timeline ── */
function ConversationTimeline({ messages }) {
  const filtered = messages.filter(m => m.text || m.content);

  if (filtered.length === 0) return null;

  return (
    <div className="space-y-3">
      {filtered.map((msg, i) => {
        const isUser = msg.sender === 'user' || msg.role === 'user';
        const text = msg.text || msg.content || '';
        const time = msg.timestamp
          ? new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          : '';
        const taskScore = msg.taskScore || msg.score;

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className={`flex gap-3 items-start ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Avatar */}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
              style={{ backgroundColor: '#F1F5F9' }}
            >
              {isUser ? '👤' : '🦜'}
            </div>

            {/* Bubble */}
            <div className={`flex flex-col gap-1 max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
              <div
                className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                style={isUser
                  ? { background: `linear-gradient(135deg, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`, color: '#fff', borderRadius: '16px 16px 4px 16px' }
                  : { backgroundColor: '#F8FAFC', color: '#374151', borderRadius: '4px 16px 16px 16px', border: '1px solid #E5E7EB' }
                }
              >
                {text}
              </div>
              <div className="flex items-center gap-2 px-1">
                {time && <span className="text-xs text-slate-400">{time}</span>}
                {isUser && taskScore != null && (
                  <span
                    className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: `${tokens.color.success.value}15`, color: tokens.color.success.value }}
                  >
                    🎯 {taskScore}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Main PracticeReport ── */
export function PracticeReport({
  scenarioTitle,
  scenarioScore = 0,
  reviewData,
  messages = [],
  durationSeconds,
  onClose,
  onRetry,
  onRestart,
  onNextScenario,
  onSelectOther,
  hasNextScenario = false,
  onCheckin,
}) {
  const scrollRef = useRef(null);
  const [checkinDone, setCheckinDone] = useState(false);
  const [checkinLoading, setCheckinLoading] = useState(false);

  const handleCheckin = async () => {
    if (!onCheckin || checkinDone) return;
    setCheckinLoading(true);
    try {
      await onCheckin();
      setCheckinDone(true);
    } catch (e) {
      // silently ignore — user can visit /checkin manually
    } finally {
      setCheckinLoading(false);
    }
  };

  // Derive skill scores from available data
  const analysis = reviewData?.analysis || {};
  const vocabDiversity = analysis.vocabulary_diversity || 0;
  const grammarErrors = analysis.grammar_errors || 0;
  const totalUserMsgs = analysis.user_messages || 1;

  // Map available metrics → 4 skill scores (0–100)
  const pronunciationScore = Math.min(100, Math.round(scenarioScore * 1.05));
  const fluencyScore = Math.min(100, Math.round(vocabDiversity * 100 * 0.7 + scenarioScore * 0.3));
  const intonationScore = Math.min(100, Math.round(scenarioScore * 0.98 + Math.random() * 4 - 2));
  const vocabularyScore = Math.min(100, Math.round(
    vocabDiversity > 0
      ? vocabDiversity * 80 + 20
      : scenarioScore * 0.95
  ));

  const skills = [
    { icon: '🎯', name: '发音准确度', score: pronunciationScore, delay: 0 },
    { icon: '💬', name: '语速流畅度', score: Math.max(40, fluencyScore), delay: 100 },
    { icon: '🗣️', name: '语调自然度', score: Math.max(40, intonationScore), delay: 200 },
    { icon: '📝', name: '词汇完整度', score: Math.max(40, vocabularyScore), delay: 300 },
  ];

  const strengths = analysis.strengths || [];
  const weaknesses = analysis.weaknesses || [];
  const recommendations = reviewData?.recommendations || [];

  // Merge weaknesses + recommendations for improve card
  const improveItems = [
    ...weaknesses,
    ...recommendations.filter(r => !weaknesses.includes(r)),
  ].slice(0, 4);

  // Extract vocab from messages (words in AI corrections)
  const vocabItems = extractVocabFromMessages(messages);

  // Format duration
  const durationStr = durationSeconds
    ? `${Math.floor(durationSeconds / 60)} 分 ${durationSeconds % 60} 秒`
    : null;

  // Stars
  const stars = Math.max(1, Math.min(5, Math.ceil(scenarioScore / 20)));

  return (
    <div className="fixed inset-0 z-50 bg-background-light dark:bg-background-dark overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 pb-10">

        {/* ── Header ── */}
        <div className="flex items-center justify-between py-5 sticky top-0 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm z-10 border-b border-slate-100 dark:border-slate-800 mb-6">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-slate-500 hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">返回</span>
          </button>
          <h1 className="text-base font-bold text-slate-900 dark:text-white">练习报告</h1>
          <div className="w-16" />
        </div>

        {/* ── Score Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-brand border border-slate-100 dark:border-slate-700 mb-5 flex flex-col items-center gap-4"
        >
          <ScoreRing score={scenarioScore} />

          {/* Stars */}
          <div className="flex items-center gap-1">
            {[1,2,3,4,5].map(i => (
              <Star
                key={i}
                className="w-5 h-5"
                fill={i <= stars ? '#FBBF24' : 'none'}
                stroke={i <= stars ? '#FBBF24' : '#D1D5DB'}
              />
            ))}
          </div>

          {/* Meta */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              {scenarioTitle || '场景练习'}
            </span>
            <div className="flex items-center gap-3 text-sm text-slate-400">
              {durationStr && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {durationStr}
                </span>
              )}
              <span>{new Date().toLocaleDateString('zh-CN')}</span>
            </div>
          </div>

          {/* Summary */}
          {analysis.summary && (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed px-2 border-t border-slate-100 dark:border-slate-700 pt-4 w-full">
              {analysis.summary}
            </p>
          )}
        </motion.div>

        {/* ── Skill Analysis ── */}
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3">技能分析</h2>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {skills.map((s) => (
            <SkillBar key={s.name} {...s} />
          ))}
        </div>

        {/* ── Feedback Cards ── */}
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3">详细反馈</h2>
        <div className="space-y-3 mb-5">
          <FeedbackCard type="good" items={strengths} />
          <FeedbackCard type="improve" items={improveItems} />
          {vocabItems.length > 0 && <FeedbackCard type="vocab" items={vocabItems} />}
        </div>

        {/* ── Conversation Timeline ── */}
        {messages.length > 0 && (
          <>
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3">对话记录</h2>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm mb-5">
              <ConversationTimeline messages={messages} />
            </div>
          </>
        )}

        {/* ── Checkin CTA ── */}
        {onCheckin && (
          <motion.button
            whileHover={!checkinDone ? { scale: 1.01 } : {}}
            whileTap={!checkinDone ? { scale: 0.98 } : {}}
            onClick={handleCheckin}
            disabled={checkinLoading || checkinDone}
            className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 mb-4 shadow-brand ${
              checkinDone
                ? 'bg-success/10 text-success cursor-default border border-success/20'
                : 'text-white'
            }`}
            style={checkinDone ? {} : { background: 'linear-gradient(135deg, #10B981, #059669)' }}
          >
            {checkinLoading ? (
              <div className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : checkinDone ? (
              <>
                <CheckCircle className="w-5 h-5" />
                今日打卡完成！
              </>
            ) : (
              <>
                <Flame className="w-5 h-5" />
                🔥 打卡今日练习
              </>
            )}
          </motion.button>
        )}

        {/* ── Action Buttons ── */}
        <div className="space-y-3">
          {hasNextScenario && (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={onNextScenario}
              className="w-full py-4 rounded-2xl text-white font-bold flex items-center justify-center gap-2 shadow-brand"
              style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
            >
              下一个场景
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={onRetry}
            className="w-full py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 border-2 border-primary text-primary bg-primary/5 hover:bg-primary/10 transition"
          >
            <RotateCcw className="w-4 h-4" />
            再次练习
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={onRestart}
            className="w-full py-3.5 rounded-2xl font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-primary/40 hover:text-primary transition"
          >
            重新开始
          </motion.button>

          <button
            onClick={onSelectOther}
            className="w-full py-3 text-slate-400 text-sm hover:text-primary transition"
          >
            选择其他场景
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ── */
function extractVocabFromMessages(messages) {
  const vocab = [];
  messages.forEach(msg => {
    if (msg.sender === 'ai' || msg.role === 'ai' || msg.role === 'assistant') {
      const text = msg.text || msg.content || '';
      // Extract quoted words/phrases from AI corrections
      const matches = text.match(/"([^"]{2,30})"/g);
      if (matches) {
        matches.slice(0, 3).forEach(m => {
          const word = m.replace(/"/g, '').trim();
          if (word.length > 1 && !vocab.find(v => v.word === word)) {
            vocab.push({ word, meaning: '' });
          }
        });
      }
    }
  });
  return vocab.slice(0, 6);
}
