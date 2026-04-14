import { motion } from "motion/react";
import { Check } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

interface Level {
  id: string;
  name: string;
  description: string;
  emoji: string;
}

interface LevelSelectorProps {
  title?: string;
  subtitle?: string;
  selectedLevel?: string;
  defaultLevel?: string;
  onChange?: (levelId: string) => void;
}

const levels: Level[] = [
  {
    id: "beginner",
    name: "初级 (A1-A2)",
    description: "刚开始学习，掌握基础词汇和简单对话",
    emoji: "🌱",
  },
  {
    id: "intermediate",
    name: "中级 (B1-B2)",
    description: "能进行日常对话，理解常用表达",
    emoji: "🌿",
  },
  {
    id: "advanced",
    name: "高级 (C1-C2)",
    description: "流利交流，能应对复杂场景",
    emoji: "🌳",
  },
  {
    id: "native",
    name: "母语级别",
    description: "接近母语水平，追求完美表达",
    emoji: "🏆",
  },
];

export function LevelSelector({
  title = "目标水平",
  subtitle = "你希望达到的语言水平",
  selectedLevel = "intermediate",
  defaultLevel = "intermediate",
  onChange,
}: LevelSelectorProps) {
  const tokens = designTokens.global;
  const activeLevel = selectedLevel || defaultLevel;

  return (
    <div className="w-full">
      <div className="mb-6">
        <h3 className="text-2xl font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {levels.map((level) => {
          const isSelected = activeLevel === level.id;
          
          return (
            <motion.button
              key={level.id}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onChange?.(level.id)}
              className="relative p-6 rounded-2xl border-2 transition-all text-left"
              style={{
                borderColor: isSelected ? tokens.color.primary.value : "#e5e7eb",
                backgroundColor: isSelected ? `${tokens.color.primary.value}08` : "white",
              }}
            >
              {/* Selection Indicator */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: tokens.color.primary.value }}
                >
                  <Check className="w-4 h-4 text-white" />
                </motion.div>
              )}

              {/* Emoji */}
              <div className="text-4xl mb-3">{level.emoji}</div>

              {/* Level Info */}
              <h4 className="font-semibold text-gray-900 mb-1">{level.name}</h4>
              <p className="text-sm text-gray-500 leading-relaxed">{level.description}</p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}