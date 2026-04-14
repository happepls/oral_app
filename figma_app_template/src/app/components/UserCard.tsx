import { motion } from "motion/react";
import { User, Flame } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";
import { animationConfig } from "../utils/animations";

interface UserCardProps {
  userName?: string;
  userLevel?: string;
  userAvatar?: string;
  streakDays?: number;
  variant?: "default" | "compact";
}

export function UserCard({
  userName = "学习者小明",
  userLevel = "中级学员 · Lv.8",
  userAvatar,
  streakDays = 12,
  variant = "default",
}: UserCardProps) {
  const tokens = designTokens.global;
  const isCompact = variant === "compact";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={animationConfig.pageTransition}
      className={`bg-white border border-gray-200 overflow-hidden ${
        isCompact ? "rounded-2xl p-6" : "rounded-3xl p-8"
      }`}
      style={{
        boxShadow: `0 ${tokens.shadow.y.value} ${tokens.shadow.blur.value} rgba(${tokens.shadow.color.value}, ${tokens.shadow.opacity.value})`,
      }}
    >
      <div className="flex items-center justify-between gap-6">
        {/* Left Side - User Info */}
        <div className="flex items-center gap-4 flex-1">
          {/* Avatar */}
          <div
            className={`${
              isCompact ? "w-16 h-16" : "w-20 h-20"
            } rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center overflow-hidden flex-shrink-0`}
          >
            {userAvatar ? (
              <img src={userAvatar} alt={userName} className="w-full h-full object-cover" />
            ) : (
              <User className={`${isCompact ? "w-8 h-8" : "w-10 h-10"} text-white`} />
            )}
          </div>

          {/* User Details */}
          <div className="flex-1 min-w-0">
            <h1 className={`${isCompact ? "text-xl" : "text-2xl"} font-semibold text-gray-900 mb-1`}>
              {userName}
            </h1>
            <p className="text-sm text-gray-500">{userLevel}</p>
          </div>
        </div>

        {/* Right Side - Streak Badge */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="flex items-center gap-2 px-5 py-3 rounded-full"
          style={{
            background: `linear-gradient(135deg, ${tokens.color.warning.value}, ${tokens.color.error.value})`,
          }}
        >
          <Flame className="w-5 h-5 text-white" />
          <div className="text-white">
            <div className="text-2xl font-bold leading-none">{streakDays}</div>
            <div className="text-xs opacity-90 mt-0.5">天连续</div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}