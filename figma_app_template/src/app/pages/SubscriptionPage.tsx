import { useState } from "react";
import { motion } from "motion/react";
import { PricingCard, PricingPlan } from "../components/PricingCard";
import { Zap, Sparkles, Clock, Globe } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

export function SubscriptionPage() {
  const tokens = designTokens.global;
  const [isLoading, setIsLoading] = useState(false);

  const plans: PricingPlan[] = [
    {
      id: "free",
      name: "免费版",
      price: 0,
      period: "free",
      description: "开始你的语言学习之旅",
      features: [
        "每日 5 次对话练习",
        "基础场景（3个）",
        "基础发音评分",
        "学习进度追踪",
      ],
    },
    {
      id: "weekly",
      name: "周订阅",
      price: 2.99,
      period: "week",
      description: "灵活订阅，随时取消",
      features: [
        "无限对话练习",
        "所有场景解锁",
        "高级发音评分",
        "AI 实时纠错",
        "个性化学习建议",
        "离线模式",
      ],
      popular: true,
    },
    {
      id: "yearly",
      name: "年订阅",
      price: 89.90,
      period: "year",
      description: "最佳性价比，节省超过 80%",
      features: [
        "周订阅所有功能",
        "优先客服支持",
        "独家学习资源",
        "无限云端存储",
        "多设备同步",
        "终身更新",
      ],
      savings: "相当于每周 $1.73，节省 $66.58",
    },
  ];

  const handleSelectPlan = async (planId: string) => {
    if (planId === "free") return;

    setIsLoading(true);

    // Simulate Stripe checkout redirect
    // In production, this would call your backend to create a Stripe Checkout session
    try {
      console.log("Creating Stripe checkout session for plan:", planId);
      
      // Mock API call to backend
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // In production, redirect to Stripe Checkout:
      // const response = await fetch('/api/create-checkout-session', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ planId })
      // });
      // const { url } = await response.json();
      // window.location.href = url;

      alert(
        `Stripe 支付集成:\n\n在生产环境中，这里会跳转到 Stripe 支付页面。\n\n需要后端配置:\n1. 创建 Stripe 账户\n2. 设置 API 密钥\n3. 创建支付会话\n4. 处理 webhook 回调\n\n当前选择: ${plans.find((p) => p.id === planId)?.name}`
      );
    } catch (error) {
      console.error("Checkout error:", error);
      alert("支付出错，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: tokens.color.primary.value }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: tokens.color.secondary.value }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-20">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.1 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-6"
          >
            <Sparkles className="w-4 h-4" />
            AI 陪练升级中心
          </motion.div>

          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            24/7 AI口语导师
            <br />
            <span
              className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent"
            >
              随时练习，随时进步
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            在情境模拟中学习地道口语，Guoji AI陪伴你完成从零到流利的全过程，帮助你在实际对话中更自信。
          </p>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-20"
        >
          {[
            {
              icon: <Zap className="w-7 h-7" />,
              title: "实时反馈",
              description: "AI即时纠正发音，每句话都进步",
            },
            {
              icon: <Sparkles className="w-7 h-7" />,
              title: "个性化学习",
              description: "根据你的水平定制课程内容",
            },
            {
              icon: <Clock className="w-7 h-7" />,
              title: "24/7 无限练",
              description: "随时随地，想练就练",
            },
            {
              icon: <Globe className="w-7 h-7" />,
              title: "真实场景",
              description: "模拟机场、餐厅等真实对话场景",
            },
          ].map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
              className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 text-center hover:border-indigo-500/50 transition-all"
            >
              <div
                className="inline-flex p-3 rounded-2xl mb-4"
                style={{ background: `${tokens.color.primary.value}20` }}
              >
                <div style={{ color: tokens.color.primary.value }}>
                  {feature.icon}
                </div>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-400">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* User Testimonial */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl font-bold text-white mb-12">用户真实反馈</h2>
          <div className="max-w-2xl mx-auto bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8">
            <div className="text-5xl mb-4">👨</div>
            <p className="text-lg text-gray-300 italic mb-4">
              "学了两周去泰国旅游，用英语点单完全没压力，老板还夸我发音地道！"
            </p>
            <p className="text-sm font-medium" style={{ color: tokens.color.primary.value }}>
              @Sarah_traveler
            </p>
            <div className="flex justify-center gap-1 mt-3">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="text-yellow-400 text-xl">★</span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Pricing Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mb-16"
        >
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">
              简单透明的定价
            </h2>
            <p className="text-xl text-gray-400">
              选择适合你的订阅方案，开始AI口语之旅
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + index * 0.1 }}
              >
                <PricingCard
                  plan={plan}
                  onSelect={handleSelectPlan}
                  isLoading={isLoading}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* FAQ Teaser */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="text-center"
        >
          <h3 className="text-2xl font-bold text-white mb-4">
            准备好提升你的口语了吗？
          </h3>
          <p className="text-gray-400 mb-6">
            立即订阅，开始和AI一起成长，7天内不满意全额退款。
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleSelectPlan("weekly")}
            disabled={isLoading}
            className="px-12 py-4 rounded-2xl text-white text-lg font-semibold shadow-2xl"
            style={{
              background: `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
            }}
          >
            免费试用起步
          </motion.button>
        </motion.div>
      </div>

      {/* Stripe Integration Note */}
      <div className="fixed bottom-6 right-6 max-w-xs bg-slate-800/90 backdrop-blur-xl border border-slate-700 rounded-2xl p-4 text-xs text-gray-400">
        <p className="font-semibold text-white mb-1">💡 Stripe 集成说明</p>
        <p>
          当前为演示模式。生产环境需要配置 Stripe API 密钥和 Webhook。
        </p>
      </div>
    </div>
  );
}