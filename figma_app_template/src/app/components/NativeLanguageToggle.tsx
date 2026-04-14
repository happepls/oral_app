import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Languages, Info } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

interface NativeLanguageToggleProps {
  nativeLanguage?: string;
  enabled?: boolean;
  onChange?: (enabled: boolean) => void;
  variant?: "default" | "compact";
}

export function NativeLanguageToggle({
  nativeLanguage = "中文",
  enabled = false,
  onChange,
  variant = "default",
}: NativeLanguageToggleProps) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [showTooltip, setShowTooltip] = useState(false);
  const tokens = designTokens.global;

  const handleToggle = () => {
    const newValue = !isEnabled;
    setIsEnabled(newValue);
    onChange?.(newValue);
  };

  if (variant === "compact") {
    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleToggle}
        className="relative px-4 py-2 rounded-full flex items-center gap-2 transition-all"
        style={{
          backgroundColor: isEnabled
            ? `${tokens.color.primary.value}15`
            : "#f3f4f6",
          border: isEnabled
            ? `2px solid ${tokens.color.primary.value}`
            : "2px solid transparent",
        }}
      >
        <Languages
          className="w-4 h-4"
          style={{ color: isEnabled ? tokens.color.primary.value : "#9ca3af" }}
        />
        <span
          className="text-sm font-medium"
          style={{ color: isEnabled ? tokens.color.primary.value : "#6b7280" }}
        >
          {nativeLanguage}
        </span>
        {isEnabled && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: tokens.color.success.value }}
          />
        )}
      </motion.button>
    );
  }

  return (
    <div
      className="rounded-2xl p-6 shadow-lg"
      style={{
        background: isEnabled
          ? `linear-gradient(135deg, ${tokens.color["primary-light"].value}20, ${tokens.color.secondary.value}15)`
          : "#ffffff",
        border: `2px solid ${isEnabled ? tokens.color.primary.value + "30" : "#e5e7eb"}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: isEnabled
                ? `${tokens.color.primary.value}20`
                : "#f3f4f6",
            }}
          >
            <Languages
              className="w-6 h-6"
              style={{
                color: isEnabled ? tokens.color.primary.value : "#9ca3af",
              }}
            />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-lg">
              Study in Native Language
            </h3>
            <p className="text-sm text-gray-600">用母语学习辅助</p>
          </div>
        </div>

        {/* Info Icon */}
        <div
          className="relative"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <motion.div
            whileHover={{ scale: 1.1 }}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center cursor-help transition-colors"
          >
            <Info className="w-4 h-4 text-gray-600" />
          </motion.div>

          {/* Tooltip */}
          <AnimatePresence>
            {showTooltip && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute top-full right-0 mt-2 w-64 bg-gray-900 text-white text-xs rounded-xl p-3 shadow-xl z-50"
              >
                <div className="space-y-2">
                  <p>开启后系统将提供：</p>
                  <ul className="space-y-1 pl-3">
                    <li>• 规则和建议的母语解释</li>
                    <li>• 对话内容双语对照</li>
                    <li>• AI 用母语纠正错误</li>
                    <li>• 关键词汇即时翻译</li>
                  </ul>
                </div>
                <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 transform rotate-45" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Toggle Switch */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-700 mb-1">
            <span className="font-medium">母语：</span>
            <span
              className="ml-2 px-3 py-1 rounded-full text-sm font-medium"
              style={{
                backgroundColor: isEnabled
                  ? `${tokens.color.primary.value}15`
                  : "#f3f4f6",
                color: isEnabled ? tokens.color.primary.value : "#6b7280",
              }}
            >
              {nativeLanguage}
            </span>
          </p>
          <p className="text-xs text-gray-500">
            {isEnabled
              ? "已开启母语辅助，对话将显示双语对照"
              : "关闭时仅显示目标语言"}
          </p>
        </div>

        {/* Custom Toggle */}
        <motion.button
          onClick={handleToggle}
          className="relative w-16 h-8 rounded-full flex items-center transition-colors"
          style={{
            backgroundColor: isEnabled
              ? tokens.color.primary.value
              : "#d1d5db",
          }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.div
            className="w-6 h-6 bg-white rounded-full shadow-md"
            animate={{
              x: isEnabled ? 34 : 4,
            }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        </motion.button>
      </div>

      {/* Feature List */}
      <AnimatePresence>
        {isEnabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-4 pt-4 border-t border-gray-200"
          >
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: "🌐", text: "双语对照" },
                { icon: "💡", text: "母语解释" },
                { icon: "✏️", text: "母语纠错" },
                { icon: "📖", text: "词汇翻译" },
              ].map((feature, index) => (
                <motion.div
                  key={feature.text}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl"
                >
                  <span className="text-lg">{feature.icon}</span>
                  <span className="text-xs font-medium text-gray-700">
                    {feature.text}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
