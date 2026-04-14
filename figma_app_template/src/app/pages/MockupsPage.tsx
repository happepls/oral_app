// @ts-ignore
import { useState } from "react";
import { MessageBubble } from "../components/MessageBubble";
import { VoiceRecorder } from "../components/VoiceRecorder";
import { ScenarioCard } from "../components/ScenarioCard";
import { InlineMicButton } from "../components/InlineMicButton";
import { UserCard } from "../components/UserCard";
import { SectionHeader } from "../components/SectionHeader";
import { GoalSet } from "../components/GoalSet";
import { VoiceSet } from "../components/VoiceSet";
import { 
  Home, 
  MessageSquare, 
  Book, 
  User, 
  ArrowLeft, 
  Target, 
  Volume2, 
  TrendingUp,
  Bell
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
// @ts-ignore
import designTokens from "../../imports/design-tokens.json";

type MobileScreen = "home" | "chat" | "scenarios" | "voice";

export function MockupsPage() {
  const [mobileScreen, setMobileScreen] = useState<MobileScreen>("home");
  const [selectedScenario, setSelectedScenario] = useState<number | null>(null);
  const [messages, setMessages] = useState([
    {
      type: "ai" as const,
      message: "Good morning! How can I help you today?",
      timestamp: "10:28 AM",
      state: "default" as const,
    },
    {
      type: "user" as const,
      message: "I need to check in for my flight.",
      timestamp: "10:29 AM",
      state: "default" as const,
    },
    {
      type: "ai" as const,
      message: "Of course! May I see your passport and booking reference, please?",
      timestamp: "10:29 AM",
      state: "default" as const,
    },
  ]);
  const [isAiThinking, setIsAiThinking] = useState(false);

  // Interactive Templates State
  const [selectedGoal, setSelectedGoal] = useState(10);
  const [selectedVoice, setSelectedVoice] = useState("voice-1");
  const [streakDays, setStreakDays] = useState(12);
  const [userLevel, setUserLevel] = useState("中级学员 · Lv.8");
  const [showNotification, setShowNotification] = useState(false);

  const tokens = designTokens.global;

  const scenarios = [
    {
      title: "机场办理登机",
      description: "学习如何在机场值机柜台办理登机手续",
      image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&q=80",
      duration: "15 分钟",
      difficulty: "beginner" as const,
      rating: 4.8,
      progress: 0,
    },
    {
      title: "餐厅点餐",
      description: "掌握在餐厅点餐的完整流程",
      image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&q=80",
      duration: "12 分钟",
      difficulty: "beginner" as const,
      rating: 4.9,
      progress: 75,
    },
    {
      title: "咖啡店点单",
      description: "学习如何在咖啡店点单和支付",
      image: "https://images.unsplash.com/photo-1511920170033-f8396924c348?w=400&q=80",
      duration: "10 分钟",
      difficulty: "beginner" as const,
      rating: 4.9,
      progress: 0,
    },
    {
      title: "医院就诊",
      description: "学习描述症状和理解医生建议",
      image: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=400&q=80",
      duration: "18 分钟",
      difficulty: "intermediate" as const,
      rating: 4.7,
      progress: 30,
    },
  ];

  const handleVoiceComplete = () => {
    const userMessage = {
      type: "user" as const,
      message: "Sure, here's my passport. My booking reference is ABC123.",
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      state: "default" as const,
    };
    setMessages([...messages, userMessage]);
    
    setIsAiThinking(true);
    
    setTimeout(() => {
      setIsAiThinking(false);
      const aiMessage = {
        type: "ai" as const,
        message: "Thank you! I've checked you in. Your seat is 12A. Would you like to check any bags?",
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        state: "default" as const,
      };
      setMessages(prev => [...prev, aiMessage]);
    }, 1500);
  };

  const renderMobileScreen = () => {
    return (
      <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border-8 border-gray-800 w-full max-w-sm mx-auto">
        <div className="bg-gray-900 text-white text-center py-2 text-xs">
          10:30 AM
        </div>

        <AnimatePresence mode="wait">
          {mobileScreen === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-6 text-white">
                <h2 className="text-2xl font-semibold mb-2">Oral AI</h2>
                <p className="text-blue-100">你的专属口语教练</p>
              </div>
              <div className="p-6 space-y-4 min-h-[500px] bg-gray-50">
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-2">今日练习</h3>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>3 个场景</span>
                    <span className="text-blue-500 font-medium">45 分钟</span>
                  </div>
                </div>
                
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setMobileScreen("scenarios")}
                  className="w-full bg-white rounded-lg p-4 shadow-sm text-left hover:shadow-md transition-shadow"
                >
                  <h3 className="font-semibold text-gray-900 mb-3">推荐场景</h3>
                  <div className="space-y-3">
                    {scenarios.slice(0, 2).map((s, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-100 to-purple-100" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                          <p className="text-xs text-gray-500">{s.duration}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.button>
              </div>
              <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-around">
                <button className="flex flex-col items-center gap-1">
                  <Home className="w-6 h-6 text-blue-500" />
                  <span className="text-xs text-blue-500">首页</span>
                </button>
                <button 
                  onClick={() => setMobileScreen("scenarios")}
                  className="flex flex-col items-center gap-1"
                >
                  <Book className="w-6 h-6 text-gray-400" />
                  <span className="text-xs text-gray-400">练习</span>
                </button>
                <button 
                  onClick={() => setMobileScreen("chat")}
                  className="flex flex-col items-center gap-1"
                >
                  <MessageSquare className="w-6 h-6 text-gray-400" />
                  <span className="text-xs text-gray-400">对话</span>
                </button>
                <button className="flex flex-col items-center gap-1">
                  <User className="w-6 h-6 text-gray-400" />
                  <span className="text-xs text-gray-400">我的</span>
                </button>
              </div>
            </motion.div>
          )}

          {mobileScreen === "chat" && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="flex flex-col h-[600px]"
            >
              <div className="bg-[#1A1A1A] text-white p-4 flex items-center gap-3 h-14">
                <button onClick={() => setMobileScreen("home")}>
                  <ArrowLeft className="w-6 h-6 text-white" />
                </button>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold">AI 对话练习</h2>
                  <p className="text-sm text-gray-400">机场办理登机</p>
                </div>
              </div>
              
              <div className="flex-1 p-4 bg-gradient-to-b from-gray-50 to-gray-100 overflow-y-auto">
                <div className="flex flex-col gap-4 justify-end min-h-full">
                  {messages.map((msg, idx) => (
                    <MessageBubble key={idx} {...msg} />
                  ))}
                  {isAiThinking && (
                    <MessageBubble
                      type="ai"
                      message=""
                      state="loading"
                    />
                  )}
                </div>
              </div>
              
              <div className="bg-[#1A1A1A] p-4 pb-6">
                
                <div className="flex justify-center px-2">
                  <InlineMicButton onRecordingComplete={handleVoiceComplete} maxDuration={60} />
                </div>
              </div>
            </motion.div>
          )}

          {mobileScreen === "scenarios" && (
            <motion.div
              key="scenarios"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="flex flex-col h-[600px]"
            >
              <div className="bg-white border-b border-gray-200 p-4 flex items-center gap-3">
                <button onClick={() => setMobileScreen("home")}>
                  <ArrowLeft className="w-6 h-6 text-gray-600" />
                </button>
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">Choose a Scenario</h2>
                  <p className="text-sm text-gray-500 mt-1">选择你想练习的场景</p>
                </div>
              </div>
              
              <div className="flex-1 p-4 bg-gray-50 overflow-y-auto pb-12">
                <div className="grid grid-cols-1 gap-6">
                  {scenarios.map((scenario, index) => (
                    <motion.div
                      key={index}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <ScenarioCard
                        {...scenario}
                        state={selectedScenario === index ? "selected" : "default"}
                        onStart={() => {
                          setSelectedScenario(index);
                          setTimeout(() => {
                            setMobileScreen("chat");
                          }, 500);
                        }}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {mobileScreen === "voice" && (
            <motion.div
              key="voice"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col h-[600px]"
            >
              <div className="bg-white border-b border-gray-200 p-4 flex items-center gap-3">
                <button onClick={() => {
                  setMobileScreen("chat");
                  handleVoiceComplete();
                }}>
                  <ArrowLeft className="w-6 h-6 text-gray-600" />
                </button>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-gray-900">句子跟读</h2>
                  <p className="text-sm text-gray-500">请跟读下面的句子</p>
                </div>
              </div>
              
              <div className="p-6 bg-gradient-to-br from-blue-50 to-purple-50">
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl shadow-lg p-6 mb-6"
                  style={{ borderLeft: `4px solid ${tokens.color.primary.value}` }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: tokens.color["primary-light"].value }}
                    >
                      <span className="text-lg">📝</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-2">台词卡</h3>
                      <p className="text-gray-600 leading-relaxed">
                        "Good morning! May I see your passport and booking reference, please?"
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="px-2 py-1 bg-blue-50 rounded-full" style={{ color: tokens.color.primary.value }}>
                      机场场景
                    </span>
                    <span>•</span>
                    <span>中等难度</span>
                  </div>
                </motion.div>

                <div className="w-full">
                  <VoiceRecorder maxDuration={180} />
                </div>
              </div>
              <div className="bg-white border-t border-gray-200 p-4 space-y-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setMobileScreen("chat");
                    handleVoiceComplete();
                  }}
                  className="w-full py-3 bg-blue-500 text-white rounded-full font-medium"
                >
                  完成录音
                </motion.button>
                <button 
                  onClick={() => setMobileScreen("chat")}
                  className="w-full py-3 bg-gray-100 rounded-full text-sm text-gray-600"
                >
                  取消
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">📱 Mockups</h1>
        <p className="text-gray-600">完整的交互式原型展示 - 纯语音交互体验</p>
      </div>

      {/* Interactive Mobile Prototype */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">交互式移动端原型</h2>
        <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl p-8">
          <div className="mb-6 flex items-center justify-center gap-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setMobileScreen("home")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mobileScreen === "home" 
                  ? "bg-blue-500 text-white" 
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              首页
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setMobileScreen("scenarios")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mobileScreen === "scenarios" 
                  ? "bg-blue-500 text-white" 
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              场景选择
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setMobileScreen("chat")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mobileScreen === "chat" 
                  ? "bg-blue-500 text-white" 
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              对话页面
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setMobileScreen("voice")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mobileScreen === "voice" 
                  ? "bg-blue-500 text-white" 
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              语音录制
            </motion.button>
          </div>
          {renderMobileScreen()}
        </div>
      </section>

      {/* Interaction Guide */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">交互说明</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
              <span className="text-2xl">🎤</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">纯语音交互 (Voice Only)</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• 对话页面仅支持语音输入</li>
              <li>• 点击麦克风按钮开始录音</li>
              <li>• 录音完成后 AI 自动回复</li>
              <li>• 专注于口语练习体验</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mb-4">
              <span className="text-2xl">🖱️</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">悬停效果 (While Hovering)</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• 语音按钮悬停时放大</li>
              <li>• 卡片悬停时显示阴影</li>
              <li>• 场景卡片悬停时上移</li>
              <li>• 导航项悬停改变背景色</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <span className="text-2xl">✨</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">页面转场 (Smart Animate)</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• 页面切换使用滑动动画</li>
              <li>• 元素淡入淡出效果</li>
              <li>• 平滑的缩放过渡</li>
              <li>• 300ms 动画时长</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mb-4">
              <span className="text-2xl">⏱️</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">延迟操作 (After Delay)</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• AI 回复延迟 1.5 秒</li>
              <li>• 显示加载状态</li>
              <li>• 选择场景后自动跳转</li>
              <li>• 模拟真实交互体验</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">原型特性</h2>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3">实现的交互功能</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span><strong>纯语音交互：</strong>对话页面移除文字输入，专注于语音练习体验</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span><strong>多页面导航：</strong>首页、场景选择、对话、语音录制四个页面之间的流畅切换</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span><strong>语音对话流程：</strong>点击录音 → 语音输入 → AI 处理 → 语音回复</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span><strong>场景选择：</strong>点击场景卡片进入对话，支持选中状态显示</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span><strong>语音录制：</strong>完整的录音流程，包括录音、暂停、处理等状态</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span><strong>动画过渡：</strong>使用 Motion 实现平滑的页面转场和元素动画</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span><strong>视觉提示：</strong>清晰的语音交互引导，强调口语练习定位</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Divider */}
      <div className="my-16 border-t-2 border-gray-300" />

      {/* Interactive Templates Section */}
      <section>
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">🎭 页面模板交互原型</h1>
          <p className="text-gray-600">所有组件的交互状态、变体和动画效果演示</p>
        </div>

        {/* Notification Toast */}
        <AnimatePresence>
          {showNotification && (
            <motion.div
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className="fixed top-20 right-6 z-50 bg-white shadow-2xl rounded-2xl p-4 border border-gray-200"
            >
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${tokens.color.primary.value}15` }}
                >
                  <Bell className="w-5 h-5" style={{ color: tokens.color.primary.value }} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">操作成功</p>
                  <p className="text-sm text-gray-600">状态已更新</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* UserCard Interactive Variants */}
        <div className="mb-12">
          <SectionHeader
            title="1. UserCard 交互变体"
            subtitle="点击按钮切换不同状态"
            icon={<TrendingUp className="w-6 h-6" />}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">默认样式</h3>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setStreakDays(prev => prev + 1);
                    setShowNotification(true);
                    setTimeout(() => setShowNotification(false), 2000);
                  }}
                  className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
                >
                  连续天数 +1
                </motion.button>
              </div>
              <UserCard
                userName="学习者小明"
                userLevel={userLevel}
                streakDays={streakDays}
                variant="default"
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">紧凑样式</h3>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setUserLevel(prev => 
                      prev.includes("初级") ? "中级学员 · Lv.8" : "初级学员 · Lv.3"
                    );
                    setShowNotification(true);
                    setTimeout(() => setShowNotification(false), 2000);
                  }}
                  className="px-4 py-2 bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-600 transition-colors"
                >
                  切换等级
                </motion.button>
              </div>
              <UserCard
                userName="学习者小红"
                userLevel="初级学员 · Lv.3"
                streakDays={5}
                variant="compact"
              />
            </div>
          </div>
        </div>

        {/* GoalSet Interactive Demo */}
        <div className="mb-12">
          <SectionHeader
            title="2. GoalSet 交互演示"
            subtitle="实时响应用户选择，展示不同状态"
            icon={<Target className="w-6 h-6" />}
          />

          <div className="mt-6">
            <GoalSet
              title="设定每日练习目标"
              subtitle="选择适合你的每日学习时长"
              defaultValue={selectedGoal}
              onChange={(value) => {
                setSelectedGoal(value);
                setShowNotification(true);
                setTimeout(() => setShowNotification(false), 2000);
              }}
            />

            <motion.div
              key={selectedGoal}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mt-6 p-6 rounded-2xl"
              style={{
                background: `linear-gradient(135deg, ${tokens.color.primary.value}15, ${tokens.color.secondary.value}15)`,
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">当前选择</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {selectedGoal} 分钟/天
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600 mb-1">预计每周学习</p>
                  <p className="text-2xl font-bold" style={{ color: tokens.color.primary.value }}>
                    {selectedGoal * 7} 分钟
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* VoiceSet Interactive Demo */}
        <div className="mb-12">
          <SectionHeader
            title="3. VoiceSet 交互演示"
            subtitle="支持音色选择和试听交互"
            icon={<Volume2 className="w-6 h-6" />}
          />

          <div className="mt-6">
            <VoiceSet
              title="选择口语导师音色"
              subtitle="不同音色适合不同练习场景"
              defaultVoiceId={selectedVoice}
              onChange={(voiceId) => {
                setSelectedVoice(voiceId);
                setShowNotification(true);
                setTimeout(() => setShowNotification(false), 2000);
              }}
            />

            <motion.div
              key={selectedVoice}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="mt-6 p-6 bg-white border-2 rounded-2xl"
              style={{ borderColor: tokens.color.secondary.value }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
                  }}
                >
                  <Volume2 className="w-8 h-8 text-white" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">已选择音色</p>
                  <p className="text-2xl font-bold text-gray-900">{selectedVoice}</p>
                  <p className="text-sm text-gray-500 mt-1">点击播放按钮可以试听音色效果</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Interaction States Overview */}
        <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl p-8 text-white">
          <h2 className="text-3xl font-bold mb-6">🎯 交互状态总结</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: "默认状态", desc: "组件初始展示", icon: "⚪" },
              { label: "悬停状态", desc: "鼠标悬停效果", icon: "🔵" },
              { label: "激活状态", desc: "选中/点击效果", icon: "🟢" },
              { label: "动画过渡", desc: "流畅状态切换", icon: "✨" },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white/10 backdrop-blur-lg rounded-2xl p-6"
              >
                <div className="text-4xl mb-3">{item.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{item.label}</h3>
                <p className="text-sm text-white/80">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}