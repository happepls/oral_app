import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronRight, ChevronLeft } from 'lucide-react';

// ── 母语选项 ──
const NATIVE_LANGUAGES = [
  { value: 'Chinese',    label: '中文',     flag: '🇨🇳' },
  { value: 'English',    label: 'English',   flag: '🇺🇸' },
  { value: 'Japanese',   label: '日本語',    flag: '🇯🇵' },
  { value: 'Korean',     label: '한국어',    flag: '🇰🇷' },
  { value: 'French',     label: 'Français',  flag: '🇫🇷' },
  { value: 'Spanish',    label: 'Español',   flag: '🇪🇸' },
  { value: 'German',     label: 'Deutsch',   flag: '🇩🇪' },
  { value: 'Portuguese', label: 'Português', flag: '🇧🇷' },
  { value: 'Russian',    label: 'Русский',   flag: '🇷🇺' },
];

const GENDER_OPTIONS = [
  { value: 'male',   label: '男 ♂' },
  { value: 'female', label: '女 ♀' },
  { value: 'other',  label: '其他' },
];

// ── 口语水平问卷 ──
const QUIZ_QUESTIONS = [
  {
    id: 'q1',
    icon: '🌍',
    question: '你目前最常接触外语的场景是什么？',
    type: 'single',
    options: [
      { label: '几乎不接触，靠课本/应试', score: 0, emoji: '📚' },
      { label: '偶尔刷外语内容（视频/音乐）', score: 2, emoji: '🎵' },
      { label: '工作/学习中需要读写，但很少开口', score: 4, emoji: '💻' },
      { label: '身边有外国同事或朋友，常用外语', score: 7, emoji: '👥' },
      { label: '生活在外语环境中，天天沉浸', score: 10, emoji: '✈️' },
    ],
  },
  {
    id: 'q2',
    icon: '⏰',
    question: '你多久会主动开口说外语？',
    type: 'single',
    options: [
      { label: '从来不说，太怕尴尬了', score: 0, emoji: '🙈' },
      { label: '偶尔（一个月不到几次）', score: 2, emoji: '😅' },
      { label: '每周都会说几次', score: 4, emoji: '😊' },
      { label: '几乎每天都开口', score: 6, emoji: '💬' },
    ],
  },
  {
    id: 'q3',
    icon: '☕',
    question: '遇到外国人随意闲聊（small talk），你通常怎么反应？',
    type: 'single',
    options: [
      { label: '沉默或摆手，完全不知道说啥', score: 0, emoji: '😶' },
      { label: '能应付简单问候，再深入就卡壳', score: 2, emoji: '😬' },
      { label: '可以聊天气、爱好等轻松话题', score: 5, emoji: '🙂' },
      { label: '聊得来，能玩梗开玩笑', score: 7, emoji: '😄' },
      { label: '完全没压力，融入当地人圈子', score: 9, emoji: '🤝' },
    ],
  },
  {
    id: 'q4',
    icon: '✅',
    question: '以下场景，你能独立应对哪些？（可多选）',
    type: 'multi',
    options: [
      { label: '问路或乘坐公共交通', emoji: '🚌' },
      { label: '餐厅点餐、咖啡厅闲聊', emoji: '🍽️' },
      { label: '工作中介绍自己或做简单汇报', emoji: '💼' },
      { label: '和朋友讨论新闻、电影或热点话题', emoji: '📱' },
      { label: '无字幕看懂外语电影/综艺', emoji: '🎬' },
    ],
  },
];

// ── CEFR 等级映射 ──
const LEVEL_MAP = [
  {
    min: 0, max: 4,
    cefr: 'A1', label: '入门级', tag: 'Beginner',
    color: '#10B981', bgColor: '#ECFDF5',
    desc: '你刚刚起步，这里是绝佳的开始！我们会从最基础的日常对话开始，帮你建立说话的信心。',
    emoji: '🌱',
  },
  {
    min: 5, max: 9,
    cefr: 'A2', label: '基础级', tag: 'Elementary',
    color: '#3B82F6', bgColor: '#EFF6FF',
    desc: '你已经掌握了基础词汇和句型，能处理简单场景。接下来我们一起扩大你的口语舒适区！',
    emoji: '📖',
  },
  {
    min: 10, max: 15,
    cefr: 'B1', label: '中级', tag: 'Intermediate',
    color: '#637FF1', bgColor: '#EEF2FF',
    desc: '你能进行日常对话，表达基本意思。我们将帮你从"能说"进化到"说得好"！',
    emoji: '🗣️',
  },
  {
    min: 16, max: 21,
    cefr: 'B2', label: '中高级', tag: 'Upper-Intermediate',
    color: '#8B5CF6', bgColor: '#F5F3FF',
    desc: '你已经相当流畅了！接下来的训练将聚焦于地道表达、语感和高难度场景。',
    emoji: '💼',
  },
  {
    min: 22, max: 24,
    cefr: 'C1', label: '高级', tag: 'Advanced',
    color: '#F59E0B', bgColor: '#FFFBEB',
    desc: '你的口语已经达到很高水平！我们将专注于细节打磨和真实场景中的完美表达。',
    emoji: '🌟',
  },
  {
    min: 25, max: 99,
    cefr: 'C2', label: '近母语级', tag: 'Fluent',
    color: '#EF4444', bgColor: '#FEF2F2',
    desc: '令人印象深刻！你几乎和母语者一样流利。我们将提供最高阶的口语挑战。',
    emoji: '🏆',
  },
];

function getLevel(score) {
  return LEVEL_MAP.find(l => score >= l.min && score <= l.max) || LEVEL_MAP[0];
}

function calcScore(answers) {
  let total = 0;
  QUIZ_QUESTIONS.forEach(q => {
    const ans = answers[q.id];
    if (!ans) return;
    if (q.type === 'single') {
      const opt = q.options.find(o => o.label === ans);
      if (opt) total += opt.score;
    } else {
      // multi: 每项 1 分
      total += (ans || []).length;
    }
  });
  return total;
}

// 分数 → 0-100 proficiency
function scoreToProficiency(score) {
  const maxScore = 10 + 6 + 9 + 5; // 30
  return Math.round(Math.min(100, (score / maxScore) * 100));
}

// ── 步骤配置 ──
const STEPS = ['基础信息', '口语测评', '评测结果'];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const { t } = useTranslation();

  // Step 0: 基础信息
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [nativeLanguage, setNativeLanguage] = useState(user?.native_language || 'Chinese');
  const [error, setError] = useState('');

  // Step 1: 问卷
  const [answers, setAnswers] = useState({});
  const [currentQ, setCurrentQ] = useState(0); // 当前问题索引（0-3）

  // 流程
  const [step, setStep] = useState(0);          // 0=基础信息, 1=问卷, 2=结果
  const [saving, setSaving] = useState(false);

  // 结果
  const quizScore = calcScore(answers);
  const level = getLevel(quizScore);
  const proficiency = scoreToProficiency(quizScore);

  // ── 问题答题处理 ──
  const handleSingleAnswer = (qId, label) => {
    setAnswers(prev => ({ ...prev, [qId]: label }));
  };
  const handleMultiAnswer = (qId, label) => {
    setAnswers(prev => {
      const cur = prev[qId] || [];
      return {
        ...prev,
        [qId]: cur.includes(label) ? cur.filter(l => l !== label) : [...cur, label],
      };
    });
  };
  const isAnswered = (q) => {
    if (q.type === 'single') return !!answers[q.id];
    return (answers[q.id] || []).length > 0;
  };

  // ── 提交整体数据 ──
  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const genderMap = { '': null, male: 1, female: 0, other: 2 };
      const result = await updateProfile({
        nickname,
        gender: genderMap[gender] !== undefined ? genderMap[gender] : null,
        native_language: nativeLanguage,
      });
      if (result.success) {
        // 将评测结果传给 GoalSetting 作为初始水平建议
        navigate('/goal-setting', {
          state: {
            suggestedLevel: level.tag,
            proficiencyScore: proficiency,
            cefrLabel: `${level.cefr} · ${level.label}`,
          },
        });
      } else {
        setError(result.message || t('err_onboarding_default'));
      }
    } catch (err) {
      setError(err.message || t('err_onboarding_default'));
    } finally {
      setSaving(false);
    }
  };

  // ── 进度条 ──
  const progressPct = step === 0 ? 33 : step === 1 ? 66 : 100;

  // ── 渲染各步骤 ──
  const variants = {
    enter:  (dir) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:   (dir) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
  };
  const [direction, setDirection] = useState(1);

  const goToStep = (next) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 flex flex-col items-center px-4 py-8">

      {/* Top bar */}
      <div className="w-full max-w-lg flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl" style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }} />
          <span className="font-bold text-slate-800 dark:text-white text-lg">Oral AI</span>
        </div>
        <LanguageSwitcher />
      </div>

      {/* 进度指示 */}
      <div className="w-full max-w-lg mb-6">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                i < step ? 'text-white' : i === step ? 'text-white' : 'text-slate-400 bg-slate-100 dark:bg-slate-700'
              }`} style={i <= step ? { background: 'linear-gradient(135deg, #637FF1, #a47af6)' } : {}}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`hidden sm:block ${i === step ? 'text-primary font-semibold' : 'text-slate-400'}`}>{s}</span>
            </div>
          ))}
        </div>
        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, #637FF1, #a47af6)' }}
            animate={{ width: `${progressPct}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
        </div>
      </div>

      {/* 内容卡片 */}
      <div className="w-full max-w-lg overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>

          {/* ── Step 0: 基础信息 ── */}
          {step === 0 && (
            <motion.div key="step0" custom={direction} variants={variants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3, ease: 'easeOut' }}>

              <div className="text-center mb-6">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-5xl mb-3">🦜</motion.div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{t('onboarding_title')}</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm">{t('onboarding_subtitle')}</p>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-brand border border-slate-100 dark:border-slate-700 space-y-5">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
                )}

                {/* 昵称 */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    {t('nickname_label')}
                  </label>
                  <input type="text" value={nickname} onChange={e => setNickname(e.target.value)}
                    required placeholder={t('nickname_label')}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition" />
                </div>

                {/* 性别 */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    {t('gender_label')}
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setGender('')}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition ${
                        gender === '' ? 'border-primary text-primary bg-primary/5' : 'border-slate-200 text-slate-500'}`}>
                      {t('gender_placeholder')}
                    </button>
                    {GENDER_OPTIONS.map(({ value, label }) => (
                      <button key={value} type="button" onClick={() => setGender(value)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition ${
                          gender === value ? 'text-white border-transparent' : 'border-slate-200 text-slate-600'}`}
                        style={gender === value ? { background: 'linear-gradient(135deg, #637FF1, #a47af6)' } : {}}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 母语 */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    {t('native_language_label')}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {NATIVE_LANGUAGES.map(({ value, label, flag }) => {
                      const sel = nativeLanguage === value;
                      return (
                        <motion.button key={value} type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                          onClick={() => setNativeLanguage(value)}
                          className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition text-sm font-medium ${
                            sel ? 'border-transparent text-white shadow-brand' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'}`}
                          style={sel ? { background: 'linear-gradient(135deg, #637FF1, #a47af6)' } : {}}>
                          <span className="text-2xl">{flag}</span>
                          <span className="text-xs leading-tight text-center">{label}</span>
                          {sel && <Check className="w-3 h-3" />}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  type="button" disabled={!nickname.trim()}
                  onClick={() => { if (nickname.trim()) goToStep(1); }}
                  className="w-full py-3.5 flex items-center justify-center gap-2 rounded-xl text-white font-bold text-base shadow-brand disabled:opacity-40 disabled:cursor-not-allowed transition"
                  style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}>
                  下一步：测评口语水平
                  <ChevronRight className="w-5 h-5" />
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── Step 1: 问卷（逐题展示） ── */}
          {step === 1 && (
            <motion.div key={`step1-q${currentQ}`} custom={direction} variants={variants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3, ease: 'easeOut' }}>

              {/* 问卷头 */}
              <div className="text-center mb-5">
                <span className="text-4xl">{QUIZ_QUESTIONS[currentQ].icon}</span>
                <p className="text-xs text-slate-400 mt-2">问题 {currentQ + 1} / {QUIZ_QUESTIONS.length}</p>
                {/* 问题内进度条 */}
                <div className="mt-2 flex gap-1 justify-center">
                  {QUIZ_QUESTIONS.map((_, i) => (
                    <div key={i} className="h-1 rounded-full transition-all"
                      style={{ width: 28, background: i <= currentQ ? '#637FF1' : '#E5E7EB' }} />
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-brand border border-slate-100 dark:border-slate-700">
                <h2 className="text-base font-bold text-slate-900 dark:text-white mb-5 leading-snug">
                  {QUIZ_QUESTIONS[currentQ].question}
                </h2>

                {/* 单选 */}
                {QUIZ_QUESTIONS[currentQ].type === 'single' && (
                  <div className="space-y-2.5">
                    {QUIZ_QUESTIONS[currentQ].options.map(opt => {
                      const sel = answers[QUIZ_QUESTIONS[currentQ].id] === opt.label;
                      return (
                        <motion.button key={opt.label} type="button" whileTap={{ scale: 0.98 }}
                          onClick={() => handleSingleAnswer(QUIZ_QUESTIONS[currentQ].id, opt.label)}
                          className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all ${
                            sel ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-primary/40'}`}>
                          <span className="text-xl flex-shrink-0">{opt.emoji}</span>
                          <span className="text-sm font-medium flex-1">{opt.label}</span>
                          {sel && (
                            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ background: '#637FF1' }}>
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {/* 多选 */}
                {QUIZ_QUESTIONS[currentQ].type === 'multi' && (
                  <>
                    <p className="text-xs text-slate-400 mb-3">可选择多项，没有也可以跳过</p>
                    <div className="space-y-2">
                      {QUIZ_QUESTIONS[currentQ].options.map(opt => {
                        const sel = (answers[QUIZ_QUESTIONS[currentQ].id] || []).includes(opt.label);
                        return (
                          <motion.button key={opt.label} type="button" whileTap={{ scale: 0.98 }}
                            onClick={() => handleMultiAnswer(QUIZ_QUESTIONS[currentQ].id, opt.label)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all ${
                              sel ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-primary/40'}`}>
                            <span className="text-lg flex-shrink-0">{opt.emoji}</span>
                            <span className="text-sm font-medium flex-1">{opt.label}</span>
                            <div className={`w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                              sel ? 'border-transparent' : 'border-slate-300'}`}
                              style={sel ? { background: '#637FF1' } : {}}>
                              {sel && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* 导航按钮 */}
                <div className="flex gap-3 mt-6">
                  <button type="button"
                    onClick={() => {
                      if (currentQ === 0) goToStep(0);
                      else { setDirection(-1); setCurrentQ(q => q - 1); }
                    }}
                    className="flex items-center gap-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition">
                    <ChevronLeft className="w-4 h-4" /> 上一步
                  </button>

                  <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} type="button"
                    disabled={QUIZ_QUESTIONS[currentQ].type === 'single' && !isAnswered(QUIZ_QUESTIONS[currentQ])}
                    onClick={() => {
                      if (currentQ < QUIZ_QUESTIONS.length - 1) {
                        setDirection(1);
                        setCurrentQ(q => q + 1);
                      } else {
                        goToStep(2);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition"
                    style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}>
                    {currentQ < QUIZ_QUESTIONS.length - 1 ? (
                      <>下一题 <ChevronRight className="w-4 h-4" /></>
                    ) : (
                      <>查看我的水平 ✨</>
                    )}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: 评测结果 ── */}
          {step === 2 && (
            <motion.div key="step2" custom={direction} variants={variants}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.3, ease: 'easeOut' }}>

              <div className="text-center mb-5">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                  className="text-6xl mb-3">{level.emoji}</motion.div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">你的口语水平评测结果</h1>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-brand border border-slate-100 dark:border-slate-700 space-y-5">

                {/* 等级卡 */}
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                  className="rounded-2xl p-5 text-center" style={{ backgroundColor: level.bgColor }}>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className="text-3xl font-extrabold" style={{ color: level.color }}>{level.cefr}</span>
                    <span className="text-lg font-bold text-slate-700">·</span>
                    <span className="text-xl font-bold text-slate-800">{level.label}</span>
                  </div>
                  <p className="text-xs font-medium uppercase tracking-wide mb-3" style={{ color: level.color }}>
                    {level.tag}
                  </p>

                  {/* 进度条 */}
                  <div className="w-full h-3 bg-white rounded-full overflow-hidden shadow-inner mb-1">
                    <motion.div className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${level.color}, ${level.color}aa)` }}
                      initial={{ width: 0 }} animate={{ width: `${proficiency}%` }}
                      transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }} />
                  </div>
                  <p className="text-xs text-slate-500">综合得分 {proficiency}/100</p>
                </motion.div>

                {/* 描述 */}
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                  className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed text-center">
                  {level.desc}
                </motion.p>

                {/* 各题得分概览 */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                  className="grid grid-cols-2 gap-2">
                  {QUIZ_QUESTIONS.map(q => {
                    const ans = answers[q.id];
                    const displayAns = q.type === 'single'
                      ? (ans || '未作答')
                      : ans?.length > 0 ? `${ans.length} 项已选` : '暂无';
                    return (
                      <div key={q.id} className="rounded-xl p-3 bg-slate-50 dark:bg-slate-700">
                        <p className="text-xs font-semibold text-slate-500 mb-1">{q.icon} {q.question.slice(0, 14)}…</p>
                        <p className="text-xs text-slate-700 dark:text-slate-200 font-medium leading-tight truncate">{displayAns}</p>
                      </div>
                    );
                  })}
                </motion.div>

                {/* 不准确提示 */}
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="text-xs text-slate-400 text-center">
                  结果不准确？你可以在之后的设置中随时调整起始水平。
                </motion.p>

                {/* 操作按钮 */}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => { setCurrentQ(0); goToStep(1); }}
                    className="flex items-center gap-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition">
                    <ChevronLeft className="w-4 h-4" /> 重新测评
                  </button>
                  <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} type="button"
                    disabled={saving}
                    onClick={handleSubmit}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm shadow-brand disabled:opacity-50 transition"
                    style={{ background: saving ? '#94A3B8' : 'linear-gradient(135deg, #637FF1, #a47af6)' }}>
                    {saving ? (
                      <><div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />保存中…</>
                    ) : (
                      <>开始我的学习旅程 🚀</>
                    )}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
