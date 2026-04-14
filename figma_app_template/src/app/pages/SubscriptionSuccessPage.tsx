import { motion } from "motion/react";
import { CheckCircle, Sparkles, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import designTokens from "../../imports/design-tokens.json";

export function SubscriptionSuccessPage() {
  const tokens = designTokens.global;
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring" }}
        className="max-w-2xl w-full"
      >
        {/* Success Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-3xl p-12 text-center">
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.2 }}
            className="inline-flex p-6 rounded-full mb-6"
            style={{
              background: `linear-gradient(135deg, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
            }}
          >
            <CheckCircle className="w-16 h-16 text-white" />
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl font-bold text-white mb-4"
          >
            订阅成功！🎉
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-xl text-gray-300 mb-8"
          >
            欢迎加入 Oral AI Premium 会员！现在你可以享受无限对话练习和所有高级功能。
          </motion.p>

          {/* Premium Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-slate-900/50 rounded-2xl p-8 mb-8"
          >
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5" style={{ color: tokens.color.primary.value }} />
              你现在可以享受
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              {[
                "✅ 无限对话练习",
                "✅ 所有场景解锁",
                "✅ AI 实时纠错",
                "✅ 个性化学习建议",
                "✅ 离线模式",
                "✅ 优先客服支持",
              ].map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + index * 0.05 }}
                  className="flex items-center gap-3"
                >
                  <span className="text-gray-300">{feature}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Next Steps */}
          <div className="space-y-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/home")}
              className="w-full py-4 rounded-xl text-white font-semibold text-lg shadow-lg flex items-center justify-center gap-2"
              style={{
                background: `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
              }}
            >
              开始练习
              <ArrowRight className="w-5 h-5" />
            </motion.button>

            <button
              onClick={() => navigate("/profile-mockup")}
              className="w-full py-3 rounded-xl text-gray-400 font-medium hover:text-white transition-colors"
            >
              查看订阅详情
            </button>
          </div>

          {/* Email Confirmation */}
          <p className="text-sm text-gray-500 mt-8">
            📧 订阅确认邮件已发送到你的邮箱
          </p>
        </div>

        {/* Help Text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center mt-6 text-sm text-gray-500"
        >
          有任何问题？请访问{" "}
          <button
            onClick={() => navigate("/help")}
            className="text-indigo-400 hover:text-indigo-300 underline"
          >
            帮助中心
          </button>
          {" "}或联系客服
        </motion.div>
      </motion.div>
    </div>
  );
}
