import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, aiAPI } from '../services/api';
import { motion, AnimatePresence } from 'motion/react';

const TOTAL_STEPS = 5;  // Welcome + Language + Quiz + Goal/Voice + Scenarios

// ── 语言选项 ──
const LANGUAGES = [
  { value: 'Chinese',      label: '中文（普通话）', flag: '🇨🇳' },
  { value: 'English',      label: '英语',           flag: '🇺🇸' },
  { value: 'Japanese',     label: '日语',           flag: '🇯🇵' },
  { value: 'Korean',       label: '韩语',           flag: '🇰🇷' },
  { value: 'French',       label: '法语',           flag: '🇫🇷' },
  { value: 'Spanish',      label: '西班牙语',       flag: '🇪🇸' },
  { value: 'German',       label: '德语',           flag: '🇩🇪' },
  { value: 'Portuguese',   label: '葡萄牙语',       flag: '🇧🇷' },
  { value: 'Russian',      label: '俄语',           flag: '🇷🇺' },
  { value: 'Italian',      label: '意大利语',       flag: '🇮🇹' },
  { value: 'Thai',         label: '泰语',           flag: '🇹🇭' },
  { value: 'Indonesian',   label: '印度尼西亚语',   flag: '🇮🇩' },
  { value: 'Arabic',       label: '阿拉伯语',       flag: '🇸🇦' },
  { value: 'Vietnamese',   label: '越南语',         flag: '🇻🇳' },
  { value: 'Turkish',      label: '土耳其语',       flag: '🇹🇷' },
  { value: 'Finnish',      label: '芬兰语',         flag: '🇫🇮' },
  { value: 'Polish',       label: '波兰语',         flag: '🇵🇱' },
  { value: 'Hindi',        label: '印地语',         flag: '🇮🇳' },
  { value: 'Dutch',        label: '荷兰语',         flag: '🇳🇱' },
  { value: 'Czech',        label: '捷克语',         flag: '🇨🇿' },
  { value: 'Urdu',         label: '乌尔都语',       flag: '🇵🇰' },
  { value: 'Filipino',     label: '他加禄语',       flag: '🇵🇭' },
  { value: 'Swedish',      label: '瑞典语',         flag: '🇸🇪' },
  { value: 'Danish',       label: '丹麦语',         flag: '🇩🇰' },
  { value: 'Hebrew',       label: '希伯来语',       flag: '🇮🇱' },
  { value: 'Icelandic',    label: '冰岛语',         flag: '🇮🇸' },
  { value: 'Malay',        label: '马来语',         flag: '🇲🇾' },
  { value: 'Norwegian',    label: '挪威语',         flag: '🇳🇴' },
  { value: 'Persian',      label: '波斯语',         flag: '🇮🇷' },
];

const LEVELS = [
  { value: 'Beginner',     label: '初级', desc: '掌握基础，建立开口信心', emoji: '🌱' },
  { value: 'Intermediate', label: '中级', desc: '流利对话，提升地道表达', emoji: '🗣️' },
  { value: 'Advanced',     label: '高级', desc: '精益求精，突破语言天花板', emoji: '🌟' },
];

// ── 口语水平调查问卷 ──
const QUIZ_QUESTIONS = [
  {
    id: 'q1', icon: '🌍',
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
    id: 'q2', icon: '⏰',
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
    id: 'q3', icon: '☕',
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
    id: 'q4', icon: '✅',
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

const LEVEL_MAP = [
  { min: 0,  max: 4,  cefr: 'A1', label: '入门级', tag: 'Beginner',          color: '#10B981', emoji: '🌱' },
  { min: 5,  max: 9,  cefr: 'A2', label: '基础级', tag: 'Elementary',        color: '#3B82F6', emoji: '📖' },
  { min: 10, max: 15, cefr: 'B1', label: '中级',   tag: 'Intermediate',      color: '#637FF1', emoji: '🗣️' },
  { min: 16, max: 21, cefr: 'B2', label: '中高级', tag: 'Upper-Intermediate', color: '#8B5CF6', emoji: '💼' },
  { min: 22, max: 24, cefr: 'C1', label: '高级',   tag: 'Advanced',          color: '#F59E0B', emoji: '🌟' },
  { min: 25, max: 99, cefr: 'C2', label: '近母语级', tag: 'Fluent',          color: '#EF4444', emoji: '🏆' },
];

function getLevel(score) {
  return LEVEL_MAP.find(l => score >= l.min && score <= l.max) || LEVEL_MAP[0];
}

function calcQuizScore(answers) {
  let total = 0;
  QUIZ_QUESTIONS.forEach(q => {
    const ans = answers[q.id];
    if (!ans) return;
    if (q.type === 'single') {
      const opt = q.options.find(o => o.label === ans);
      if (opt) total += opt.score;
    } else {
      total += (ans || []).length;
    }
  });
  return total;
}

function scoreToProficiency(score) {
  const max = 10 + 6 + 9 + 5; // 30
  return Math.round(Math.min(100, (score / max) * 100));
}

// ── 目标类型 ──
const GOAL_TYPES = [
  { value: 'daily_conversation', label: '日常对话', emoji: '💬' },
  { value: 'business_meeting',   label: '商务会议', emoji: '💼' },
  { value: 'travel_survival',    label: '旅行生存', emoji: '✈️' },
  { value: 'exam_prep',          label: '考试备考', emoji: '📝' },
  { value: 'presentation',       label: '演讲表达', emoji: '🎤' },
  { value: 'custom',             label: '自定义',   emoji: '✏️' },
];

const VOICE_OPTIONS = [
  { id: 'Tina',   name: 'Tina',   desc: '甜甜女声（默认）', emoji: '👩' },
  { id: 'Serena', name: 'Serena', desc: '温柔女声',         emoji: '👧' },
  { id: 'Evan',   name: 'Evan',   desc: '清亮男声',         emoji: '👨' },
  { id: 'Arda',   name: 'Arda',   desc: '阳光男声',         emoji: '🧑' },
];

const FEATURES = [
  { icon: '🎯', title: '个性化学习', desc: '根据你的水平定制内容' },
  { icon: '💬', title: '真实场景',   desc: '18+ 生活场景任你选' },
  { icon: '🎤', title: '实时反馈',   desc: '发音和表达即时点评' },
];

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

export default function GoalSetting() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, updateProfile } = useAuth();

  const navState = location.state || {};

  const [step, setStep] = useState(1);
  const [dir, setDir]   = useState(1);

  // Step 2: Language + Level
  const [targetLanguage, setTargetLanguage] = useState(user?.target_language || 'English');
  const [targetLevel, setTargetLevel]       = useState('Intermediate');

  // Step 3: Proficiency quiz
  const [quizAnswers, setQuizAnswers] = useState(navState.quizAnswers || {});
  const [currentQ, setCurrentQ]       = useState(0);

  // Step 4: Goal + Voice
  const [goalType, setGoalType]           = useState('daily_conversation');
  const [customGoalType, setCustomGoalType] = useState('');
  const [interests, setInterests]         = useState(user?.interests || '');
  const [selectedVoice, setSelectedVoice] = useState(() => {
    const stored = localStorage.getItem('ai_voice');
    return VOICE_OPTIONS.some(v => v.id === stored) ? stored : 'Tina';
  });

  // Step 5: Scenarios
  const [scenarios, setScenarios]       = useState([]);
  const [editingScenario, setEditingScenario] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');

  const nativeLanguage = user?.native_language || 'Chinese';
  const quizScore      = calcQuizScore(quizAnswers);
  const proficiency    = scoreToProficiency(quizScore);
  const detectedLevel  = getLevel(quizScore);

  const goTo = (next) => { setDir(next > step ? 1 : -1); setError(''); setStep(next); };

  const handleSingleAnswer = (qId, label) => setQuizAnswers(p => ({ ...p, [qId]: label }));
  const handleMultiAnswer  = (qId, label) => setQuizAnswers(p => {
    const cur = p[qId] || [];
    return { ...p, [qId]: cur.includes(label) ? cur.filter(l => l !== label) : [...cur, label] };
  });
  const isQuizAnswered = (q) => q.type === 'single' ? !!quizAnswers[q.id] : (quizAnswers[q.id] || []).length > 0;

  const handleGenerateScenarios = async () => {
    if (goalType === 'custom' && !customGoalType.trim()) {
      setError('请填写自定义练习方向');
      return;
    }
    setIsGenerating(true);
    setError('');
    try {
      await updateProfile({ target_language: targetLanguage, interests, points: proficiency });
    } catch {}
    try {
      const result = await aiAPI.generateScenarios({
        type: goalType === 'custom' ? customGoalType.trim() : goalType,
        target_language: targetLanguage,
        target_level: targetLevel,
        interests,
        native_language: nativeLanguage,
      });
      if (result.scenarios?.length > 0) {
        setScenarios(result.scenarios.map((s, i) => ({ ...s, id: i })));
        localStorage.setItem('ai_voice', selectedVoice);
        goTo(5);
      } else {
        setError('AI 未返回有效场景，请重试。');
      }
    } catch {
      setError('场景生成失败，请检查网络后重试。');
    }
    setIsGenerating(false);
  };

  const handleSubmit = async () => {
    if (scenarios.length === 0) { setError('请保留至少一个场景。'); return; }
    setError(''); setSuccess('');
    try {
      const finalGoalType = goalType === 'custom' ? customGoalType.trim() : goalType;
      await userAPI.createGoal({
        type: finalGoalType,
        description: goalType === 'custom'
          ? `${targetLanguage} ${customGoalType.trim()} 练习`
          : `${targetLanguage} ${goalType.replace(/_/g, ' ')} 练习`,
        target_language: targetLanguage,
        target_level: targetLevel,
        current_proficiency: proficiency,
        completion_time_days: 30,
        interests,
        scenarios: scenarios.map(s => ({ title: s.title, tasks: s.tasks })),
      });
      setSuccess('目标设置成功！');
      setTimeout(() => navigate('/discovery'), 1200);
    } catch (err) {
      setError(err.message || '设置目标失败，请重试。');
    }
  };

  const handleRemoveScenario = (id) => setScenarios(scenarios.filter(s => s.id !== id));
  const handleSaveEdit = () => {
    if (!editingScenario?.title?.trim()) { setError('标题不能为空'); return; }
    setScenarios(scenarios.map(s => s.id === editingScenario.id ? editingScenario : s));
    setEditingScenario(null); setError('');
  };

  // ── Next handler ──
  const handleNext = () => {
    if (step === 3) {
      // Quiz: advance question or complete
      const q = QUIZ_QUESTIONS[currentQ];
      if (!isQuizAnswered(q)) return; // must answer
      if (currentQ < QUIZ_QUESTIONS.length - 1) {
        setCurrentQ(c => c + 1);
        return;
      }
      // Last question done → go to step 4
      goTo(4);
      setCurrentQ(0);
      return;
    }
    if (step === 4) { handleGenerateScenarios(); return; }
    if (step === 5) { handleSubmit(); return; }
    goTo(step + 1);
  };

  // ── Back handler ──
  const handleBack = () => {
    if (step === 1)  { navigate(-1); return; }
    if (step === 3 && currentQ > 0) { setCurrentQ(c => c - 1); return; }
    goTo(step - 1);
  };

  const nextLabel = step === 1 ? '开始设置'
    : step === 3 && currentQ < QUIZ_QUESTIONS.length - 1 ? '下一题'
    : step === 3 ? '查看结果'
    : step === 4 ? (isGenerating ? '生成中...' : '生成场景')
    : step === 5 ? '确认开始'
    : '下一步';

  const canNext = step === 2 ? !!targetLanguage
    : step === 3 ? isQuizAnswered(QUIZ_QUESTIONS[currentQ])
    : true;

  // Display step number (skip welcome from count)
  const displayStep = step - 1;
  const displayTotal = TOTAL_STEPS - 1;

  return (
    <div className="flex flex-col min-h-screen bg-[#F5F5F7]">

      {/* ── Top Bar ── */}
      <div className="px-5 pt-5 pb-0 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🦜</span>
          <span className="font-bold text-slate-900 text-base">Oral AI</span>
        </div>
        {step > 1 && (
          <span className="text-sm text-slate-400">步骤 {displayStep} / {displayTotal}</span>
        )}
      </div>

      {/* ── Progress Bar ── */}
      <div className="h-1 mt-3 bg-slate-200 overflow-hidden shrink-0">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${(displayStep / displayTotal) * 100}%`,
            background: 'linear-gradient(90deg, #637FF1, #a47af6)',
          }}
        />
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col px-4 pt-5 pb-32 overflow-y-auto">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step === 3 ? `3-${currentQ}` : step}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >

            {/* ─── STEP 1: Welcome ─── */}
            {step === 1 && (
              <div className="bg-white rounded-3xl shadow-sm p-6 flex flex-col items-center gap-5">
                <span className="text-7xl mt-2">🦜</span>
                <div className="text-center">
                  <h1 className="text-3xl font-bold text-slate-900 mb-2">欢迎来到 Oral AI</h1>
                  <p className="text-slate-500 text-sm mb-1">你的私人 AI 口语练习伙伴</p>
                  <p className="text-slate-500 text-sm">随时随地，自信开口说外语</p>
                </div>
                <div className="grid grid-cols-3 gap-3 w-full mt-2">
                  {FEATURES.map(f => (
                    <div key={f.title}
                      className="flex flex-col items-center gap-2 rounded-2xl p-3 text-center"
                      style={{ background: 'rgba(99,127,241,0.07)' }}>
                      <span className="text-2xl">{f.icon}</span>
                      <span className="text-xs font-bold text-slate-800">{f.title}</span>
                      <span className="text-[10px] text-slate-500 leading-tight">{f.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── STEP 2: Language + Target Level ─── */}
            {step === 2 && (
              <div className="bg-white rounded-3xl shadow-sm p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 mb-1">选择学习语言</h2>
                  <p className="text-xs text-slate-400 mb-4">选择你想练习的外语</p>
                  <div className="grid grid-cols-3 gap-2" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                    {LANGUAGES.map(l => (
                      <button key={l.value} onClick={() => setTargetLanguage(l.value)}
                        className="flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all"
                        style={{
                          borderColor: targetLanguage === l.value ? '#637FF1' : '#E5E7EB',
                          background:  targetLanguage === l.value ? 'rgba(99,127,241,0.07)' : '#fff',
                        }}>
                        <span className="text-2xl">{l.flag}</span>
                        <span className="text-xs font-medium text-slate-700">{l.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 mb-3">目标等级</h2>
                  <div className="space-y-2">
                    {LEVELS.map(lv => (
                      <button key={lv.value} onClick={() => setTargetLevel(lv.value)}
                        className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left"
                        style={{
                          borderColor: targetLevel === lv.value ? '#637FF1' : '#E5E7EB',
                          background:  targetLevel === lv.value ? 'rgba(99,127,241,0.07)' : '#fff',
                        }}>
                        <span className="text-xl">{lv.emoji}</span>
                        <div className="flex-1">
                          <p className="font-bold text-sm text-slate-900">{lv.label}</p>
                          <p className="text-xs text-slate-400">{lv.desc}</p>
                        </div>
                        {targetLevel === lv.value && <span className="text-primary font-bold">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ─── STEP 3: Proficiency Quiz ─── */}
            {step === 3 && (
              <div className="bg-white rounded-3xl shadow-sm p-6">
                {/* Question header */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{QUIZ_QUESTIONS[currentQ].icon}</span>
                  <span className="text-xs text-slate-400">问题 {currentQ + 1} / {QUIZ_QUESTIONS.length}</span>
                </div>
                {/* Question dots */}
                <div className="flex gap-1.5 mb-4">
                  {QUIZ_QUESTIONS.map((_, i) => (
                    <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{ background: i <= currentQ ? '#637FF1' : '#E5E7EB' }} />
                  ))}
                </div>
                <h2 className="text-base font-bold text-slate-900 mb-5 leading-snug">
                  {QUIZ_QUESTIONS[currentQ].question}
                </h2>
                <div className="space-y-2">
                  {QUIZ_QUESTIONS[currentQ].type === 'single'
                    ? QUIZ_QUESTIONS[currentQ].options.map(opt => {
                        const selected = quizAnswers[QUIZ_QUESTIONS[currentQ].id] === opt.label;
                        return (
                          <button key={opt.label}
                            onClick={() => handleSingleAnswer(QUIZ_QUESTIONS[currentQ].id, opt.label)}
                            className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left"
                            style={{
                              borderColor: selected ? '#637FF1' : '#E5E7EB',
                              background:  selected ? 'rgba(99,127,241,0.07)' : '#fff',
                            }}>
                            <span className="text-xl shrink-0">{opt.emoji}</span>
                            <span className="text-sm text-slate-800 flex-1">{opt.label}</span>
                            {selected && <span className="text-primary font-bold shrink-0">✓</span>}
                          </button>
                        );
                      })
                    : QUIZ_QUESTIONS[currentQ].options.map(opt => {
                        const arr = quizAnswers[QUIZ_QUESTIONS[currentQ].id] || [];
                        const selected = arr.includes(opt.label);
                        return (
                          <button key={opt.label}
                            onClick={() => handleMultiAnswer(QUIZ_QUESTIONS[currentQ].id, opt.label)}
                            className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left"
                            style={{
                              borderColor: selected ? '#637FF1' : '#E5E7EB',
                              background:  selected ? 'rgba(99,127,241,0.07)' : '#fff',
                            }}>
                            <span className="text-xl shrink-0">{opt.emoji}</span>
                            <span className="text-sm text-slate-800 flex-1">{opt.label}</span>
                            {selected && <span className="text-primary font-bold shrink-0">✓</span>}
                          </button>
                        );
                      })
                  }
                </div>
              </div>
            )}

            {/* ─── STEP 4: Goal + Voice ─── */}
            {step === 4 && (
              <div className="bg-white rounded-3xl shadow-sm p-6 space-y-5">
                {/* Quiz result summary */}
                <div className="rounded-2xl p-3 flex items-center gap-3"
                  style={{ background: `${detectedLevel.color}15`, border: `1.5px solid ${detectedLevel.color}40` }}>
                  <span className="text-2xl">{detectedLevel.emoji}</span>
                  <div>
                    <p className="text-xs font-bold" style={{ color: detectedLevel.color }}>
                      测评结果：{detectedLevel.cefr} · {detectedLevel.label}
                    </p>
                    <p className="text-xs text-slate-500">当前口语水平 {proficiency}分 · 场景将匹配你的水平</p>
                  </div>
                </div>

                <div>
                  <h2 className="text-sm font-bold text-slate-900 mb-3">练习方向</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {GOAL_TYPES.map(g => (
                      <button key={g.value} onClick={() => setGoalType(g.value)}
                        className="flex items-center gap-2 p-3 rounded-2xl border-2 transition-all"
                        style={{
                          borderColor: goalType === g.value ? '#637FF1' : '#E5E7EB',
                          background:  goalType === g.value ? 'rgba(99,127,241,0.07)' : '#fff',
                        }}>
                        <span className="text-xl">{g.emoji}</span>
                        <span className="text-sm font-medium text-slate-800">{g.label}</span>
                      </button>
                    ))}
                  </div>
                  {goalType === 'custom' && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500">请输入你的练习方向</span>
                        <span className={`text-xs ${customGoalType.length > 40 ? 'text-red-400' : 'text-slate-400'}`}>
                          {customGoalType.length}/50
                        </span>
                      </div>
                      <input
                        type="text"
                        value={customGoalType}
                        onChange={e => setCustomGoalType(e.target.value)}
                        maxLength={50}
                        placeholder="例如：商务谈判、旅游导览、学术演讲…"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        autoFocus
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-900 mb-2">
                    兴趣 / 学习重点 <span className="text-slate-400 font-normal text-xs">（选填）</span>
                    <span className={`ml-1 text-xs float-right ${interests.length > 80 ? 'text-red-400' : 'text-slate-400'}`}>
                      {interests.length}/100
                    </span>
                  </label>
                  <textarea
                    value={interests}
                    onChange={e => setInterests(e.target.value)}
                    maxLength={100}
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                    placeholder="例如：出行旅游、职场表达、备考雅思…"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-900 mb-2">AI 导师音色</label>
                  <div className="grid grid-cols-2 gap-2">
                    {VOICE_OPTIONS.map(v => (
                      <button key={v.id} onClick={() => setSelectedVoice(v.id)}
                        className="flex items-center gap-2 p-3 rounded-2xl border-2 transition-all"
                        style={{
                          borderColor: selectedVoice === v.id ? '#637FF1' : '#E5E7EB',
                          background:  selectedVoice === v.id ? 'rgba(99,127,241,0.07)' : '#fff',
                        }}>
                        <span className="text-xl">{v.emoji}</span>
                        <div className="text-left">
                          <p className="font-bold text-sm text-slate-900">{v.name}</p>
                          <p className="text-xs text-slate-400">{v.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              </div>
            )}

            {/* ─── STEP 5: Scenarios Review ─── */}
            {step === 5 && (
              <div className="bg-white rounded-3xl shadow-sm p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">练习场景</h2>
                  <p className="text-xs text-slate-400 mt-0.5">AI 已为你生成 {scenarios.length} 个专属场景，可自由编辑</p>
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                {success && <p className="text-green-600 text-sm font-medium">{success}</p>}

                {editingScenario ? (
                  <div className="space-y-3">
                    <input value={editingScenario.title}
                      onChange={e => setEditingScenario({ ...editingScenario, title: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-primary outline-none"
                      placeholder="场景标题" />
                    {editingScenario.tasks.map((task, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-slate-400 text-sm w-5 pt-2.5">{i+1}.</span>
                        <input
                          value={typeof task === 'object' ? (task.text || '') : task}
                          onChange={e => {
                            const t = [...editingScenario.tasks];
                            t[i] = e.target.value;
                            setEditingScenario({ ...editingScenario, tasks: t });
                          }}
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:border-primary outline-none"
                          placeholder={`任务 ${i+1}`} />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setEditingScenario(null); setError(''); }}
                        className="flex-1 py-2 rounded-xl border border-slate-200 text-sm text-slate-500">取消</button>
                      <button onClick={handleSaveEdit}
                        className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                        style={{ background: '#637FF1' }}>保存</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {scenarios.map(s => (
                      <div key={s.id} className="rounded-2xl p-4"
                        style={{ background: 'rgba(99,127,241,0.05)', border: '1px solid rgba(99,127,241,0.15)' }}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-bold text-sm text-slate-900">{s.title}</h3>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => setEditingScenario({ ...s, tasks: [...s.tasks] })}
                              className="text-xs text-slate-400 hover:text-primary">编辑</button>
                            <button onClick={() => handleRemoveScenario(s.id)}
                              className="text-xs text-slate-400 hover:text-red-400">删除</button>
                          </div>
                        </div>
                        <ul className="space-y-0.5">
                          {s.tasks.map((t, i) => (
                            <li key={i} className="text-xs text-slate-500 flex gap-1.5">
                              <span className="text-primary">{i+1}.</span>
                              {typeof t === 'object' ? (t.text || t.description || '') : t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Fixed Bottom Buttons ── */}
      <div className="fixed bottom-0 left-0 right-0 flex items-center gap-3 px-4 pb-8 pt-4 bg-[#F5F5F7]">
        <button onClick={handleBack}
          className="flex items-center gap-1 px-5 py-3.5 rounded-2xl border border-slate-200 bg-white text-slate-600 text-sm font-medium shadow-sm shrink-0">
          ‹ 上一步
        </button>
        <button onClick={handleNext} disabled={!canNext || isGenerating}
          className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-2xl text-white font-bold text-sm shadow-md disabled:opacity-50 transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}>
          {nextLabel} {(!isGenerating && step < 5 && (currentQ < QUIZ_QUESTIONS.length - 1) !== (step === 3)) && '›'}
        </button>
      </div>

    </div>
  );
}
