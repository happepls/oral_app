import { motion } from "motion/react";
import designTokens from "../../imports/design-tokens.json";

interface ChartBarProps {
  value: number;
  maxValue?: number;
  label: string;
  dayLabel: string;
  state?: "default" | "highlight" | "today";
}

export function ChartBar({ value, maxValue = 100, label, dayLabel, state = "default" }: ChartBarProps) {
  const tokens = designTokens.global;
  const heightPercentage = (value / maxValue) * 100;

  const getBarStyle = () => {
    switch (state) {
      case "highlight":
        return {
          background: `linear-gradient(to top, ${tokens.color.success.value}, ${tokens.color.success.value}dd)`,
        };
      case "today":
        return {
          background: "transparent",
          border: `2px dashed ${tokens.color.primary.value}`,
        };
      default:
        return {
          background: `linear-gradient(to top, ${tokens.color.primary.value}, ${tokens.color["primary-light"].value})`,
        };
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Value Label */}
      <div className="text-xs font-medium text-gray-700">{label}</div>

      {/* Bar Container */}
      <div className="relative w-12 h-32 bg-gray-100 rounded-t-lg overflow-hidden">
        {/* Bar Fill */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 rounded-t-lg"
          style={{
            ...getBarStyle(),
            borderRadius: tokens.radius.sm.value,
          }}
          initial={{ height: 0 }}
          animate={{ height: `${heightPercentage}%` }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        />
      </div>

      {/* Day Label */}
      <div className="text-xs text-gray-500">{dayLabel}</div>
    </div>
  );
}
