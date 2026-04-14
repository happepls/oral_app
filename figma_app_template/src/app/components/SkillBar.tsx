import { motion } from "motion/react";
import designTokens from "../../imports/design-tokens.json";

interface SkillBarProps {
  skillName: string;
  score: number;
  maxScore?: number;
  showPercentage?: boolean;
}

export function SkillBar({ skillName, score, maxScore = 100, showPercentage = false }: SkillBarProps) {
  const tokens = designTokens.global;
  const percentage = (score / maxScore) * 100;

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl px-5 py-4"
      style={{
        borderRadius: tokens.radius.md.value,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-gray-700">{skillName}</div>
        <div
          className="text-sm font-semibold"
          style={{ color: tokens.color.primary.value }}
        >
          {showPercentage ? `${Math.round(percentage)}%` : `${score}/${maxScore}`}
        </div>
      </div>

      {/* Progress Bar */}
      <div
        className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"
        style={{ borderRadius: "4px" }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
