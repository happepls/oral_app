import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Lock } from "lucide-react";
import designTokens from "../imports/design-tokens.json";

export function AiAvatar({
  imageUrl,
  name = "AI 导师",
  status = "idle",
  isPremium = false,
  showUpgradePrompt = false,
  onUpgradeClick,
}) {
  const tokens = designTokens.global;

  const statusConfig = {
    idle:      { color: tokens.color.primary.value,   text: "等待中" },
    listening: { color: tokens.color.success.value,   text: "聆听中" },
    speaking:  { color: tokens.color.secondary.value, text: "回应中" },
    thinking:  { color: tokens.color.warning.value,   text: "思考中" },
  };

  const currentStatus = statusConfig[status] || statusConfig.idle;

  return (
    <div className="relative h-full">
      {/* Premium Badge */}
      {isPremium && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-3 -right-3 z-20 bg-gradient-to-br from-yellow-400 to-orange-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-semibold">会员专享</span>
        </motion.div>
      )}

      {/* Main Container */}
      <div
        className="relative w-full h-full rounded-3xl overflow-hidden shadow-xl"
        style={{
          background: `linear-gradient(135deg, ${tokens.color["primary-light"].value}30, ${tokens.color.secondary.value}20)`,
        }}
      >
        {/* Upgrade Overlay */}
        <AnimatePresence>
          {showUpgradePrompt && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center p-8"
            >
              <motion.div
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="text-center"
              >
                <div
                  className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
                  style={{ backgroundColor: `${tokens.color.primary.value}20` }}
                >
                  <Lock className="w-10 h-10" style={{ color: tokens.color.primary.value }} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">解锁 AI 数字人</h3>
                <p className="text-gray-300 mb-8 leading-relaxed">
                  升级至付费会员，体验沉浸式 AI 数字人对话练习
                  <br />
                  支持 Keevx 个性化形象 + Qwen3.5-Omni 智能交互
                </p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onUpgradeClick}
                  className="px-8 py-4 rounded-2xl font-semibold text-white shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
                  }}
                >
                  立即升级会员
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Avatar Image / Placeholder */}
        <div className="relative w-full h-full">
          {imageUrl ? (
            <motion.div key={status} initial={{ opacity: 0.8 }} animate={{ opacity: 1 }} className="w-full h-full">
              <img
                src={imageUrl}
                alt={name}
                className="w-full h-full object-cover object-top"
                style={{ filter: showUpgradePrompt ? "blur(8px)" : "none" }}
              />
            </motion.div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                {/* Animated placeholder circle with status ring */}
                <div className="relative inline-flex items-center justify-center mb-4">
                  {/* Status pulse rings */}
                  {[0, 1].map((i) => (
                    <motion.div
                      key={i}
                      className="absolute rounded-full border-2"
                      style={{
                        width: "96px",
                        height: "96px",
                        borderColor: currentStatus.color,
                      }}
                      animate={{ scale: [1, 1.5, 2], opacity: [0.5, 0.2, 0] }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.7, ease: "easeOut" }}
                    />
                  ))}
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center relative z-10"
                    style={{ backgroundColor: `${currentStatus.color}18`, border: `2px solid ${currentStatus.color}40` }}
                  >
                    <Sparkles className="w-10 h-10" style={{ color: currentStatus.color }} />
                  </div>
                </div>
                <p className="text-gray-400 text-sm">{name}</p>
              </div>
            </div>
          )}

          {/* Status Indicator — shown always when not locked */}
          {!showUpgradePrompt && (
            <>
              {/* Animated Border Glow */}
              <motion.div
                className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%]"
                animate={{
                  boxShadow: [
                    `0 0 20px ${currentStatus.color}40`,
                    `0 0 40px ${currentStatus.color}60`,
                    `0 0 20px ${currentStatus.color}40`,
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <motion.div
                  key={status}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white/95 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-2xl"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <motion.div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: currentStatus.color }}
                        animate={{ scale: [1, 1.2, 1], opacity: [1, 0.6, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                      <span className="font-semibold text-gray-900 text-sm">{name}</span>
                    </div>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${currentStatus.color}15`,
                        color: currentStatus.color,
                      }}
                    >
                      {currentStatus.text}
                    </span>
                  </div>
                </motion.div>
              </motion.div>

              {/* Speaking wave */}
              {status === "speaking" && (
                <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-1 rounded-full"
                      style={{ backgroundColor: currentStatus.color }}
                      animate={{ height: ["12px", "28px", "12px"] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
                    />
                  ))}
                </div>
              )}

              {/* Thinking dots */}
              {status === "thinking" && (
                <div className="absolute top-10 right-8">
                  <div className="bg-white/95 backdrop-blur-sm rounded-2xl px-3 py-2 shadow-lg">
                    <div className="flex items-center gap-1.5">
                      {[...Array(3)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: currentStatus.color }}
                          animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Powered by Badge */}
      {!showUpgradePrompt && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="absolute -bottom-6 left-0 right-0 text-center"
        >
          <p className="text-xs text-gray-400">
            Powered by <span className="font-semibold text-gray-500">Keevx</span>{" "}
            ×{" "}
            <span className="font-semibold text-gray-500">Qwen3.5-Omni</span>
          </p>
        </motion.div>
      )}
    </div>
  );
}
