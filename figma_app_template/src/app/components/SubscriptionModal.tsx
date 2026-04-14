import { motion, AnimatePresence } from "motion/react";
import { X, Zap, Sparkles, TrendingUp } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  usageData?: {
    used: number;
    limit: number;
    resource: string;
  };
}

export function SubscriptionModal({
  isOpen,
  onClose,
  onUpgrade,
  usageData = {
    used: 5,
    limit: 5,
    resource: "对话练习",
  },
}: SubscriptionModalProps) {
  const tokens = designTokens.global;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50"
          >
            <div className="mx-4 bg-slate-900 rounded-3xl shadow-2xl border border-slate-700 overflow-hidden">
              {/* Header with Gradient */}
              <div
                className="relative p-8 text-center"
                style={{
                  background: `linear-gradient(135deg, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
                }}
              >
                {/* Close Button */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>

                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="inline-flex p-4 rounded-full bg-white/20 mb-4"
                >
                  <Zap className="w-12 h-12 text-white" />
                </motion.div>

                <h2 className="text-3xl font-bold text-white mb-2">
                  免费额度已用完
                </h2>
                <p className="text-indigo-100">
                  升级到 Premium 解锁无限练习
                </p>
              </div>

              {/* Content */}
              <div className="p-8">
                {/* Usage Stats */}
                <div className="bg-slate-800/50 rounded-2xl p-6 mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-300">今日使用</span>
                    <span className="text-white font-semibold">
                      {usageData.used}/{usageData.limit} {usageData.resource}
                    </span>
                  </div>
                  <div className="relative w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(usageData.used / usageData.limit) * 100}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className="absolute left-0 top-0 h-full rounded-full"
                      style={{
                        background: `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
                      }}
                    />
                  </div>
                </div>

                {/* Premium Features */}
                <div className="space-y-3 mb-8">
                  <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
                    升级即可享受
                  </p>
                  {[
                    { icon: <Sparkles className="w-5 h-5" />, text: "无限对话练习，随时随地" },
                    { icon: <Zap className="w-5 h-5" />, text: "AI 实时纠错，快速进步" },
                    { icon: <TrendingUp className="w-5 h-5" />, text: "个性化学习建议" },
                  ].map((feature, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + index * 0.1 }}
                      className="flex items-center gap-3"
                    >
                      <div
                        className="flex-shrink-0 p-2 rounded-lg"
                        style={{ background: `${tokens.color.primary.value}20` }}
                      >
                        <div style={{ color: tokens.color.primary.value }}>
                          {feature.icon}
                        </div>
                      </div>
                      <span className="text-gray-200">{feature.text}</span>
                    </motion.div>
                  ))}
                </div>

                {/* Pricing */}
                <div className="bg-slate-800/50 rounded-2xl p-6 mb-6 text-center">
                  <div className="flex items-baseline justify-center gap-2 mb-2">
                    <span className="text-4xl font-bold text-white">$2.99</span>
                    <span className="text-gray-400">/周</span>
                  </div>
                  <p className="text-sm text-green-400 font-medium">
                    或选择年付 $89.90，节省超过 80%
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onUpgrade}
                    className="w-full py-4 rounded-xl text-white font-semibold text-lg shadow-lg"
                    style={{
                      background: `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
                    }}
                  >
                    立即升级 Premium
                  </motion.button>

                  <button
                    onClick={onClose}
                    className="w-full py-3 rounded-xl text-gray-400 font-medium hover:text-white transition-colors"
                  >
                    稍后再说
                  </button>
                </div>

                {/* Trust Badge */}
                <p className="text-center text-xs text-gray-500 mt-4">
                  🔒 安全支付 · 7天无理由退款 · 随时取消订阅
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}