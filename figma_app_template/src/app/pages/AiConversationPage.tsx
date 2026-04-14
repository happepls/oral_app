import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Settings,
  User as UserIcon,
  Volume2,
  RotateCcw,
  MessageSquare,
} from "lucide-react";
import { MessageBubble } from "../components/MessageBubble";
import { InlineMicButton } from "../components/InlineMicButton";
import { AiAvatar } from "../components/AiAvatar";
import { AvatarSelector } from "../components/AvatarSelector";
import { NativeLanguageToggle } from "../components/NativeLanguageToggle";
import { TranslationHelper } from "../components/TranslationHelper";
import designTokens from "../../imports/design-tokens.json";

interface Message {
  type: "user" | "ai";
  message: string;
  timestamp?: string;
  state?: "default" | "loading" | "error";
  translation?: string;
  correction?: {
    text: string;
    highlights: Array<{ word: string; meaning: string }>;
  };
}

export function AiConversationPage() {
  const tokens = designTokens.global;

  // 用户订阅状态（实际应从后端获取）
  const [userSubscription] = useState<"free" | "weekly" | "yearly">("free");
  const userIsPremium = userSubscription !== "free";

  // 数字人状态
  const [avatarStatus, setAvatarStatus] = useState<"idle" | "listening" | "speaking" | "thinking">("idle");
  const [selectedAvatar, setSelectedAvatar] = useState<any>(null);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(!userIsPremium);

  // 对话状态
  const [messages, setMessages] = useState<Message[]>([
    {
      type: "ai",
      message: "Thank you. So, what would you like to talk about today? We can chat about hobbies, food, or even your weekend plans. Just let me know.",
      timestamp: "10:28 AM",
      translation: "谢谢。那么，你今天想聊什么？我们可以聊爱好、美食，甚至你的周末计划。告诉我吧。",
    },
  ]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [conversationCount, setConversationCount] = useState(0);

  // 母语辅助功能
  const [nativeLanguageEnabled, setNativeLanguageEnabled] = useState(false);
  const [userNativeLanguage] = useState("中文");

  // 场景信息
  const [currentScenario] = useState({
    title: "Daily Conversation",
    subtitle: "日常对话练习",
  });

  // 付费用户自动设置默认数字人
  useEffect(() => {
    if (userIsPremium && !selectedAvatar) {
      setSelectedAvatar({
        id: "avatar-1",
        name: "Emma",
        imageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&q=80",
        voice: "温柔女声",
        gender: "female",
      });
      setShowUpgradePrompt(false);
    }
  }, [userIsPremium, selectedAvatar]);

  const handleVoiceComplete = () => {
    // 模拟用户语音输入
    const userMessage: Message = {
      type: "user",
      message: "In cornegie watts. Emma dough desk",
      timestamp: new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setAvatarStatus("thinking");
    setIsAiThinking(true);

    // 模拟 AI 思考和回复
    setTimeout(() => {
      setIsAiThinking(false);
      setAvatarStatus("speaking");

      const aiMessage: Message = {
        type: "ai",
        message: "I'm sorry, I didn't quite catch that. Could you please repeat what you said more clearly? Maybe start with a simple topic, like telling me what you did today, and we can have a chat from there.",
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setMessages((prev) => [...prev, aiMessage]);

      // 语音播放结束后恢复空闲状态
      setTimeout(() => {
        setAvatarStatus("idle");
      }, 3000);
    }, 1500);

    setConversationCount((prev) => prev + 1);
  };

  const handleMicPress = () => {
    setAvatarStatus("listening");
  };

  const handleMicRelease = () => {
    setAvatarStatus("thinking");
  };

  const handleResetConversation = () => {
    setMessages([
      {
        type: "ai",
        message: "Thank you. So, what would you like to talk about today? We can chat about hobbies, food, or even your weekend plans. Just let me know.",
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);
    setAvatarStatus("idle");
    setConversationCount(0);
  };

  const handleUpgradeClick = () => {
    // 跳转到订阅页面
    window.location.href = "/subscription";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.history.back()}
              className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{currentScenario.title}</h1>
              <p className="text-sm text-gray-500">{currentScenario.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Conversation Stats */}
            <div className="px-4 py-2 bg-gray-100 rounded-full flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">
                {conversationCount} 轮对话
              </span>
            </div>

            {/* Reset Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleResetConversation}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">重新开始</span>
            </motion.button>

            {/* Avatar Settings */}
            {userIsPremium && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowAvatarSelector(true)}
                className="px-4 py-2 rounded-full flex items-center gap-2 text-white font-medium"
                style={{
                  background: `linear-gradient(135deg, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
                }}
              >
                <UserIcon className="w-4 h-4" />
                <span className="text-sm">更换数字人</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1800px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[calc(100vh-200px)]">
          {/* Left: Conversation Area */}
          <div className="flex flex-col h-full">
            {/* Messages Container */}
            <div className="flex-1 bg-white rounded-3xl shadow-lg p-6 overflow-y-auto mb-6">
              <div className="flex flex-col gap-6">
                {messages.map((msg, idx) => (
                  <MessageBubble key={idx} {...msg} />
                ))}
                {isAiThinking && <MessageBubble type="ai" message="" state="loading" />}
              </div>
            </div>

            {/* Voice Input Area */}
            <div
              className="bg-white rounded-3xl shadow-lg p-6"
              style={{
                borderTop: `4px solid ${tokens.color.primary.value}`,
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${tokens.color.primary.value}20` }}
                  >
                    <Volume2 className="w-5 h-5" style={{ color: tokens.color.primary.value }} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">语音输入</h3>
                    <p className="text-sm text-gray-500">长按麦克风说话</p>
                  </div>
                </div>

                {/* Quota Warning for Free Users */}
                {!userIsPremium && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="px-4 py-2 bg-orange-100 rounded-full"
                  >
                    <p className="text-xs font-medium text-orange-700">
                      免费版限 5 次/天
                    </p>
                  </motion.div>
                )}
              </div>

              <div className="flex justify-center">
                <InlineMicButton
                  onRecordingComplete={handleVoiceComplete}
                  onRecordingStart={handleMicPress}
                  onRecordingStop={handleMicRelease}
                  maxDuration={60}
                />
              </div>

              <p className="text-center text-xs text-gray-400 mt-4">
                由 Qwen3.5-Omni 提供智能交互支持
              </p>
            </div>
          </div>

          {/* Right: AI Avatar Area */}
          <div className="h-full flex flex-col gap-6">
            {/* Native Language Toggle */}
            <div className="bg-white rounded-2xl shadow-lg p-4">
              <NativeLanguageToggle
                nativeLanguage={userNativeLanguage}
                enabled={nativeLanguageEnabled}
                onChange={setNativeLanguageEnabled}
                variant="compact"
              />
            </div>

            <div className="flex-1 relative">
              <AiAvatar
                imageUrl={selectedAvatar?.imageUrl}
                name={selectedAvatar?.name || "AI 导师"}
                status={avatarStatus}
                isPremium={userIsPremium}
                showUpgradePrompt={showUpgradePrompt}
                onUpgradeClick={handleUpgradeClick}
              />
            </div>

            {/* Avatar Info Card */}
            {selectedAvatar && !showUpgradePrompt && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-12 bg-white rounded-2xl shadow-lg p-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg mb-1">
                      {selectedAvatar.name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">{selectedAvatar.voice}</p>
                    <div className="flex items-center gap-2">
                      <span
                        className="px-3 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${tokens.color.primary.value}15`,
                          color: tokens.color.primary.value,
                        }}
                      >
                        {selectedAvatar.gender === "female" ? "女声" : "男声"}
                      </span>
                      <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-700">
                        Keevx 数字人
                      </span>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowAvatarSelector(true)}
                    className="w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                  >
                    <Settings className="w-5 h-5 text-gray-600" />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Avatar Selector Modal */}
      <AvatarSelector
        isOpen={showAvatarSelector}
        onClose={() => setShowAvatarSelector(false)}
        onSelect={(avatar) => {
          setSelectedAvatar(avatar);
          setShowUpgradePrompt(false);
        }}
        selectedAvatarId={selectedAvatar?.id}
        userIsPremium={userIsPremium}
      />

      {/* Floating Help Tips */}
      <AnimatePresence>
        {conversationCount === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 left-8 max-w-sm"
          >
            <div
              className="bg-white rounded-2xl shadow-2xl p-6 border-2"
              style={{ borderColor: `${tokens.color.primary.value}40` }}
            >
              <h4 className="font-bold text-gray-900 mb-2">💡 使用提示</h4>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• 长按麦克风按钮开始说话</li>
                <li>• 松开按钮完成录音并发送</li>
                <li>• AI 数字人会实时响应你的语音</li>
                <li>• 观察数字人的状态变化获得反馈</li>
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}