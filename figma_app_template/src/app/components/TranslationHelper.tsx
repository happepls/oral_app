import { motion, AnimatePresence } from "motion/react";
import { Volume2, Info, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import designTokens from "../../imports/design-tokens.json";

interface TranslationHelperProps {
  originalText: string;
  translatedText: string;
  type?: "explanation" | "correction" | "vocabulary";
  highlights?: Array<{ word: string; meaning: string }>;
}

export function TranslationHelper({
  originalText,
  translatedText,
  type = "explanation",
  highlights = [],
}: TranslationHelperProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);
  const tokens = designTokens.global;

  const typeConfig = {
    explanation: {
      icon: "💡",
      title: "母语解释",
      color: tokens.color.primary.value,
      bgColor: `${tokens.color.primary.value}15`,
    },
    correction: {
      icon: "✏️",
      title: "纠正建议",
      color: tokens.color.warning.value,
      bgColor: `${tokens.color.warning.value}15`,
    },
    vocabulary: {
      icon: "📖",
      title: "词汇翻译",
      color: tokens.color.secondary.value,
      bgColor: `${tokens.color.secondary.value}15`,
    },
  };

  const config = typeConfig[type];

  const handlePlayAudio = () => {
    setPlayingAudio(true);
    // 模拟音频播放
    setTimeout(() => setPlayingAudio(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden shadow-sm"
      style={{
        backgroundColor: config.bgColor,
        border: `1px solid ${config.color}30`,
      }}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{config.icon}</span>
            <span className="text-sm font-semibold" style={{ color: config.color }}>
              {config.title}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Play Audio Button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handlePlayAudio}
              className="w-8 h-8 rounded-full bg-white/80 hover:bg-white flex items-center justify-center transition-colors"
            >
              <Volume2
                className={`w-4 h-4 ${playingAudio ? "animate-pulse" : ""}`}
                style={{ color: config.color }}
              />
            </motion.button>

            {/* Expand/Collapse Button */}
            {highlights.length > 0 && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-8 h-8 rounded-full bg-white/80 hover:bg-white flex items-center justify-center transition-colors"
              >
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                )}
              </motion.button>
            )}
          </div>
        </div>

        {/* Translation Text */}
        <div className="bg-white/60 rounded-xl p-3">
          <p className="text-sm text-gray-800 leading-relaxed">{translatedText}</p>
        </div>
      </div>

      {/* Expanded Vocabulary Highlights */}
      <AnimatePresence>
        {isExpanded && highlights.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="px-4 pb-4"
          >
            <div className="bg-white/60 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600 mb-2">关键词汇</p>
              {highlights.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-3 p-2 bg-white rounded-lg"
                >
                  <span className="font-mono font-semibold text-gray-900 text-sm">
                    {item.word}
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="text-sm text-gray-700">{item.meaning}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
