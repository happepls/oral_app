import { motion } from "motion/react";
import designTokens from "../../imports/design-tokens.json";

interface ActivityItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  time: string;
  iconColor?: string;
}

export function ActivityItem({ icon, title, description, time, iconColor }: ActivityItemProps) {
  const tokens = designTokens.global;

  return (
    <motion.div
      whileHover={{ borderColor: tokens.color.primary.value }}
      className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4 transition-colors cursor-pointer"
      style={{
        borderRadius: tokens.radius.md.value,
      }}
    >
      {/* Icon */}
      <div
        className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: iconColor || tokens.color["primary-light"].value,
        }}
      >
        <div style={{ color: iconColor ? "#FFFFFF" : tokens.color.primary.value }}>
          {icon}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-gray-900 mb-0.5">{title}</h4>
        <p className="text-xs text-gray-500 truncate">{description}</p>
      </div>

      {/* Time */}
      <div className="text-xs text-gray-400 flex-shrink-0">{time}</div>
    </motion.div>
  );
}
