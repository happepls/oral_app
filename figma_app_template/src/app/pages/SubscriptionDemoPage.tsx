import { useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { SubscriptionModal } from "../components/SubscriptionModal";
import { Sparkles, Lock } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

/**
 * Demo page showing how to integrate SubscriptionModal
 * This demonstrates the flow when a user hits their free tier limit
 */
export function SubscriptionDemoPage() {
  const tokens = designTokens.global;
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [conversationCount, setConversationCount] = useState(0);

  const FREE_TIER_LIMIT = 5;

  const handleStartConversation = () => {
    if (conversationCount >= FREE_TIER_LIMIT) {
      // Show subscription modal when limit is reached
      setShowModal(true);
    } else {
      // Allow conversation
      setConversationCount((prev) => prev + 1);
      alert(`对话 ${conversationCount + 1} 开始！还剩 ${FREE_TIER_LIMIT - conversationCount - 1} 次免费练习。`);
    }
  };

  const handleUpgrade = () => {
    setShowModal(false);
    navigate("/subscription");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 pt-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-6"
          >
            <Sparkles className="w-4 h-4" />
            订阅限制演示
          </motion.div>

          <h1 className="text-4xl font-bold text-white mb-4">
            免费额度管理示例
          </h1>
          <p className="text-xl text-gray-400">
            演示当用户达到免费额度限制时的交互流程
          </p>
        </div>

        {/* Usage Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-3xl p-8 mb-8"
        >
          <h2 className="text-2xl font-semibold text-white mb-6">今日使用情况</h2>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-300">对话练习次数</span>
              <span className="text-white font-semibold">
                {conversationCount}/{FREE_TIER_LIMIT}
              </span>
            </div>
            <div className="relative w-full h-4 bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(conversationCount / FREE_TIER_LIMIT) * 100}%` }}
                className="absolute left-0 top-0 h-full rounded-full"
                style={{
                  background: conversationCount >= FREE_TIER_LIMIT
                    ? "linear-gradient(to right, #ef4444, #dc2626)"
                    : `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
                }}
              />
            </div>
          </div>

          {/* Status */}
          {conversationCount >= FREE_TIER_LIMIT ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex items-start gap-4">
              <Lock className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-red-400 mb-1">
                  已达今日免费额度
                </h3>
                <p className="text-gray-300 text-sm">
                  升级到 Premium 解锁无限练习，继续你的学习之旅
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 flex items-start gap-4">
              <Sparkles className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-green-400 mb-1">
                  还有 {FREE_TIER_LIMIT - conversationCount} 次免费练习
                </h3>
                <p className="text-gray-300 text-sm">
                  升级到 Premium 即可享受无限次数练习
                </p>
              </div>
            </div>
          )}
        </motion.div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleStartConversation}
            className="py-4 rounded-xl text-white font-semibold text-lg shadow-lg"
            style={{
              background: conversationCount >= FREE_TIER_LIMIT
                ? "#475569"
                : `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
            }}
          >
            {conversationCount >= FREE_TIER_LIMIT ? "开始对话（已达限制）" : "开始对话"}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/subscription")}
            className="py-4 rounded-xl bg-slate-700 text-white font-semibold text-lg hover:bg-slate-600 transition-colors"
          >
            查看订阅方案
          </motion.button>
        </div>

        {/* Instructions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8"
        >
          <h3 className="text-xl font-semibold text-white mb-4">💡 集成说明</h3>
          <div className="space-y-3 text-gray-300 text-sm">
            <p>
              <strong className="text-white">1. 使用场景：</strong>
              当用户达到免费额度限制时（如每日5次对话），自动弹出订阅引导弹窗
            </p>
            <p>
              <strong className="text-white">2. 组件使用：</strong>
              导入 SubscriptionModal 组件并传入使用数据
            </p>
            <pre className="bg-slate-900 p-4 rounded-lg overflow-x-auto mt-2">
              <code className="text-indigo-300">{`import { SubscriptionModal } from './components/SubscriptionModal';

const [showModal, setShowModal] = useState(false);

<SubscriptionModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onUpgrade={() => navigate('/subscription')}
  usageData={{
    used: 5,
    limit: 5,
    resource: "对话练习"
  }}
/>`}</code>
            </pre>
            <p>
              <strong className="text-white">3. 后端集成：</strong>
              配合 /src/app/utils/stripe.ts 中的工具函数处理 Stripe 支付
            </p>
            <p>
              <strong className="text-white">4. 重置机制：</strong>
              在生产环境中，免费额度应每日零点重置（通过后端定时任务实现）
            </p>
          </div>
        </motion.div>

        {/* Reset Button (Demo Only) */}
        <div className="text-center mt-8">
          <button
            onClick={() => setConversationCount(0)}
            className="text-sm text-gray-500 hover:text-gray-400 underline"
          >
            重置计数器（仅演示）
          </button>
        </div>
      </div>

      {/* Subscription Modal */}
      <SubscriptionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onUpgrade={handleUpgrade}
        usageData={{
          used: conversationCount,
          limit: FREE_TIER_LIMIT,
          resource: "对话练习",
        }}
      />
    </div>
  );
}
