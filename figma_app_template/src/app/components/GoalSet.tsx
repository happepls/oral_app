import { useState } from "react";
import { motion } from "motion/react";
import { Target, CheckCircle2 } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";
import { animationConfig } from "../utils/animations";

interface GoalOption {
  value: number;
  label: string;
  description: string;
  icon?: string;
}

interface GoalSetProps {
  title?: string;
  subtitle?: string;
  options?: GoalOption[];
  defaultValue?: number;
  onChange?: (value: number) => void;
}

const defaultOptions: GoalOption[] = [
  { value: 5, label: "轻松模式", description: "每天 5 分钟", icon: "🌱" },
  { value: 10, label: "标准模式", description: "每天 10 分钟", icon: "⭐" },
  { value: 15, label: "进阶模式", description: "每天 15 分钟", icon: "🔥" },
  { value: 20, label: "挑战模式", description: "每天 20 分钟", icon: "💪" },
];

export function GoalSet({
  title = "设定每日练习目标",
  subtitle = "选择适合你的每日学习时长",
  options = defaultOptions,
  defaultValue = 10,
  onChange,
}: GoalSetProps) {
  const tokens = designTokens.global;
  const [selectedValue, setSelectedValue] = useState(defaultValue);

  const handleSelect = (value: number) => {
    setSelectedValue(value);
    onChange?.(value);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-3xl p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${tokens.color.primary.value}15` }}
        >
          <Target className="w-6 h-6" style={{ color: tokens.color.primary.value }} />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
      </div>

      {/* Options Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((option) => {
          const isSelected = selectedValue === option.value;
          return (
            <motion.button
              key={option.value}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={animationConfig.buttonHover}
              onClick={() => handleSelect(option.value)}
              className={`relative p-5 rounded-2xl border-2 transition-all text-left ${
                isSelected
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              {/* Selected Indicator */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-3 right-3"
                >
                  <CheckCircle2
                    className="w-6 h-6"
                    style={{ color: tokens.color.primary.value }}
                  />
                </motion.div>
              )}

              {/* Content */}
              <div className="flex items-start gap-3">
                {option.icon && <span className="text-3xl">{option.icon}</span>}
                <div className="flex-1">
                  <div
                    className={`text-lg font-semibold mb-1 ${
                      isSelected ? "text-blue-700" : "text-gray-900"
                    }`}
                  >
                    {option.label}
                  </div>
                  <div className={`text-sm ${isSelected ? "text-blue-600" : "text-gray-500"}`}>
                    {option.description}
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Footer Message */}
      <div className="mt-6 p-4 bg-gray-50 rounded-xl">
        <p className="text-sm text-gray-600 text-center">
          💡 提示：建议从轻松模式开始，循序渐进养成学习习惯
        </p>
      </div>
    </div>
  );
}