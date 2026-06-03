import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { userAPI, aiAPI } from '../services/api';
import { GuajiMascot } from '../components/GuajiMascot';

// Per-sentence flow on /recall:
//   1. READ aloud while cue is visible        → produces a "read" score
//   2. RECITE from memory while cue is hidden → produces a "recite" score
//   3. Both scores ≥ threshold → 下一句 unlocks
//
// The two steps are surfaced as TWO independent buttons, each owning its own
// recording session and score. There is no shared phase state machine — that
// design was fragile against StrictMode replays and against Web Speech firing
// multiple `onresult` events per held press. Two buttons = two recordings =
// two scores that must both pass. No way for one recording to satisfy both.

const SIMILARITY_THRESHOLD = 0.6;

const LANG_TABLE = {
  english:    { bcp47: 'en-US', code: 'en' },
  chinese:    { bcp47: 'zh-CN', code: 'zh' },
  japanese:   { bcp47: 'ja-JP', code: 'ja' },
  korean:     { bcp47: 'ko-KR', code: 'ko' },
  french:     { bcp47: 'fr-FR', code: 'fr' },
  spanish:    { bcp47: 'es-ES', code: 'es' },
  german:     { bcp47: 'de-DE', code: 'de' },
  portuguese: { bcp47: 'pt-PT', code: 'pt' },
  russian:    { bcp47: 'ru-RU', code: 'ru' },
  italian:    { bcp47: 'it-IT', code: 'it' },
  arabic:     { bcp47: 'ar-SA', code: 'ar' },
};

function resolveLang(raw) {
  if (!raw) return { bcp47: 'en-US', code: 'en' };
  const k = String(raw).trim().toLowerCase();
  return LANG_TABLE[k] || { bcp47: 'en-US', code: 'en' };
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  a = normalize(a);
  b = normalize(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length, n = b.length;
  const dp = Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}

function extractSentences(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks
    .map(t => (typeof t === 'string' ? t : (t?.text || t?.description || t?.title || '')))
    .map(s => s.trim())
    .filter(Boolean);
}

function pickRecallScenario(scenarios, skipIndex) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) return null;
  const startIdx = typeof skipIndex === 'number' ? skipIndex : 0;
  // Search from startIdx forward, wrapping around
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[(startIdx + i) % scenarios.length];
    const taskList = Array.isArray(s.tasks) ? s.tasks : [];
    if (taskList.length > 0) return s;
  }
  return scenarios[0];
}

// Per-sentence record: which steps passed, last score, last transcript, peek count.
// Indexed by sentence idx. Default-shaped when missing.
const emptyRow = () => ({ read: null, recite: null, lastText: '', peek: 0 });

function Recall() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [scenario, setScenario] = useState(null);
  const [sentences, setSentences] = useState([]);
  const [targetLang, setTargetLang] = useState({ bcp47: 'en-US', code: 'en' });
  const [idx, setIdx] = useState(0);
  const [rows, setRows] = useState({}); // { [idx]: { read, recite, lastText, peek } }
  const [recordingFor, setRecordingFor] = useState(null); // 'read' | 'recite' | null
  const [isPeeking, setIsPeeking] = useState(false);
  const [recognitionUnavailable, setRecognitionUnavailable] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [allScenarios, setAllScenarios] = useState([]);
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [switchCount, setSwitchCount] = useState(0);
  const FREE_SWITCH_LIMIT = 3;

  // Ref mirrors of the values onresult needs. Reading from refs sidesteps
  // stale closures *and* the fact that Web Speech callbacks fire outside
  // React's render cycle.
  const idxRef = useRef(0);
  const sentencesRef = useRef([]);
  // `activeStepRef` is set synchronously in startRecord and cleared ONLY when
  // the recognition session truly ends (onend). It must NOT be cleared on the
  // user releasing the button — Web Speech delivers `onresult` between the
  // user releasing and the engine calling `onend`, so a UI-driven clear would
  // race ahead of onresult and the score wouldn't be written.
  const activeStepRef = useRef(null);
  useEffect(() => { idxRef.current = idx; }, [idx]);
  useEffect(() => { sentencesRef.current = sentences; }, [sentences]);

  const recognitionRef = useRef(null);

  // Load scenario sentences and translate
  const loadScenario = React.useCallback(async (startIdx = 0, goalData = null) => {
    setLoading(true);
    try {
      const res = goalData || await userAPI.getActiveGoal();
      const goal = res?.goal || res;
      const scenarios = goal?.scenarios || [];
      setAllScenarios(scenarios);

      const picked = pickRecallScenario(scenarios, startIdx);
      const pickedIdx = scenarios.indexOf(picked);
      setScenarioIdx(pickedIdx >= 0 ? pickedIdx : 0);
      setScenario(picked);

      const lang = resolveLang(goal?.target_language);
      setTargetLang(lang);

      const raw = extractSentences(picked?.tasks || []);
      const titleSlug = (picked?.title || '').replace(/[^a-zA-Z0-9一-鿿-]/g, '_').slice(0, 40);
      const cacheKey = `recall_translated_${goal?.id || 'x'}_${titleSlug}_${lang.code}`;
      let translated = null;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length === raw.length) translated = parsed;
        }
      } catch {}

      if (!translated) {
        translated = await Promise.all(raw.map(async (s) => {
          try {
            const r = await aiAPI.translate(s, lang.code);
            return (r?.translation || s).trim();
          } catch {
            return s;
          }
        }));
        try { localStorage.setItem(cacheKey, JSON.stringify(translated)); } catch {}
      }

      setSentences(translated);
      setIdx(0);
      setRows({});
      setIsPeeking(false);
      setRecordingFor(null);
    } catch (e) {
      console.error('[Recall] failed to load:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load — fetch backend-authoritative daily state (switch count +
  // completion). localStorage stays as an OFFLINE FALLBACK only: if the backend
  // call fails (offline / network error) we read the legacy keys so the page
  // still works. `ignore` guards setState if the component unmounts mid-fetch.
  useEffect(() => {
    let ignore = false;
    const today = new Date().toISOString().slice(0, 10);
    (async () => {
      let done = false;
      try {
        const res = await userAPI.getRecallDailyState();
        const data = res?.data || res || {};
        if (ignore) return;
        done = !!data.completed;
        setSwitchCount(Number(data.switch_count) || 0);
        setAlreadyCompleted(done);
      } catch (e) {
        // Offline fallback: read legacy localStorage keys.
        console.warn('[Recall] getRecallDailyState failed, fallback to localStorage:', e);
        if (ignore) return;
        done = localStorage.getItem(`recall_completed_${today}`) === 'true';
        const todaySwitches = parseInt(localStorage.getItem(`recall_switches_${today}`) || '0', 10);
        setSwitchCount(todaySwitches);
        setAlreadyCompleted(done);
      }
      if (ignore) return;
      loadScenario(done ? 1 : 0); // if done, try next scenario
    })();
    return () => { ignore = true; };
  }, [loadScenario]);

  const handleSwitchScenario = async () => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const res = await userAPI.incrementRecallSwitch();
      const data = res?.data || res || {};
      const serverCount = Number(data.switch_count);
      if (Number.isFinite(serverCount)) {
        setSwitchCount(serverCount);
      } else {
        // Unexpected shape — fall back to optimistic local increment.
        const newCount = switchCount + 1;
        setSwitchCount(newCount);
        localStorage.setItem(`recall_switches_${today}`, String(newCount));
      }
    } catch (e) {
      // Offline fallback: optimistic local increment.
      console.warn('[Recall] incrementRecallSwitch failed, fallback to localStorage:', e);
      const newCount = switchCount + 1;
      setSwitchCount(newCount);
      localStorage.setItem(`recall_switches_${today}`, String(newCount));
    }
    setAlreadyCompleted(false);
    loadScenario((scenarioIdx + 1) % Math.max(allScenarios.length, 1));
  };

  const currentSentence = sentences[idx] || '';
  const totalSentences = sentences.length;
  const isLast = idx >= totalSentences - 1;
  const row = rows[idx] || emptyRow();
  const readPassed = (row.read ?? 0) >= SIMILARITY_THRESHOLD;
  const recitePassed = (row.recite ?? 0) >= SIMILARITY_THRESHOLD;
  const canAdvance = readPassed && recitePassed;

  // Web Speech is created lazily per (lang) and reused. Single recognizer for
  // both steps — we tell them apart by `recordingForRef.current`.
  const ensureRecognition = useCallback(() => {
    if (recognitionRef.current && recognitionRef.current.lang === targetLang.bcp47) {
      return recognitionRef.current;
    }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setRecognitionUnavailable(true);
      return null;
    }
    const r = new Ctor();
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.lang = targetLang.bcp47;

    r.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(res => res[0]?.transcript || '')
        .join(' ')
        .trim();
      const step = activeStepRef.current;
      const i = idxRef.current;
      const target = sentencesRef.current[i] || '';
      const ratio = similarity(transcript, target);

      setRows(prev => {
        const cur = prev[i] || emptyRow();
        if (step !== 'read' && step !== 'recite') {
          return { ...prev, [i]: { ...cur, lastText: transcript } };
        }
        return { ...prev, [i]: { ...cur, [step]: ratio, lastText: transcript } };
      });
    };
    r.onerror = (e) => {
      console.warn('[Recall] speech recognition error:', e.error);
      activeStepRef.current = null;
      setRecordingFor(null);
    };
    r.onend = () => {
      activeStepRef.current = null;
      setRecordingFor(null);
    };

    recognitionRef.current = r;
    return r;
  }, [targetLang]);

  const startRecord = (step /* 'read' | 'recite' */) => {
    const r = ensureRecognition();
    if (!r) return;
    // Set the ref BEFORE calling start() so onresult always sees the right
    // step, even if the engine fires onresult before React commits state.
    activeStepRef.current = step;
    setRecordingFor(step);
    try {
      r.start();
    } catch (e) {
      console.warn('[Recall] start() failed, will reset:', e);
      activeStepRef.current = null;
      setRecordingFor(null);
    }
  };

  const stopRecord = () => {
    const r = recognitionRef.current;
    if (r) {
      try { r.stop(); } catch {}
    }
    // Do NOT clear activeStepRef here — onresult races against this. The ref
    // is cleared in onend (after onresult has run). Only flip the UI flag so
    // the button visual updates immediately.
    setRecordingFor(null);
  };

  const goPrev = () => {
    if (idx <= 0) return;
    setIdx(idx - 1);
    setIsPeeking(false);
    setRecordingFor(null);
  };

  const goNext = () => {
    if (!canAdvance) return;
    if (isLast) {
      setAlreadyCompleted(true);
      // Persist completion to backend; localStorage stays as offline fallback.
      (async () => {
        try {
          await userAPI.markRecallComplete();
        } catch (e) {
          console.warn('[Recall] markRecallComplete failed, fallback to localStorage:', e);
          const today = new Date().toISOString().slice(0, 10);
          try { localStorage.setItem(`recall_completed_${today}`, 'true'); } catch {}
        }
      })();
      return;
    }
    setIdx(idx + 1);
    setIsPeeking(false);
    setRecordingFor(null);
  };

  // Peek during recitation only. Increments a per-sentence counter, but does
  // NOT alter scores — it's a read-only override of the masking layer.
  const startPeek = () => {
    if (!readPassed) return;
    if (isPeeking) return;
    setRows(rs => {
      const cur = rs[idx] || emptyRow();
      return { ...rs, [idx]: { ...cur, peek: cur.peek + 1 } };
    });
    setIsPeeking(true);
  };
  const endPeek = () => setIsPeeking(false);

  // Manual fallback when Web Speech is unavailable. Still requires two
  // independent "manual pass" presses — one per step — so the user cannot
  // collapse the flow into a single click.
  const manualPass = (step) => {
    setRows(prev => {
      const cur = prev[idx] || emptyRow();
      return { ...prev, [idx]: { ...cur, [step]: 1 } };
    });
  };

  useEffect(() => () => {
    const r = recognitionRef.current;
    if (r) { try { r.abort(); } catch {} }
  }, []);

  const progressLabel = useMemo(() => {
    if (totalSentences === 0) return '';
    return `${Math.min(idx + 1, totalSentences)} / ${totalSentences}`;
  }, [idx, totalSentences]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background-light">
        <GuajiMascot state="idle" size={140} />
        <p className="mt-4 text-sm text-slate-500">加载今日复述...</p>
      </div>
    );
  }

  if (alreadyCompleted) {
    const canSwitch = switchCount < FREE_SWITCH_LIMIT;
    return (
      <div className="flex flex-col items-center justify-center h-screen px-6 text-center bg-background-light">
        <div style={{ fontSize: 56 }}>🎉</div>
        <h2 className="mt-3 text-lg font-semibold text-slate-800">今日复述已完成！</h2>
        <p className="mt-2 text-sm text-slate-500">
          {scenario?.title ? `「${scenario.title}」` : '本组'}台词已全部通过。
        </p>
        {canSwitch ? (
          <button
            onClick={handleSwitchScenario}
            className="mt-5 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
          >
            切换下一组句子练习（剩余 {FREE_SWITCH_LIMIT - switchCount} 次）
          </button>
        ) : (
          <p className="mt-4 text-xs text-slate-400">今日免费切换次数已用完（{FREE_SWITCH_LIMIT}/{FREE_SWITCH_LIMIT}）</p>
        )}
        <button onClick={() => navigate('/discovery')} className="mt-3 px-5 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">
          返回首页
        </button>
      </div>
    );
  }

  if (totalSentences === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen px-6 text-center bg-background-light">
        <div style={{ fontSize: 56 }}>🌿</div>
        <h2 className="mt-3 text-lg font-semibold text-slate-800">今日没有可复述的句子</h2>
        <p className="mt-2 text-sm text-slate-500">先去练习几个场景任务，再回来复述效果更好。</p>
        <button onClick={() => navigate('/discovery')} className="mt-6 px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold">
          返回 Discovery
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-background-light relative">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
        <button
          onClick={() => navigate('/discovery')}
          aria-label="退出"
          className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
        >
          <span className="text-lg text-slate-600">×</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-slate-800 truncate">今日复述 · {scenario?.title || ''}</h1>
        </div>
        <span className="text-xs font-semibold text-slate-500 tabular-nums">{progressLabel}</span>
      </header>

      <section className="flex-1 px-5 pt-6 pb-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="bg-white rounded-3xl shadow-md border border-slate-100 p-5 space-y-5"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ background: '#637FF115', color: '#637FF1' }}>
                <span>📝</span>台词卡
              </span>
            </div>

            {/* Step 1: READ aloud (cue visible). Once passed, collapse to a
                tiny summary so the original sentence isn't sitting above the
                masked Step 2 acting as a free peek for the user. */}
            <StepBlock
              stepNumber={1}
              title="跟读练习"
              hint="看着台词大声念一遍，识别通过后进入背诵阶段。"
              passed={readPassed}
              collapsed={readPassed}
              score={row.read}
              isRecording={recordingFor === 'read'}
              onStart={() => startRecord('read')}
              onStop={stopRecord}
              recognitionUnavailable={recognitionUnavailable}
              onManualPass={() => manualPass('read')}
            >
              <p className="text-[17px] leading-relaxed text-slate-800 font-medium">
                {currentSentence}
              </p>
            </StepBlock>

            {/* Step 2: RECITE from memory (cue hidden unless peeking) */}
            <StepBlock
              stepNumber={2}
              title="背诵练习"
              hint={readPassed
                ? '台词已遮挡，凭记忆完整背诵。需要时按住 👀 偷看。'
                : '请先完成跟读练习。'}
              passed={recitePassed}
              score={row.recite}
              isRecording={recordingFor === 'recite'}
              disabled={!readPassed}
              onStart={() => startRecord('recite')}
              onStop={stopRecord}
              recognitionUnavailable={recognitionUnavailable}
              onManualPass={() => manualPass('recite')}
              peekControls={readPassed && !recitePassed && (
                <PeekButton
                  isPeeking={isPeeking}
                  count={row.peek}
                  onStart={startPeek}
                  onEnd={endPeek}
                />
              )}
            >
              {isPeeking && readPassed ? (
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold mb-2" style={{ color: '#6366F1' }}>
                    <span>👀</span><span>偷看模式</span>
                  </div>
                  <p className="text-[17px] leading-relaxed text-slate-800 font-medium">
                    {currentSentence}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">松开按钮恢复遮挡。</p>
                </div>
              ) : (
                <div>
                  <div className="space-y-3 py-3">
                    <div className="h-3 rounded-full bg-slate-200 w-full animate-pulse" />
                    <div className="h-3 rounded-full bg-slate-200 w-5/6 animate-pulse" />
                    <div className="h-3 rounded-full bg-slate-200 w-3/4 animate-pulse" />
                  </div>
                </div>
              )}
            </StepBlock>

            {/* Recognized transcript is shown ONLY while Step 2 (recite) hasn't
                started yet. Once the user is in the memorization phase, any
                lingering transcript from Step 1 acts as an extra hint and
                must be hidden. After both steps pass it's safe to show again. */}
            {row.lastText && (!readPassed || recitePassed) && (
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-600">识别到：</span> {row.lastText}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={idx === 0}
            className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm border border-slate-200 bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← 上一句
          </button>
          <button
            onClick={goNext}
            disabled={!canAdvance}
            className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: canAdvance ? 'linear-gradient(135deg, #637FF1, #a47af6)' : '#94A3B8' }}
            title={canAdvance ? '' : '需先完成跟读和背诵两步'}
          >
            {isLast ? '完成' : '下一句 →'}
          </button>
        </div>
      </section>
    </div>
  );
}

function StepBlock({
  stepNumber, title, hint, passed, collapsed, score, isRecording, disabled,
  onStart, onStop, recognitionUnavailable, onManualPass, peekControls, children,
}) {
  const pct = score == null ? null : Math.round(score * 100);

  // Collapsed mode: when a step has been passed AND we want to hide the
  // sentence body (e.g. Step 1 once Step 2 starts), render only the header.
  // This prevents the unmasked cue card from sitting above the masked one.
  if (collapsed && passed) {
    return (
      <div
        className="rounded-2xl border p-3 transition"
        style={{ background: '#F0FDF4', borderColor: '#10B981' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: '#10B981' }}
            >
              ✓
            </span>
            <span className="text-sm font-semibold text-slate-700">{title} · 已完成</span>
          </div>
          {pct != null && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: '#D1FAE5', color: '#065F46' }}>
              识别 {pct}%
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border p-4 transition"
      style={{
        background: disabled ? '#F8FAFC' : '#fff',
        borderColor: passed ? '#10B981' : '#E2E8F0',
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: passed ? '#10B981' : '#94A3B8' }}
          >
            {passed ? '✓' : stepNumber}
          </span>
          <span className="text-sm font-semibold text-slate-800">{title}</span>
        </div>
        {pct != null && (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: passed ? '#D1FAE5' : '#FEF3C7',
              color: passed ? '#065F46' : '#92400E',
            }}
          >
            识别 {pct}%
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-3">{hint}</p>
      <div className="min-h-[70px]">{children}</div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onMouseDown={() => !disabled && onStart()}
          onMouseUp={onStop}
          onMouseLeave={isRecording ? onStop : undefined}
          onTouchStart={() => !disabled && onStart()}
          onTouchEnd={onStop}
          onTouchCancel={onStop}
          disabled={disabled}
          className="px-4 py-2 rounded-full text-sm font-semibold text-white shadow active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed select-none"
          style={{
            background: isRecording
              ? 'linear-gradient(135deg, #EF4444, #DC2626)'
              : 'linear-gradient(135deg, #637FF1, #a47af6)',
          }}
        >
          🎙️ {isRecording ? '正在听...' : '按住说话'}
        </button>
        {peekControls}
        {recognitionUnavailable && !passed && !disabled && (
          <button
            onClick={onManualPass}
            className="text-xs text-slate-500 underline underline-offset-2"
          >
            手动标记通过
          </button>
        )}
      </div>
    </div>
  );
}

function PeekButton({ isPeeking, count, onStart, onEnd }) {
  // Press-and-hold reliably: use Pointer Events with `setPointerCapture`, so
  // the pointer stream stays bound to this element even when the user's
  // finger/mouse drifts off the button (e.g. when `active:scale-95` shrinks
  // it under the cursor and triggers a spurious pointerleave). Also listen
  // on `window` as a backstop in case pointerup is delivered outside the
  // element — this is the source of the "flash and disappear" bug.
  React.useEffect(() => {
    if (!isPeeking) return;
    const release = () => onEnd();
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [isPeeking, onEnd]);

  const handlePointerDown = (e) => {
    // Capture so we keep getting pointer events from the same pointer id
    // regardless of where it moves on screen.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    onStart();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onPointerDown={handlePointerDown}
        // Note: no onPointerUp here — the global listener handles release so
        // it works even if the pointer leaves the button bounds first.
        // No `active:scale-95` — its transform was triggering pointerleave
        // mid-press by shrinking the button under the cursor.
        className="px-3 py-1.5 rounded-full text-xs font-semibold border transition select-none touch-none"
        style={{
          background: isPeeking ? '#EEF2FF' : '#fff',
          borderColor: isPeeking ? '#6366F1' : '#E2E8F0',
          color: isPeeking ? '#4338CA' : '#475569',
        }}
        aria-pressed={isPeeking}
      >
        👀 按住偷看
      </button>
      {count > 0 && <span className="text-xs text-slate-400">{count} 次</span>}
    </div>
  );
}

export default Recall;
