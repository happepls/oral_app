import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { StreakRing } from '../components/StreakRing';
import { ScenarioCard } from '../components/ScenarioCard';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useTour } from '../contexts/TourContext';
import { userAPI, historyAPI, aiAPI } from '../services/api';
import { StatCard } from '../components/StatCard';
import { GuajiAvatar } from '../components/GuajiAvatar';
import { AccessibleDialog } from '../components/AccessibleDialog';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getScenarioDisplayTitle } from '../utils/scenarioDisplay';
import { calcScenarioProgress, getScenarioPracticeStatus } from '../utils/scenarioProgress';

// --- Scenario emoji 映射（按关键词） ---
const SCENARIO_EMOJIS = [
  ['商务', '💼'], ['会议', '🤝'], ['谈判', '🎯'], ['客户', '📞'], ['演讲', '🎤'],
  ['社交', '🌐'], ['面试', '💡'], ['办公', '🏢'], ['邮件', '📧'], ['项目', '📊'],
  ['机场', '✈️'], ['酒店', '🏨'], ['方向', '🗺️'], ['餐厅', '🍽️'], ['购物', '🛍️'],
  ['出租', '🚕'], ['急救', '🆘'], ['博物馆', '🏛️'], ['火车', '🚆'], ['交友', '👋'],
  ['自我介绍', '🙋'], ['咖啡', '☕'], ['超市', '🛒'], ['天气', '🌤️'], ['爱好', '🎨'],
  ['家庭', '👨‍👩‍👧'], ['周末', '🌴'], ['医生', '🏥'], ['帮助', '🤲'], ['闲聊', '💬'],
];

function getEmoji(title) {
  const t = title || '';
  for (const [kw, em] of SCENARIO_EMOJIS) {
    if (t.includes(kw)) return em;
  }
  // 根据 hash 稳定分配 emoji
  const defaults = ['💬', '📖', '🌍', '🎭', '🔑', '🌟', '🎓', '🗣️', '🏆', '✨'];
  let hash = 0;
  for (const c of t) hash = (hash * 31 + c.charCodeAt(0)) % defaults.length;
  return defaults[hash];
}

// --- Fallback 场景生成（保持不变）---
const generateScenarios = (language, interestsStr) => {
  const templates = {
    Business: [
      { title: '商务自我介绍', tasks: ['介绍你的职位和公司', '询问对方公司信息', '交换名片'] },
      { title: '会议参与', tasks: ['表达你的观点', '与同事达成共识', '请求澄清'] },
      { title: '谈判基础', tasks: ['提出报价', '礼貌拒绝', '建议折衷方案'] },
      { title: '客户电话', tasks: ['预约会议', '确认细节', '专业结束通话'] },
      { title: '演讲问答', tasks: ['回答刁难问题', '感谢听众', '总结要点'] },
      { title: '社交活动', tasks: ['开启对话', '讨论行业趋势', '索要联系方式'] },
      { title: '工作面试', tasks: ['描述你的优势', '讲述过去挑战', '询问团队信息'] },
      { title: '办公室闲聊', tasks: ['询问周末', '讨论午餐计划', '谈论时事'] },
      { title: '邮件口述', tasks: ['起草正式请求', '撰写跟进邮件', '专业结尾'] },
      { title: '项目汇报', tasks: ['汇报进展', '提及障碍', '申请资源'] },
    ],
    Travel: [
      { title: '机场值机', tasks: ['要靠窗座位', '托运行李', '询问登机时间'] },
      { title: '酒店预订', tasks: ['预订双人间', '要求含早餐', '申请延迟退房'] },
      { title: '问路', tasks: ['询问地铁位置', '询问距离', '表示感谢'] },
      { title: '点餐', tasks: ['要菜单', '点主菜', '要账单'] },
      { title: '购物', tasks: ['询问尺码', '询问价格', '要求折扣'] },
      { title: '打车', tasks: ['说目的地', '询问费用', '要求在此停车'] },
      { title: '紧急情况', tasks: ['求助', '报告遗失物品', '寻找药店'] },
      { title: '参观博物馆', tasks: ['购票', '要音频导览', '询问关门时间'] },
      { title: '火车旅行', tasks: ['买票', '找站台', '询问延误'] },
      { title: '结交朋友', tasks: ['自我介绍', '询问爱好', '交换联系方式'] },
    ],
    'Daily Life': [
      { title: '自我介绍', tasks: ['姓名与年龄', '居住地点', '工作或学习'] },
      { title: '点咖啡', tasks: ['点饮品', '要糖/牛奶', '刷卡付款'] },
      { title: '超市购物', tasks: ['询问牛奶在哪', '询问新鲜度', '结账'] },
      { title: '谈天气', tasks: ['描述今日天气', '询问明日天气', '评价季节'] },
      { title: '谈爱好', tasks: ['描述你的喜好', '询问对方爱好', '约一起去'] },
      { title: '谈家庭', tasks: ['聊兄弟姐妹', '描述父母', '提到宠物'] },
      { title: '周末计划', tasks: ['说你的计划', '询问朋友计划', '邀请外出'] },
      { title: '看医生', tasks: ['描述症状', '询问药物', '询问恢复时间'] },
      { title: '请求帮助', tasks: ['请求搬东西', '请求撑门', '大力感谢'] },
      { title: '闲聊', tasks: ['称赞衣着', '询问近况', '道别'] },
    ],
  };
  let cat = 'Daily Life';
  const lc = (interestsStr || '').toLowerCase();
  if (lc.includes('business') || lc.includes('商')) cat = 'Business';
  else if (lc.includes('travel') || lc.includes('旅')) cat = 'Travel';
  return [...templates[cat]].slice(0, 10);
};

// --- 辅助函数 ---
function getDifficulty(index) {
  if (index <= 2) return 'beginner';
  if (index <= 6) return 'intermediate';
  return 'advanced';
}

// 免费用户初始解锁的场景数；完成解锁区间后会自动扩展。
const FREE_INITIAL_UNLOCK = 3;

const EMPTY_DAILY_PROGRESS = {
  recallCompleted: false,
  qaCompleted: false,
  scenarioCompleted: false,
  practiceMinutes: 0,
  practiceGoal: 15,
  streak: 0,
  monthlyCheckinDays: 0,
  checkedInToday: false,
};

const DISCOVERY_AUTO_RETRY_DELAYS_MS = [2000, 5000, 10000];

// 计算免费用户的累计解锁数：初始 3 个，已解锁场景全部完成（pct===100）后扩展 +1。
// scenarios 数组顺序即解锁顺序。
function calcUnlockedCount(scenarios) {
  let unlocked = Math.min(FREE_INITIAL_UNLOCK, scenarios.length);
  while (unlocked < scenarios.length) {
    const allPrevDone = scenarios.slice(0, unlocked).every(s => calcScenarioProgress(s) === 100);
    if (!allPrevDone) break;
    unlocked += 1;
  }
  return unlocked;
}

function isScenarioUnlocked(index, unlockedCount, isPro) {
  if (isPro) return true;
  return index < unlockedCount;
}

function getScenarioCardState(scenario, unlocked, pct) {
  if (!unlocked) return 'locked';
  if (pct === 100) return 'completed';
  if (pct > 0) return 'active';
  return 'default';
}

// Filter tab 配置
const FILTER_TABS = [
  { id: 'all',         labelKey: 'qa_ui.filter_all' },
  { id: 'in-progress', labelKey: 'qa_ui.filter_active' },
  { id: 'completed',   labelKey: 'qa_ui.filter_completed' },
  { id: 'not-started', labelKey: 'qa_ui.filter_new' },
];

function DailyQAPaywallModal({ onClose, onUpgrade, t }) {
  return (
    <AccessibleDialog
      title={t('qa_ui.daily_qa_paywall_title')}
      description={t('qa_ui.daily_qa_paywall_desc')}
      onClose={onClose}
      closeLabel={t('qa_ui.close_dialog')}
      panelClassName="max-w-sm rounded-3xl p-8 text-center"
    >
        <div aria-hidden="true" style={{ fontSize: 56, marginBottom: 12 }}>🔒</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          {t('qa_ui.daily_qa_paywall_title')}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--foreground-muted)', marginBottom: 24, lineHeight: 1.55 }}>
          {t('qa_ui.daily_qa_paywall_desc')}
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 12,
              background: '#F3F4F6', color: '#374151', border: 'none',
              fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}>
            {t('qa_ui.cancel')}
          </button>
          <button
            onClick={onUpgrade}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 12,
              background: 'var(--primary)', color: '#fff', border: 'none',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}>
            {t('qa_ui.upgrade_now')}
          </button>
        </div>
    </AccessibleDialog>
  );
}

function Discovery() {
  const { t } = useTranslation();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const tour = useTour();

  const qaPoolAbortControllerRef = useRef(null);
  const tourStartedRef = useRef(false);

  // First-login Onboarding Tour: start once when GoalSetting hands off with
  // startTour, then clear the nav state so returning to Discovery won't retrigger.
  useEffect(() => {
    if (tourStartedRef.current) return;
    if (location.state?.startTour && tour && !tour.completed) {
      tourStartedRef.current = true;
      tour.start();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, tour, navigate]);

  const [activeGoal, setActiveGoal] = useState(null);
  const [activeSessions, setActiveSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkinStats, setCheckinStats] = useState({ currentStreak: 0, checkedInToday: false, totalCheckins: 0 });
  const [scenarios, setScenarios] = useState([]);
  // AI 生成的场景卡配图：{ title -> imageUrl }。懒加载，仅对已解锁场景生成。
  const [scenarioImages, setScenarioImages] = useState({});
  const [filterTab, setFilterTab] = useState('all');
  const [showAchievement, setShowAchievement] = useState(false);
  const [showGoalSwitch, setShowGoalSwitch] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [allGoals, setAllGoals] = useState([]);
  const [switching, setSwitching] = useState(false);
  const [hasOtherGoals, setHasOtherGoals] = useState(false);
  const [dailyQA, setDailyQA] = useState(null);
  const [dailyQAError, setDailyQAError] = useState(false);
  const [dailyQALoading, setDailyQALoading] = useState(true);
  const [showDailyQAPaywall, setShowDailyQAPaywall] = useState(false);
  const [dailyQAPassedDB, setDailyQAPassedDB] = useState(false);
  const [showQAPool, setShowQAPool] = useState(false);
  const [qaPool, setQaPool] = useState([]);
  const [qaPoolLoading, setQaPoolLoading] = useState(false);
  const [unlockToast, setUnlockToast] = useState(null);
  const prevUnlockedCountRef = useRef(null);
  const [dailyProgress, setDailyProgress] = useState(null);
  const [dashboardError, setDashboardError] = useState(false);
  const [dailyProgressError, setDailyProgressError] = useState(false);
  const [dailyProgressLoading, setDailyProgressLoading] = useState(true);
  const [qaPoolError, setQaPoolError] = useState(false);
  const [qaSelectError, setQaSelectError] = useState(false);
  const [checkinError, setCheckinError] = useState(false);
  const [switchGoalError, setSwitchGoalError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const autoRetryAttemptRef = useRef(0);
  const hasLoadedDashboardRef = useRef(false);

  const isPro = user?.subscription_status === 'active';

  const handleOpenQAPool = async () => {
    setShowQAPool(true);
    if (qaPool.length > 0) return;
    setQaPoolLoading(true);
    setQaPoolError(false);

    if (qaPoolAbortControllerRef.current) {
      qaPoolAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    qaPoolAbortControllerRef.current = abortController;

    try {
      const res = await aiAPI.getDailyQuestionPool({ signal: abortController.signal });
      const questions = res?.questions || res?.data?.questions;
      if (questions) setQaPool(questions);
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }
      console.error('[DAILY_QA] pool fetch failed', err);
      setQaPoolError(true);
    } finally {
      setQaPoolLoading(false);
    }
  };

  const handleSelectQuestion = async (index) => {
    setQaSelectError(false);
    try {
      const res = await aiAPI.selectDailyQuestion(index);
      const selected = res?.question_text ? res : res?.data;
      if (selected) {
        setDailyQA({ ...selected, passed: false });
        setDailyQAPassedDB(false);
      }
      setShowQAPool(false);
      navigate('/conversation?mode=daily_qa');
    } catch (err) {
      console.error('[DAILY_QA] select failed', err);
      setQaSelectError(true);
    }
  };

  const handleRetryDailyQA = async () => {
    setDailyQALoading(true);
    setDailyQAError(false);
    try {
      const question = await aiAPI.getDailyQuestion();
      if (question?.question_text) setDailyQA(question);
      else setDailyQAError(true);
    } catch (error) {
      console.error('[DAILY_QA] retry failed', error);
      setDailyQAError(true);
    } finally {
      setDailyQALoading(false);
    }
  };

  const handleRetryDailyProgress = async () => {
    setDailyProgressLoading(true);
    setDailyProgressError(false);
    try {
      const res = await userAPI.getDailyProgress();
      const progress = { ...EMPTY_DAILY_PROGRESS, ...(res?.data || res || {}) };
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(`recall_completed_${today}`) === 'true') {
        progress.recallCompleted = true;
      }
      setDailyProgress(progress);
    } catch (error) {
      console.error('[DAILY_PROGRESS] retry failed', error);
      setDailyProgressError(true);
    } finally {
      setDailyProgressLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (qaPoolAbortControllerRef.current) {
        qaPoolAbortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchData = async () => {
      if (authLoading) return;
      if (!user) {
        navigate('/login', { replace: true });
        setLoading(false);
        return;
      }
      // Background retries must not replace the dashboard DOM. Keeping the
      // existing controls mounted preserves keyboard focus and lets users keep
      // working while a partial request is retried.
      if (!hasLoadedDashboardRef.current) setLoading(true);
      setDashboardError(false);
      setDailyQAError(false);
      setDailyQALoading(true);
      setDailyProgressError(false);
      setDailyProgressLoading(true);
      try {
        if (!user.native_language) { navigate('/onboarding'); return; }

        const goalRes = await userAPI.getActiveGoal();
        if (abortController.signal.aborted) return;
        if (!goalRes || !goalRes.goal) { navigate('/goal-setting'); return; }
        setActiveGoal(goalRes.goal);
        checkAchievement(goalRes.goal);

        try {
          const goalsRes = await userAPI.getUserGoals();
          if (abortController.signal.aborted) return;
          const other = (goalsRes.goals || []).filter(g => g.status === 'paused');
          setHasOtherGoals(other.length > 0);
        } catch { if (!abortController.signal.aborted) setHasOtherGoals(false); }

        if (goalRes.goal.scenarios?.length > 0) {
          setScenarios(goalRes.goal.scenarios);
        } else {
          setScenarios(generateScenarios(goalRes.goal.target_language, goalRes.goal.interests));
        }

        const [statsRes, histRes, checkinRes, qaRes, progressRes] = await Promise.allSettled([
          historyAPI.getStats(user.id),
          historyAPI.getUserHistory(user.id),
          userAPI.getCheckinStats(),
          aiAPI.getDailyQuestion({ signal: abortController.signal }),
          userAPI.getDailyProgress(),
        ]);
        if (abortController.signal.aborted) return;

        if (statsRes.status === 'fulfilled' && statsRes.value) {
          const s = statsRes.value.data || statsRes.value;
          setStats(s);
        }
        if (histRes.status === 'fulfilled' && histRes.value) {
          const h = histRes.value.data || histRes.value;
          if (Array.isArray(h)) setActiveSessions(h);
        }
        if (checkinRes.status === 'fulfilled' && checkinRes.value?.data) {
          const d = checkinRes.value.data;
          setCheckinStats({
            currentStreak: d.currentStreak || d.streak_count || 0,
            checkedInToday: d.checkedInToday || false,
            totalCheckins: d.totalCheckins || 0,
          });
        }
        if (qaRes.status === 'fulfilled' && qaRes.value?.question_text) {
          setDailyQA(qaRes.value);
          setDailyQAError(false);
        } else {
          setDailyQAError(true);
        }
        setDailyQALoading(false);

        if (progressRes.status === 'fulfilled') {
          const progress = { ...EMPTY_DAILY_PROGRESS, ...(progressRes.value?.data || progressRes.value || {}) };
          const today = new Date().toISOString().slice(0, 10);
          if (localStorage.getItem(`recall_completed_${today}`) === 'true') {
            progress.recallCompleted = true;
          }
          setDailyProgress(progress);
          setDailyProgressError(false);
        } else {
          setDailyProgress(current => current || { ...EMPTY_DAILY_PROGRESS });
          setDailyProgressError(true);
        }
        setDailyProgressLoading(false);

        // Check daily QA pass status from database
        userAPI.getDailyQAPassStatus().then(res => {
          if (abortController.signal.aborted) return;
          if (res?.data?.passed) setDailyQAPassedDB(true);
        }).catch(() => {});

      } catch (e) {
        if (abortController.signal.aborted) return;
        console.error('Dashboard fetch error:', e);
        setDailyQAError(true);
        setDailyQALoading(false);
        setDailyProgressError(true);
        setDailyProgressLoading(false);
        setDailyProgress(current => current || { ...EMPTY_DAILY_PROGRESS });
        setDashboardError(true);
      } finally {
        if (!abortController.signal.aborted) {
          hasLoadedDashboardRef.current = true;
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => abortController.abort();
  }, [user, authLoading, navigate, location.key, reloadVersion]);

  const hasLoadError = dashboardError || dailyProgressError || dailyQAError;

  useEffect(() => {
    if (!loading && !hasLoadError) {
      autoRetryAttemptRef.current = 0;
      return undefined;
    }
    if (loading || !hasLoadError) return undefined;

    let retryTimer;
    const runRetry = () => {
      window.clearTimeout(retryTimer);
      autoRetryAttemptRef.current += 1;
      setReloadVersion(version => version + 1);
    };
    if (autoRetryAttemptRef.current < DISCOVERY_AUTO_RETRY_DELAYS_MS.length) {
      const delay = DISCOVERY_AUTO_RETRY_DELAYS_MS[autoRetryAttemptRef.current];
      retryTimer = window.setTimeout(runRetry, delay);
    }

    const retryOnResume = () => {
      autoRetryAttemptRef.current = 0;
      runRetry();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') retryOnResume();
    };
    window.addEventListener('online', retryOnResume);
    window.addEventListener('focus', retryOnResume);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearTimeout(retryTimer);
      window.removeEventListener('online', retryOnResume);
      window.removeEventListener('focus', retryOnResume);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasLoadError, loading]);

  const retryDashboard = () => {
    autoRetryAttemptRef.current = 0;
    setReloadVersion(version => version + 1);
  };

  const { subscribe } = useNotifications();

  useEffect(() => {
    const unsubs = [
      subscribe('task_completed', async () => {
        try {
          const goalRes = await userAPI.getActiveGoal();
          if (goalRes?.goal) {
            setActiveGoal(goalRes.goal);
            if (goalRes.goal.scenarios?.length > 0) setScenarios(goalRes.goal.scenarios);
            checkAchievement(goalRes.goal);
          }
        } catch {
          // Notification refresh is best-effort; the next page load reconciles it.
        }
      }),
      subscribe('proficiency_update', async (data) => {
        if (data?.payload?.delta > 0) {
          try {
            const goalRes = await userAPI.getActiveGoal();
            if (goalRes?.goal) setActiveGoal(goalRes.goal);
          } catch {
            // Notification refresh is best-effort; keep the last visible progress.
          }
        }
      }),
      subscribe('daily_qa_completed', () => {
        setDailyQAPassedDB(true);
        // Update immediately from the completion event. The subsequent fetch
        // reconciles the rest of the daily metrics without allowing a delayed
        // response to visually revert QA back to incomplete.
        setDailyProgress(prev => prev ? { ...prev, qaCompleted: true } : prev);
        userAPI.getDailyProgress().then(res => {
          setDailyProgress({
            ...(res?.data || res || {}),
            qaCompleted: true,
          });
        }).catch(() => {});
      })
    ];
    return () => unsubs.forEach(fn => fn());
  }, [subscribe]);

  const checkAchievement = (goal) => {
    if (!goal?.scenarios?.length) return;
    const allDone = goal.scenarios.every(s =>
      s.tasks?.length > 0 && s.tasks.every(t => typeof t === 'object' && t.status === 'completed')
    );
    if (allDone) {
      const key = `goal_all_completed_${goal.id}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, 'true');
        setShowAchievement(true);
      }
    }
  };

  const handleCheckin = async () => {
    setCheckinError(false);
    try {
      const res = await userAPI.checkin();
      const streak = res?.data?.streak || res?.checkin?.streak_count || checkinStats.currentStreak + 1;
      setCheckinStats(prev => ({ ...prev, currentStreak: streak, checkedInToday: true }));
    } catch (e) {
      console.error('Checkin error:', e);
      setCheckinError(true);
    }
  };

  const handleOpenSwitch = async () => {
    setSwitchGoalError(false);
    try {
      const res = await userAPI.getUserGoals();
      setAllGoals((res.goals || []).filter(goal => goal.status === 'paused'));
      setShowGoalSwitch(true);
    } catch (e) {
      console.error('Load goals error:', e);
      setSwitchGoalError(true);
      setAllGoals([]);
      setShowGoalSwitch(true);
    }
  };

  const handleSwitchGoal = async (goalId) => {
    setSwitching(true);
    setSwitchGoalError(false);
    try {
      await userAPI.switchGoal(goalId);
      setShowGoalSwitch(false);
      navigate(location.pathname, { replace: true });
    } catch (e) {
      console.error('Switch goal error:', e);
      setSwitchGoalError(true);
      if (e?.status === 404) {
        try {
          const res = await userAPI.getUserGoals();
          const switchable = (res.goals || []).filter(goal => goal.status === 'paused');
          setAllGoals(switchable);
          setHasOtherGoals(switchable.length > 0);
          if (switchable.length === 0) setShowGoalSwitch(false);
        } catch {
          setAllGoals(current => current.filter(goal => goal.id !== goalId));
        }
      }
    }
    finally { setSwitching(false); }
  };

  const handleScenarioClick = (scenario) => {
    const existing = activeSessions.find(s =>
      s.topic === scenario.title || s.topic?.includes(scenario.title)
    );
    if (existing) {
      navigate(`/conversation?sessionId=${existing.sessionId}&scenario=${encodeURIComponent(scenario.title)}`, {
        state: { tasks: scenario.tasks, emoji: scenario.emoji },
      });
    } else {
      navigate(`/conversation?scenario=${encodeURIComponent(scenario.title)}`, {
        state: { tasks: scenario.tasks, emoji: scenario.emoji },
      });
    }
  };

  // ── 派生数据（useMemo 避免每次 render 重算） ──
  const unlockedCount = useMemo(() => calcUnlockedCount(scenarios), [scenarios]);

  // 自动解锁提示：unlockedCount 从 N 增长到 N+1 时，显示 toast。
  // 首次加载只记录基线，不弹（避免页面打开就 toast）。Pro 用户全解锁，无需提示。
  useEffect(() => {
    if (user?.subscription_status === 'active' || scenarios.length === 0) return;
    const prev = prevUnlockedCountRef.current;
    if (prev !== null && unlockedCount > prev) {
      const newScenario = scenarios[unlockedCount - 1];
      if (newScenario) {
        setUnlockToast({ title: newScenario.title, emoji: getEmoji(newScenario.title) });
        const timer = setTimeout(() => setUnlockToast(null), 3500);
        prevUnlockedCountRef.current = unlockedCount;
        return () => clearTimeout(timer);
      }
    }
    prevUnlockedCountRef.current = unlockedCount;
  }, [unlockedCount, scenarios, user]);

  const enrichedScenarios = useMemo(() => scenarios.map((s, i) => {
    const pct = calcScenarioProgress(s);
    const practiceStatus = getScenarioPracticeStatus(s);
    const unlocked = isScenarioUnlocked(i, unlockedCount, isPro);
    const cardState = getScenarioCardState(s, unlocked, pct);
    // image_url 优先来自后端 scenario 数据（若曾持久化），否则用懒加载 state
    const imageUrl = s.image_url || scenarioImages[s.title] || '';
    const displayTitle = getScenarioDisplayTitle(s.title, i, i18n.resolvedLanguage || i18n.language);
    return { ...s, displayTitle, pct, practiceStatus, unlocked, cardState, difficulty: getDifficulty(i), emoji: getEmoji(s.title), imageUrl, index: i };
  }), [scenarios, unlockedCount, isPro, scenarioImages, i18n.resolvedLanguage, i18n.language]);

  // 懒加载已解锁场景的 AI 配图：一次只取一张（节流），sessionStorage 跨页缓存，
  // 失败/超时静默回退 emoji。锁定卡不生成，省文生图成本。
  useEffect(() => {
    const target = enrichedScenarios.find(
      s => s.unlocked && !s.image_url && !(s.title in scenarioImages)
    );
    if (!target) return;
    const cacheKey = `scenario_img:${target.title}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached !== null) {
      setScenarioImages(prev => ({ ...prev, [target.title]: cached }));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // 带上 activeGoal.id → 后端转存 COS 后直接写回 scenarios[i].image_url。
        const { image_url } = await aiAPI.generateScenarioImage(target.title, activeGoal?.id);
        if (cancelled) return;
        const url = image_url || '';
        try {
          sessionStorage.setItem(cacheKey, url);
        } catch {
          // Storage may be unavailable in privacy mode; in-memory fallback remains valid.
        }
        setScenarioImages(prev => ({ ...prev, [target.title]: url }));
      } catch {
        if (!cancelled) {
          // Emoji remains the deliberate visual fallback and prevents retry loops.
          setScenarioImages(prev => ({ ...prev, [target.title]: '' }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [enrichedScenarios, scenarioImages, activeGoal]);

  const todayRecommended = useMemo(() => enrichedScenarios.find(s => s.unlocked && s.pct < 100), [enrichedScenarios]);
  const qaTaskCompleted = Boolean(
    dailyProgress?.qaCompleted || dailyQAPassedDB || dailyQA?.passed
  );
  const currentDailyProgress = dailyProgress || EMPTY_DAILY_PROGRESS;

  const overallProgress = useMemo(() => scenarios.length > 0
    ? Math.round(enrichedScenarios.filter(s => s.pct === 100).length / scenarios.length * 100)
    : 0, [enrichedScenarios, scenarios.length]);

  const filteredScenarios = useMemo(() => enrichedScenarios.filter(s => {
    if (filterTab === 'all') return true;
    if (filterTab === 'in-progress') return s.unlocked && s.practiceStatus === 'in-progress';
    if (filterTab === 'completed') return s.practiceStatus === 'completed';
    if (filterTab === 'not-started') return s.unlocked && s.practiceStatus === 'not-started';
    return true;
  }), [enrichedScenarios, filterTab]);

  const userName = user?.username || user?.name || t('qa_ui.learner');
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t('qa_ui.greeting_morning');
    if (h < 18) return t('qa_ui.greeting_afternoon');
    return t('qa_ui.greeting_evening');
  }, [t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light dark:bg-background-dark">
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
            aria-hidden="true"
            style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
          <p className="text-sm text-slate-500">{t('qa_ui.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[720px] flex-col" style={{ background: 'var(--background)' }}>

      {/* ── 成就 Modal ── */}
      {showAchievement && (
        <AccessibleDialog
          title={t('qa_ui.achievement_title')}
          description={t('qa_ui.achievement_body', { count: scenarios.length, level: activeGoal?.target_level })}
          onClose={() => setShowAchievement(false)}
          closeLabel={t('qa_ui.close_dialog')}
          panelClassName="max-w-sm rounded-3xl p-8 text-center"
        >
            <div aria-hidden="true" className="text-7xl mb-3">🏆</div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{t('qa_ui.achievement_title')}</h2>
            <p className="text-sm text-primary font-semibold mb-2">{t('qa_ui.achievement_unlocked')}</p>
            <p className="text-slate-500 text-sm mb-6">
              {t('qa_ui.achievement_body', { count: scenarios.length, level: activeGoal?.target_level })}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowAchievement(false)}
                className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:text-slate-200">
                {t('qa_ui.later')}
              </button>
              <button onClick={() => { setShowAchievement(false); navigate('/goal-setting'); }}
                className="flex-1 py-3 rounded-xl bg-primary text-white font-medium text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2">
                {t('qa_ui.create_new_goal')}
              </button>
            </div>
        </AccessibleDialog>
      )}

      {/* ── 目标切换 Modal ── */}
      {/* z-index above BottomNav (which is z-50) so it isn't visually clipped.
          Bottom padding reserves space for the 72px nav plus iOS safe-area
          inset so the last item never sits behind the nav bar. */}
      {showGoalSwitch && (
        <AccessibleDialog
          title={t('qa_ui.switch_goal_title')}
          onClose={() => setShowGoalSwitch(false)}
          closeLabel={t('qa_ui.close_dialog')}
          placement="bottom"
          zIndex={310}
          panelClassName="max-w-lg rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto"
        >
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4 pr-12">{t('qa_ui.switch_goal_title')}</h2>
            {switchGoalError && (
              <div role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
                {t('qa_ui.switch_goal_error')}
              </div>
            )}
            {allGoals.filter(g => g.status === 'paused').map(goal => (
              <button key={goal.id} onClick={() => handleSwitchGoal(goal.id)} disabled={switching}
                className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-primary/40 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition mb-2 dark:border-slate-600 dark:hover:bg-slate-700">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{goal.target_language}</p>
                  <p className="text-xs text-slate-500">
                    {goal.target_level} · {goal.created_at
                      ? new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language).format(new Date(goal.created_at))
                      : t('qa_ui.time_unknown')}
                  </p>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {goal.current_proficiency || 0}%
                </span>
              </button>
            ))}
            {!switchGoalError && allGoals.filter(g => g.status === 'paused').length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">{t('qa_ui.no_other_goals')}</p>
            )}
        </AccessibleDialog>
      )}

      {/* ── Daily QA Paywall Modal ── */}
      {showDailyQAPaywall && (
        <DailyQAPaywallModal
          onClose={() => setShowDailyQAPaywall(false)}
          onUpgrade={() => { setShowDailyQAPaywall(false); navigate('/subscription'); }}
          t={t}
        />
      )}

      {/* ── 自动解锁 Toast ── */}
      <AnimatePresence>
        {unlockToast && (
          <motion.div
            role="status"
            aria-live="polite"
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            style={{
              position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg, #047857, #065F46)', color: '#fff',
              padding: '12px 20px', borderRadius: 14, boxShadow: '0 10px 30px rgba(16,185,129,0.35)',
              zIndex: 400, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10,
              maxWidth: '90%',
            }}>
            <span aria-hidden="true" style={{ fontSize: 22 }}>{unlockToast.emoji || '🎉'}</span>
            <span>{t('qa_ui.unlock_toast', { title: unlockToast.title })}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {showQAPool && (
        <AccessibleDialog
          title={t('qa_ui.question_pool_title')}
          onClose={() => setShowQAPool(false)}
          closeLabel={t('qa_ui.close_dialog')}
          panelClassName="max-w-md rounded-3xl p-5 max-h-[70vh] overflow-y-auto"
        >
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4 pr-12">{t('qa_ui.question_pool_title')}</h2>
            {qaPoolLoading ? (
              <div role="status" className="p-6 text-center text-sm text-slate-600 dark:text-slate-300">{t('qa_ui.loading')}</div>
            ) : qaPoolError ? (
              <div role="alert" className="rounded-xl bg-red-50 p-4 text-center text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
                <p>{t('qa_ui.question_pool_error')}</p>
                <button onClick={handleOpenQAPool} className="mt-3 rounded-xl bg-primary px-4 py-2 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                  {t('qa_ui.retry')}
                </button>
              </div>
            ) : qaPool.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-600 dark:text-slate-300">{t('qa_ui.question_pool_empty')}</div>
            ) : (
              qaPool.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectQuestion(q.index)}
                  className="mb-2 block w-full rounded-xl border border-slate-300 bg-slate-50 p-4 text-left transition hover:border-primary hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600">
                  <p className="mb-1 text-sm font-medium text-slate-900 dark:text-white">
                    {q.question_text}
                  </p>
                  {q.reference_answer && (
                    <p className="text-xs italic text-slate-600 dark:text-slate-300">
                      <span aria-hidden="true">💡</span> {q.reference_answer}
                    </p>
                  )}
                </button>
              ))
            )}
            {qaSelectError && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{t('qa_ui.question_select_error')}</p>}
        </AccessibleDialog>
      )}

      {/* ── 升级 Pro Modal ── */}
      {showUpgradeModal && (
        <AccessibleDialog
          title={t('qa_ui.upgrade_title')}
          onClose={() => setShowUpgradeModal(false)}
          closeLabel={t('qa_ui.close_dialog')}
          panelClassName="max-w-sm rounded-3xl p-7 text-center"
        >
            <div aria-hidden="true" className="text-5xl mb-4">👑</div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('qa_ui.upgrade_title')}</h2>
            <ul className="text-sm text-slate-500 text-left mb-6 space-y-2">
              {['upgrade_benefit_scenarios', 'upgrade_benefit_custom', 'upgrade_benefit_advanced', 'upgrade_benefit_voice', 'upgrade_benefit_early'].map(key => (
                <li key={key} className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-amber-700 dark:text-amber-300">★</span> {t(`qa_ui.${key}`)}
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button onClick={() => setShowUpgradeModal(false)}
                className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 dark:text-slate-200 font-medium text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                {t('qa_ui.later')}
              </button>
              <button onClick={() => { setShowUpgradeModal(false); navigate('/subscription'); }}
                className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2">
                {t('qa_ui.upgrade_now')}
              </button>
            </div>
        </AccessibleDialog>
      )}

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-5 pt-5 pb-2">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{greeting}</p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
            {userName} {isPro && <span className="text-xs align-middle bg-yellow-100 text-yellow-600 px-1.5 py-0.5 rounded-full font-semibold ml-1">Pro</span>}
          </h1>
          {/* 目标总进度 */}
          <div className="mt-1.5 flex items-center gap-2">
            <div
              role="progressbar"
              aria-label={t('qa_ui.overall_progress_label')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={overallProgress}
              className="h-1 rounded-full bg-slate-200 overflow-hidden"
              style={{ width: 100 }}
            >
              <div className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${overallProgress}%` }} />
            </div>
            <span className="text-xs text-slate-400">{t('qa_ui.complete_pct', { value: overallProgress })}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasOtherGoals && (
            <button onClick={handleOpenSwitch}
              className="text-xs text-slate-600 hover:text-primary transition px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              {t('qa_ui.switch_goal')}
            </button>
          )}
          <div aria-hidden="true" className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ background: 'var(--primary)' }}>
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <main className="flex-grow pb-28 space-y-5 px-4 pt-2">

        {dashboardError && (
          <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
            <h2 className="text-sm font-bold">{t('qa_ui.dashboard_error_title')}</h2>
            <p className="mt-1 text-sm">{t('qa_ui.dashboard_error_desc')}</p>
            <button
              onClick={retryDashboard}
              className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
            >
              {t('qa_ui.retry')}
            </button>
          </section>
        )}

        {/* ── 今日任务（合并卡片） ── */}
          <section data-tour="today-tasks">
            <div className="rounded-2xl p-5 bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700">
              {/* 标题栏 */}
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <GuajiAvatar size={28} />
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('qa_ui.today_tasks')}</h2>
                </div>
                <span className="text-xs text-slate-600" aria-label={t('qa_ui.tasks_completed_count', {
                  count: (currentDailyProgress.recallCompleted ? 1 : 0) + (qaTaskCompleted ? 1 : 0) + (currentDailyProgress.scenarioCompleted ? 1 : 0),
                  total: 3,
                })}>
                  {(currentDailyProgress.recallCompleted ? 1 : 0) + (qaTaskCompleted ? 1 : 0) + (currentDailyProgress.scenarioCompleted ? 1 : 0)}/3
                </span>
              </div>

              {dailyProgressError && (
                <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  <span>{t('qa_ui.daily_progress_error')}</span>
                  <button
                    onClick={handleRetryDailyProgress}
                    disabled={dailyProgressLoading}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60"
                  >
                    {dailyProgressLoading ? t('qa_ui.loading') : t('qa_ui.retry')}
                  </button>
                </div>
              )}

              {/* 3 个任务按钮 */}
              <div className="flex items-center justify-around gap-2 mb-5">
                {/* 复述任务 */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  onClick={() => {
                    // Dedicated recall route — no longer overloads /conversation.
                    // Recall page loads today's scenario itself via getActiveGoal.
                    navigate('/recall');
                  }}
                  aria-label={t('qa_ui.task_button_label', {
                    task: t('qa_ui.recall'),
                    status: t(currentDailyProgress.recallCompleted ? 'qa_ui.task_complete' : 'qa_ui.task_pending'),
                  })}
                  className="flex flex-col items-center gap-2 flex-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  data-completed={currentDailyProgress.recallCompleted}>
                  <div
                    className="relative w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all"
                    style={{
                      background: currentDailyProgress.recallCompleted
                        ? 'linear-gradient(135deg, #10B981, #059669)'
                        : 'rgba(148, 163, 184, 0.1)',
                      border: currentDailyProgress.recallCompleted ? 'none' : '2px dashed #CBD5E1',
                      boxShadow: currentDailyProgress.recallCompleted
                        ? '0 6px 14px rgba(5, 150, 105, 0.28), inset 0 0 0 1px rgba(255,255,255,0.24)'
                        : 'none',
                    }}>
                    <span aria-hidden="true" style={{
                      filter: currentDailyProgress.recallCompleted ? 'saturate(1.35) contrast(1.1)' : 'grayscale(0.25)',
                    }}>🔁</span>
                    {currentDailyProgress.recallCompleted && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full bg-white text-emerald-600 flex items-center justify-center text-xs font-black shadow-sm">
                        ✓
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-medium ${
                    currentDailyProgress.recallCompleted
                      ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}>{t('qa_ui.recall')}</span>
                </motion.button>

                {/* 问答任务 */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  onClick={() => {
                    if (dailyQA?.passed || dailyQAPassedDB) {
                      if (!isPro) { setShowDailyQAPaywall(true); return; }
                      handleOpenQAPool();
                    } else {
                      navigate('/conversation?mode=daily_qa');
                    }
                  }}
                  aria-label={t('qa_ui.task_button_label', {
                    task: t('qa_ui.qa'),
                    status: t(qaTaskCompleted ? 'qa_ui.task_complete' : 'qa_ui.task_pending'),
                  })}
                  className="flex flex-col items-center gap-2 flex-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  data-completed={qaTaskCompleted}>
                  <div
                    className="relative w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all"
                    style={{
                      background: qaTaskCompleted
                        ? 'linear-gradient(135deg, #10B981, #059669)'
                        : 'rgba(148, 163, 184, 0.1)',
                      border: qaTaskCompleted ? 'none' : '2px dashed #CBD5E1',
                      boxShadow: qaTaskCompleted
                        ? '0 6px 14px rgba(5, 150, 105, 0.28), inset 0 0 0 1px rgba(255,255,255,0.24)'
                        : 'none',
                    }}>
                    <span aria-hidden="true" style={{
                      filter: qaTaskCompleted ? 'saturate(1.35) contrast(1.1)' : 'grayscale(0.25)',
                    }}>❓</span>
                    {qaTaskCompleted && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full bg-white text-emerald-600 flex items-center justify-center text-xs font-black shadow-sm">
                        ✓
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-medium ${
                    qaTaskCompleted
                      ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}>{t('qa_ui.qa')}</span>
                </motion.button>

                {/* 练习任务 */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  onClick={() => {
                    if (todayRecommended) {
                      navigate(
                        `/conversation?scenario=${encodeURIComponent(todayRecommended.scenarioKey || todayRecommended.title)}`,
                        { state: { tasks: todayRecommended.tasks, emoji: todayRecommended.emoji } }
                      );
                    }
                  }}
                  disabled={!todayRecommended && !currentDailyProgress.scenarioCompleted}
                  aria-label={t('qa_ui.task_button_label', {
                    task: t('qa_ui.practice'),
                    status: t(currentDailyProgress.scenarioCompleted ? 'qa_ui.task_complete' : 'qa_ui.task_pending'),
                  })}
                  className="flex flex-col items-center gap-2 flex-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
                  data-completed={currentDailyProgress.scenarioCompleted}>
                  <div
                    className="relative w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all"
                    style={{
                      background: currentDailyProgress.scenarioCompleted
                        ? 'linear-gradient(135deg, #10B981, #059669)'
                        : 'rgba(148, 163, 184, 0.1)',
                      border: currentDailyProgress.scenarioCompleted ? 'none' : '2px dashed #CBD5E1',
                      boxShadow: currentDailyProgress.scenarioCompleted
                        ? '0 6px 14px rgba(5, 150, 105, 0.28), inset 0 0 0 1px rgba(255,255,255,0.24)'
                        : 'none',
                    }}>
                    <span aria-hidden="true" style={{
                      filter: currentDailyProgress.scenarioCompleted ? 'saturate(1.35) contrast(1.1)' : 'grayscale(0.25)',
                    }}>🎯</span>
                    {currentDailyProgress.scenarioCompleted && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full bg-white text-emerald-600 flex items-center justify-center text-xs font-black shadow-sm">
                        ✓
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-medium ${
                    currentDailyProgress.scenarioCompleted
                      ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}>{t('qa_ui.practice')}</span>
                </motion.button>
              </div>

              {dailyQALoading && (
                <p role="status" className="mb-4 text-center text-xs text-slate-600 dark:text-slate-300">{t('qa_ui.daily_qa_loading')}</p>
              )}
              {dailyQAError && !dailyQALoading && (
                <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  <span>{t('qa_ui.daily_qa_error')}</span>
                  <button onClick={handleRetryDailyQA} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                    {t('qa_ui.retry')}
                  </button>
                </div>
              )}

              {/* 今日练习时长进度条 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">{t('qa_ui.today_practice')}</span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t('qa_ui.minutes_progress', { current: currentDailyProgress.practiceMinutes || 0, goal: currentDailyProgress.practiceGoal || 15 })}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={t('qa_ui.practice_progress_label')}
                  aria-valuemin={0}
                  aria-valuemax={currentDailyProgress.practiceGoal || 15}
                  aria-valuenow={Math.min(currentDailyProgress.practiceMinutes || 0, currentDailyProgress.practiceGoal || 15)}
                  className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(((currentDailyProgress.practiceMinutes || 0) / (currentDailyProgress.practiceGoal || 15)) * 100, 100)}%`,
                      background: 'var(--primary)',
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

        {/* ── 连续学习进度环 ── */}
        <div data-tour="recall-streak">
          <StreakRing
            streak={currentDailyProgress.streak || checkinStats.currentStreak}
            monthlyCheckinDays={currentDailyProgress.monthlyCheckinDays || 0}
            checkedInToday={currentDailyProgress.checkedInToday || checkinStats.checkedInToday}
            onCheckin={handleCheckin}
          />
          {checkinError && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{t('qa_ui.checkin_error')}</p>}
        </div>

        {/* ── 4格统计 ── */}
        <section data-tour="stats">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard emoji="📚" value={stats?.totalSessions || activeSessions?.length || 0} label={t('qa_ui.total_conversations')} />
            <StatCard emoji="📅" value={stats?.learningDays || checkinStats.totalCheckins || 0} label={t('qa_ui.learning_days')} />
            <StatCard emoji="✅" value={`${enrichedScenarios.filter(s => s.pct === 100).length}/${scenarios.length}`} label={t('qa_ui.scenarios_completed')} />
            <StatCard emoji="🎯" value={`${overallProgress}%`} label={t('qa_ui.total_progress')} />
          </div>
        </section>

        {/* ── 场景完成 Banner ── */}
        {overallProgress === 100 && (
          <button
            type="button"
            onClick={() => navigate('/goal-setting')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate('/goal-setting');
              }
            }}
            className="flex w-full items-center gap-3 border-2 border-amber-500/60 rounded-2xl p-4 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            style={{ background: 'rgba(251,191,36,0.08)' }}>
            <Trophy aria-hidden="true" className="w-7 h-7 text-amber-700 dark:text-amber-300 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{t('qa_ui.all_scenarios_done')}</p>
              <p className="text-xs text-slate-500">{t('qa_ui.new_goal_cta')}</p>
            </div>
          </button>
        )}

        {/* ── 场景轮播 ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('qa_ui.scenario_practice')}</h2>
              {activeGoal && (
                <p className="text-xs text-slate-400">{activeGoal.target_language} · {activeGoal.target_level}</p>
              )}
            </div>
            <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
              {t('qa_ui.scenario_count', { count: scenarios.length })}
            </span>
          </div>

          {/* Filter chips */}
          <div role="group" aria-label={t('qa_ui.filter_label')} className="flex flex-wrap gap-2 pb-1 mb-3">
            {FILTER_TABS.map(tab => (
              <button key={tab.id} onClick={() => setFilterTab(tab.id)}
                aria-pressed={filterTab === tab.id}
                className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                style={{
                  background: filterTab === tab.id ? '#2d44ca' : '#F3F4F6',
                  color: filterTab === tab.id ? '#fff' : '#374151',
                }}>
                {t(tab.labelKey)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3" data-tour="scenario-card">
            {filteredScenarios.map((s) => (
              <ScenarioCard
                key={s.index}
                title={s.displayTitle}
                emoji={s.emoji}
                imageUrl={s.imageUrl}
                description={
                  s.tasks?.[0]
                    ? (typeof s.tasks[0] === 'object'
                        ? (s.tasks[0].text || s.tasks[0].description || '')
                        : String(s.tasks[0]))
                    : ''
                }
                difficulty={s.difficulty}
                progress={s.pct}
                state={s.cardState === 'locked' ? 'locked' : s.cardState === 'active' ? 'selected' : 'default'}
                unlockReason={s.cardState === 'locked' ? t('qa_ui.scenario_unlock_reason') : ''}
                onUnlock={s.cardState === 'locked' ? () => setShowUpgradeModal(true) : undefined}
                onStart={() => handleScenarioClick(s)}
              />
            ))}
          </div>

          {filteredScenarios.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-6">
              {filterTab === 'in-progress' ? t('qa_ui.no_active_scenarios') :
               filterTab === 'completed' ? t('qa_ui.no_completed_scenarios') : t('qa_ui.no_matching_scenarios')}
            </p>
          )}
        </section>
      </main>

      <BottomNav currentPage="home" />
    </div>
  );
}

export default Discovery;
