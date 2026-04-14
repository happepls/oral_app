import { motion } from "motion/react";
import { Check, Sparkles } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

export interface PricingPlan {
  id: string;
  name: string;
  price: number;
  period: "free" | "week" | "year";
  description: string;
  features: string[];
  popular?: boolean;
  savings?: string;
}

interface PricingCardProps {
  plan: PricingPlan;
  onSelect: (planId: string) => void;
  isLoading?: boolean;
}

export function PricingCard({ plan, onSelect, isLoading }: PricingCardProps) {
  const tokens = designTokens.global;

  const getPeriodText = () => {
    switch (plan.period) {
      case "free":
        return "永久免费";
      case "week":
        return "每周";
      case "year":
        return "每年";
    }
  };

  const getButtonText = () => {
    if (plan.period === "free") return "当前方案";
    return plan.popular ? "立即订阅" : "选择方案";
  };

  return (
    <motion.div
      whileHover={{ y: -8, scale: 1.02 }}
      className={`relative rounded-3xl p-8 transition-all ${
        plan.popular
          ? "bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 shadow-2xl scale-105"
          : "bg-slate-800/50 backdrop-blur-xl border-2 border-slate-700/50"
      }`}
      style={{
        ...(plan.popular && {
          boxShadow: `0 20px 60px ${tokens.color.primary.value}40`,
        }),
      }}
    >
      {/* Popular Badge */}
      {plan.popular && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full text-sm font-semibold text-white flex items-center gap-2"
          style={{
            background: `linear-gradient(to right, ${tokens.color.secondary.value}, ${tokens.color.primary.value})`,
          }}
        >
          <Sparkles className="w-4 h-4" />
          最受欢迎
        </motion.div>
      )}

      {/* Plan Name */}
      <h3
        className={`text-2xl font-bold mb-2 ${
          plan.popular ? "text-white" : "text-white"
        }`}
      >
        {plan.name}
      </h3>

      {/* Description */}
      <p
        className={`text-sm mb-6 ${
          plan.popular ? "text-indigo-100" : "text-gray-400"
        }`}
      >
        {plan.description}
      </p>

      {/* Price */}
      <div className="mb-8">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-5xl font-bold ${
              plan.popular ? "text-white" : "text-white"
            }`}
          >
            ${plan.price}
          </span>
          <span
            className={`text-lg ${
              plan.popular ? "text-indigo-200" : "text-gray-500"
            }`}
          >
            {getPeriodText()}
          </span>
        </div>
        {plan.savings && (
          <p className="mt-2 text-sm font-medium text-green-400">
            {plan.savings}
          </p>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-4 mb-8">
        {plan.features.map((feature, index) => (
          <motion.li
            key={index}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-start gap-3"
          >
            <div
              className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                plan.popular ? "bg-white/20" : "bg-indigo-500/20"
              }`}
            >
              <Check
                className={`w-3 h-3 ${
                  plan.popular ? "text-white" : "text-indigo-400"
                }`}
              />
            </div>
            <span
              className={`text-sm leading-relaxed ${
                plan.popular ? "text-indigo-50" : "text-gray-300"
              }`}
            >
              {feature}
            </span>
          </motion.li>
        ))}
      </ul>

      {/* CTA Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onSelect(plan.id)}
        disabled={isLoading || plan.period === "free"}
        className={`w-full py-4 rounded-xl font-semibold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          plan.popular
            ? "bg-white text-indigo-600 shadow-lg hover:shadow-xl"
            : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
        }`}
      >
        {isLoading ? "处理中..." : getButtonText()}
      </motion.button>
    </motion.div>
  );
}
