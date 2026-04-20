import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { StreakRing } from '../components/StreakRing';
import { ScenarioCard } from '../components/ScenarioCard';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, historyAPI } from '../services/api';
import { StatCard } from '../components/StatCard';
import { motion } from 'motion/react';
import { MessageSquare, Calendar, Trophy, Crown } from 'lucide-react';

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
function calcProgress(scenario) {
  if (!scenario.tasks || scenario.tasks.length === 0) return 0;
  const done = scenario.tasks.filter(t => typeof t === 'object' && t.status === 'completed').length;
  return Math.round((done / scenario.tasks.length) * 100);
}

function getDifficulty(index) {
  if (index <= 2) return 'beginner';
  if (index <= 6) return 'intermediate';
  return 'advanced';
}

function isScenarioUnlocked(index, scenarios, isPro) {
  if (isPro) return true;
  if (index < 3) return true;
  return false;
}

function getScenarioCardState(scenario, unlocked, pct) {
  if (!unlocked) return 'locked';
  if (pct === 100) return 'completed';
  if (pct > 0) return 'active';
  return 'default';
}

// Filter tab 配置
const FILTER_TABS = [
  { id: 'all',         label: '全部' },
  { id: 'in-progress', label: '进行中' },
  { id: 'completed',   label: '已完成' },
  { id: 'not-started', label: '未开始' },
];

function Discovery() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [activeGoal, setActiveGoal] = useState(null);
  const [activeSessions, setActiveSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkinStats, setCheckinStats] = useState({ currentStreak: 0, checkedInToday: false, totalCheckins: 0 });
  const [scenarios, setScenarios] = useState([]);
  const [filterTab, setFilterTab] = useState('all');
  const [showAchievement, setShowAchievement] = useState(false);
  const [showGoalSwitch, setShowGoalSwitch] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [allGoals, setAllGoals] = useState([]);
  const [switching, setSwitching] = useState(false);
  const [hasOtherGoals, setHasOtherGoals] = useState(false);

  const isPro = user?.subscription_status === 'active';

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        if (!user.native_language) { navigate('/onboarding'); return; }

        const goalRes = await userAPI.getActiveGoal();
        if (!goalRes || !goalRes.goal) { navigate('/goal-setting'); return; }
        setActiveGoal(goalRes.goal);
        checkAchievement(goalRes.goal);

        try {
          const goalsRes = await userAPI.getUserGoals();
          const other = (goalsRes.goals || []).filter(g => g.status !== 'active');
          setHasOtherGoals(other.length > 0);
        } catch (_) { setHasOtherGoals(false); }

        if (goalRes.goal.scenarios?.length > 0) {
          setScenarios(goalRes.goal.scenarios);
        } else {
          setScenarios(generateScenarios(goalRes.goal.target_language, goalRes.goal.interests));
        }

        const [statsRes, histRes, checkinRes] = await Promise.allSettled([
          historyAPI.getStats(user.id),
          historyAPI.getUserHistory(user.id),
          userAPI.getCheckinStats(),
        ]);

        if (statsRes.status === 'fulfilled' && statsRes.value?.data) {
          setStats(statsRes.value.data);
        }
        if (histRes.status === 'fulfilled' && histRes.value?.data) {
          setActiveSessions(histRes.value.data);
        }
        if (checkinRes.status === 'fulfilled' && checkinRes.value?.data) {
          const d = checkinRes.value.data;
          setCheckinStats({
            currentStreak: d.currentStreak || d.streak_count || 0,
            checkedInToday: d.checkedInToday || false,
            totalCheckins: d.totalCheckins || 0,
          });
        }
      } catch (e) {
        console.error('Dashboard fetch error:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, navigate, location.key]);

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
    try {
      const res = await userAPI.checkin();
      const streak = res?.data?.streak || res?.checkin?.streak_count || checkinStats.currentStreak + 1;
      setCheckinStats(prev => ({ ...prev, currentStreak: streak, checkedInToday: true }));
    } catch (e) {
      console.error('Checkin error:', e);
    }
  };

  const handleOpenSwitch = async () => {
    try {
      const res = await userAPI.getUserGoals();
      setAllGoals(res.goals || []);
      setShowGoalSwitch(true);
    } catch (e) { console.error('Load goals error:', e); }
  };

  const handleSwitchGoal = async (goalId) => {
    setSwitching(true);
    try {
      await userAPI.switchGoal(goalId);
      setShowGoalSwitch(false);
      navigate(location.pathname, { replace: true });
    } catch (e) { console.error('Switch goal error:', e); }
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

  const handleCustomScenario = () => {
    if (isPro) navigate('/goal-setting?mode=custom');
    else setShowUpgradeModal(true);
  };

  // ── 派生数据（useMemo 避免每次 render 重算） ──
  const enrichedScenarios = useMemo(() => scenarios.map((s, i) => {
    const pct = calcProgress(s);
    const unlocked = isScenarioUnlocked(i, scenarios, isPro);
    const cardState = getScenarioCardState(s, unlocked, pct);
    return { ...s, pct, unlocked, cardState, difficulty: getDifficulty(i), emoji: getEmoji(s.title), index: i };
  }), [scenarios, isPro]);

  const todayRecommended = useMemo(() => enrichedScenarios.find(s => s.unlocked && s.pct < 100), [enrichedScenarios]);

  // 今日复述：从活跃场景中取第一个未完成任务作为复述句
  const recallTask = todayRecommended?.tasks?.find(t => t.status !== 'completed');
  const recallSentence = recallTask
    ? (typeof recallTask === 'object' ? (recallTask.text || recallTask.description || recallTask.title || '') : String(recallTask))
    : '';

  const overallProgress = useMemo(() => scenarios.length > 0
    ? Math.round(enrichedScenarios.filter(s => s.pct === 100).length / scenarios.length * 100)
    : 0, [enrichedScenarios, scenarios.length]);

  const filteredScenarios = useMemo(() => enrichedScenarios.filter(s => {
    if (filterTab === 'all') return true;
    if (filterTab === 'in-progress') return s.unlocked && s.pct > 0 && s.pct < 100;
    if (filterTab === 'completed') return s.pct === 100;
    if (filterTab === 'not-started') return s.unlocked && s.pct === 0;
    return true;
  }), [enrichedScenarios, filterTab]);

  const userName = user?.username || user?.name || '学习者';
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return '早上好';
    if (h < 18) return '下午好';
    return '晚上好';
  })();

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

      {/* ── 成就 Modal ── */}
      {showAchievement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-sm w-full text-center shadow-brand-lg">
            <div className="text-7xl mb-3">🏆</div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">目标全部完成！</h2>
            <p className="text-sm text-primary font-semibold mb-2">Achievement Unlocked</p>
            <p className="text-slate-500 text-sm mb-6">
              太棒了！你已完成所有 {scenarios.length} 个场景，成功达到{' '}
              <span className="font-bold text-primary">{activeGoal?.target_level}</span> 水平目标！
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowAchievement(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm">
                稍后再说
              </button>
              <button onClick={() => { setShowAchievement(false); navigate('/goal-setting'); }}
                className="flex-1 py-3 rounded-xl text-white font-medium text-sm"
                style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}>
                制定新目标
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── 目标切换 Modal ── */}
      {showGoalSwitch && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => setShowGoalSwitch(false)}>
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="bg-white dark:bg-slate-800 rounded-t-3xl w-full max-w-lg p-5 pb-8 max-h-[70vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">切换学习目标</h3>
            {allGoals.filter(g => g.status !== 'active').map(goal => (
              <button key={goal.id} onClick={() => handleSwitchGoal(goal.id)} disabled={switching}
                className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-primary/40 hover:bg-slate-50 transition mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{goal.target_language}</p>
                  <p className="text-xs text-slate-500">{goal.target_level} · {new Date(goal.created_at).toLocaleDateString('zh-CN')}</p>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {goal.current_proficiency || 0}%
                </span>
              </button>
            ))}
            {allGoals.filter(g => g.status !== 'active').length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">暂无其他学习目标</p>
            )}
          </motion.div>
        </div>
      )}

      {/* ── 升级 Pro Modal ── */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowUpgradeModal(false)}>
          <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-slate-800 rounded-3xl p-7 max-w-sm w-full text-center shadow-xl"
            onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-4">👑</div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">升级 Pro 解锁全部功能</h2>
            <ul className="text-sm text-slate-500 text-left mb-6 space-y-2">
              {['解锁全部 10 个场景（免费仅3个）', '自定义场景创建', '提前解锁高难度场景', '定制 AI 导师音色', '优先访问新功能'].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-yellow-500">★</span> {f}
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button onClick={() => setShowUpgradeModal(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 font-medium text-sm">
                稍后再说
              </button>
              <button onClick={() => { setShowUpgradeModal(false); navigate('/subscription'); }}
                className="flex-1 py-3 rounded-xl text-white font-semibold text-sm"
                style={{ background: 'linear-gradient(135deg, #F6B443, #F97316)' }}>
                立即升级
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-5 pt-5 pb-2">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{greeting}，</p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
            {userName} {isPro && <span className="text-xs align-middle bg-yellow-100 text-yellow-600 px-1.5 py-0.5 rounded-full font-semibold ml-1">Pro</span>}
          </h1>
          {/* 目标总进度 */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 rounded-full bg-slate-200 overflow-hidden" style={{ width: 100 }}>
              <div className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${overallProgress}%` }} />
            </div>
            <span className="text-xs text-slate-400">{overallProgress}% 完成</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasOtherGoals && (
            <button onClick={handleOpenSwitch}
              className="text-xs text-slate-500 hover:text-primary transition px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              ⇄ 切换目标
            </button>
          )}
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}>
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <main className="flex-grow pb-28 space-y-5 px-4 pt-2">

        {/* ── 连续学习进度环 ── */}
        <StreakRing
          streak={checkinStats.currentStreak}
          monthlyTarget={30}
          checkedInToday={checkinStats.checkedInToday}
          onCheckin={handleCheckin}
        />

        {/* ── 4格统计 ── */}
        {stats && (
          <div className="grid grid-cols-4 gap-2">
            <div className="flex flex-col items-center gap-1 bg-white dark:bg-slate-800 rounded-2xl p-3 shadow-sm">
              <span className="text-xl">📚</span>
              <span className="text-base font-bold text-slate-900 dark:text-white">{stats.totalSessions || 0}</span>
              <span className="text-xs text-slate-400 text-center leading-tight">总对话</span>
            </div>
            <div className="flex flex-col items-center gap-1 bg-white dark:bg-slate-800 rounded-2xl p-3 shadow-sm">
              <span className="text-xl">📅</span>
              <span className="text-base font-bold text-slate-900 dark:text-white">{stats.learningDays || 0}</span>
              <span className="text-xs text-slate-400 text-center leading-tight">学习天</span>
            </div>
            <div className="flex flex-col items-center gap-1 bg-white dark:bg-slate-800 rounded-2xl p-3 shadow-sm">
              <span className="text-xl">✅</span>
              <span className="text-base font-bold text-slate-900 dark:text-white">
                {enrichedScenarios.filter(s => s.pct === 100).length}/{scenarios.length}
              </span>
              <span className="text-xs text-slate-400 text-center leading-tight">场景完成</span>
            </div>
            <div className="flex flex-col items-center gap-1 bg-white dark:bg-slate-800 rounded-2xl p-3 shadow-sm">
              <span className="text-xl">🎯</span>
              <span className="text-base font-bold text-slate-900 dark:text-white">{overallProgress}%</span>
              <span className="text-xs text-slate-400 text-center leading-tight">总进度</span>
            </div>
          </div>
        )}

        {/* ── 今日复述 ── */}
        {todayRecommended && recallSentence && (
          <section>
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">今日复述</h2>
            <div className="rounded-2xl p-4 relative overflow-hidden"
              style={{ background: 'rgba(99,127,241,0.07)', border: '1.5px solid rgba(99,127,241,0.18)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm mb-1">今日复述练习</h3>
                  <p className="text-xs text-slate-500 mb-3 leading-snug line-clamp-2">
                    {recallSentence}
                  </p>
                  <button
                    onClick={() => navigate(
                      `/conversation?scenario=${encodeURIComponent(todayRecommended.scenarioKey || todayRecommended.title)}&mode=recall`,
                      { state: { tasks: todayRecommended.tasks, emoji: todayRecommended.emoji } }
                    )}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white transition-all active:scale-95"
                    style={{ background: '#637FF1' }}>
                    ▶ 开始练习
                  </button>
                </div>
                <span className="text-4xl flex-shrink-0">🎯</span>
              </div>
            </div>
          </section>
        )}

        {/* ── 场景完成 Banner ── */}
        {overallProgress === 100 && (
          <motion.div whileHover={{ scale: 1.01 }} onClick={() => navigate('/goal-setting')}
            className="flex items-center gap-3 border-2 border-yellow-400/60 rounded-2xl p-4 cursor-pointer"
            style={{ background: 'rgba(251,191,36,0.08)' }}>
            <Trophy className="w-7 h-7 text-yellow-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">所有场景已完成！</p>
              <p className="text-xs text-slate-500">点击制定下一阶段新目标 →</p>
            </div>
          </motion.div>
        )}

        {/* ── 场景轮播 ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">场景练习</h2>
              {activeGoal && (
                <p className="text-xs text-slate-400">{activeGoal.target_language} · {activeGoal.target_level}</p>
              )}
            </div>
            <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
              {scenarios.length} 个场景
            </span>
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 mb-3 scrollbar-hide">
            {FILTER_TABS.map(tab => (
              <button key={tab.id} onClick={() => setFilterTab(tab.id)}
                className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: filterTab === tab.id ? '#637FF1' : '#F3F4F6',
                  color: filterTab === tab.id ? '#fff' : '#6B7280',
                }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* 2列网格卡片 */}
          <div className="grid grid-cols-2 gap-3">
            {filteredScenarios.map((s) => (
              <ScenarioCard
                key={s.index}
                title={s.title}
                emoji={s.emoji}
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
                onStart={() => handleScenarioClick(s)}
              />
            ))}
          </div>

          {filteredScenarios.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-6">
              {filterTab === 'in-progress' ? '暂无进行中的场景' :
               filterTab === 'completed' ? '还没有完成的场景，加油！' : '暂无符合条件的场景'}
            </p>
          )}
        </section>

        {/* ── 最近活动 ── */}
        {activeSessions.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">最近活动</h2>
            <div className="space-y-2">
              {activeSessions.slice(0, 3).map((session, idx) => {
                const score = session.score || session.avg_score;
                const badgeLabel = score >= 90 ? '优秀' : score >= 75 ? '良好' : score ? '继续加油' : null;
                const badgeColor = score >= 90 ? '#10B981' : score >= 75 ? '#637FF1' : '#9CA3AF';
                return (
                  <div key={session.sessionId || idx}
                    className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-sm">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                      style={{ background: '#F3F4F6' }}>
                      🗣️
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {session.topic || '自由对话'}
                      </p>
                      <p className="text-xs text-slate-400">
                        {session.createdAt ? new Date(session.createdAt).toLocaleDateString('zh-CN') : ''}
                        {score ? ` · 得分 ${score}` : ''}
                      </p>
                    </div>
                    {badgeLabel && (
                      <span className="text-xs px-2 py-0.5 rounded-full text-white flex-shrink-0"
                        style={{ backgroundColor: badgeColor }}>
                        {badgeLabel}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <BottomNav currentPage="home" />
    </div>
  );
}

export default Discovery;
