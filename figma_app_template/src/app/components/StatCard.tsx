import { motion } from "motion/react";
import { TrendingUp, TrendingDown } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  trend?: {
    direction: "up" | "down";
    value: string;
  };
  color?: string;
}

export function StatCard({ icon, value, label, trend, color }: StatCardProps) {
  const tokens = designTokens.global;

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="bg-white border border-gray-200 rounded-2xl p-5 relative"
      style={{
        borderRadius: tokens.radius.lg.value,
      }}
    >
      {/* Trend Badge */}
      {trend && (
        <div
          className="absolute top-4 right-4 px-2 py-1 rounded-full flex items-center gap-1 text-xs font-medium"
          style={{
            backgroundColor: trend.direction === "up" ? "#DCFCE7" : "#FEE2E2",
            color: trend.direction === "up" ? tokens.color.success.value : tokens.color.error.value,
          }}
        >
          {trend.direction === "up" ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          <span>{trend.value}</span>
        </div>
      )}

      {/* Icon */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{
          backgroundColor: color || tokens.color["primary-light"].value,
        }}
      >
        <div style={{ color: color ? "#FFFFFF" : tokens.color.primary.value }}>
          {icon}
        </div>
      </div>

      {/* Value */}
      <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>

      {/* Label */}
      <div className="text-sm text-gray-500">{label}</div>
    </motion.div>
  );
}
