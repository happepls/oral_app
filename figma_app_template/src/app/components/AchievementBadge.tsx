import { motion } from "motion/react";
import { Lock } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

interface AchievementBadgeProps {
  icon: string;
  name: string;
  state?: "locked" | "unlocked";
  date?: string;
}

export function AchievementBadge({ icon, name, state = "locked", date }: AchievementBadgeProps) {
  const tokens = designTokens.global;
  const isLocked = state === "locked";

  return (
    <motion.div
      whileHover={!isLocked ? { scale: 1.05 } : {}}
      className="relative bg-white border rounded-xl p-4 flex flex-col items-center gap-2 transition-all"
      style={{
        borderRadius: tokens.radius.md.value,
        borderColor: isLocked ? "#E5E7EB" : tokens.color.warning.value,
        borderWidth: "1px",
        opacity: isLocked ? 0.5 : 1,
        background: isLocked
          ? "#FFFFFF"
          : `linear-gradient(135deg, ${tokens.color.warning.value}15, ${tokens.color.secondary.value}15)`,
        filter: isLocked ? "grayscale(1)" : "none",
      }}
    >
      {/* Lock Overlay */}
      {isLocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/5 backdrop-blur-[1px] rounded-xl">
          <Lock className="w-6 h-6 text-gray-400" />
        </div>
      )}

      {/* Icon */}
      <div className="text-3xl">{icon}</div>

      {/* Name */}
      <div className="text-xs font-medium text-gray-700 text-center">{name}</div>

      {/* Date */}
      {!isLocked && date && (
        <div className="text-[10px] text-gray-500">{date}</div>
      )}
    </motion.div>
  );
}
