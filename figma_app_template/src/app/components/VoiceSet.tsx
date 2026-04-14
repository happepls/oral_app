import { useState } from "react";
import { motion } from "motion/react";
import { Volume2, Play, Pause } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";
import { animationConfig } from "../utils/animations";

interface VoiceOption {
  id: string;
  name: string;
  gender: "male" | "female";
  accent: string;
  description: string;
  avatar?: string;
  previewUrl?: string;
}

interface VoiceSetProps {
  title?: string;
  subtitle?: string;
  voices?: VoiceOption[];
  defaultVoiceId?: string;
  onChange?: (voiceId: string) => void;
}

const defaultVoices: VoiceOption[] = [
  {
    id: "voice-1",
    name: "Emma",
    gender: "female",
    accent: "美式英语",
    description: "温柔友好，适合日常对话",
    avatar: "👩",
  },
  {
    id: "voice-2",
    name: "James",
    gender: "male",
    accent: "英式英语",
    description: "专业沉稳，适合商务场景",
    avatar: "👨",
  },
  {
    id: "voice-3",
    name: "Sophia",
    gender: "female",
    accent: "美式英语",
    description: "活泼清晰，适合初学者",
    avatar: "👧",
  },
  {
    id: "voice-4",
    name: "Oliver",
    gender: "male",
    accent: "澳式英语",
    description: "轻松随和，适合轻松练习",
    avatar: "🧑",
  },
];

export function VoiceSet({
  title = "选择口语导师音色",
  subtitle = "不同音色适合不同练习场景",
  voices = defaultVoices,
  defaultVoiceId = "voice-1",
  onChange,
}: VoiceSetProps) {
  const tokens = designTokens.global;
  const [selectedVoiceId, setSelectedVoiceId] = useState(defaultVoiceId);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const handleSelect = (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    onChange?.(voiceId);
  };

  const handlePlayPreview = (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingVoiceId === voiceId) {
      setPlayingVoiceId(null);
    } else {
      setPlayingVoiceId(voiceId);
      // 模拟播放完成后自动停止
      setTimeout(() => setPlayingVoiceId(null), 2000);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-3xl p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
          }}
        >
          <Volume2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
      </div>

      {/* Voice Options Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {voices.map((voice) => {
          const isSelected = selectedVoiceId === voice.id;
          const isPlaying = playingVoiceId === voice.id;

          return (
            <motion.button
              key={voice.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSelect(voice.id)}
              className={`relative p-6 rounded-2xl border-2 transition-all text-left ${
                isSelected
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl flex-shrink-0 ${
                    isSelected ? "bg-blue-100" : "bg-gray-100"
                  }`}
                >
                  {voice.avatar}
                </div>

                {/* Voice Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4
                      className={`text-lg font-semibold ${
                        isSelected ? "text-blue-700" : "text-gray-900"
                      }`}
                    >
                      {voice.name}
                    </h4>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        voice.gender === "female"
                          ? "bg-pink-100 text-pink-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {voice.gender === "female" ? "女声" : "男声"}
                    </span>
                  </div>
                  <p className={`text-sm mb-2 ${isSelected ? "text-blue-600" : "text-gray-600"}`}>
                    {voice.accent}
                  </p>
                  <p className={`text-xs ${isSelected ? "text-blue-500" : "text-gray-500"}`}>
                    {voice.description}
                  </p>
                </div>

                {/* Play Button */}
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={animationConfig.buttonHover}
                  onClick={(e) => handlePlayPreview(voice.id, e)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    isPlaying
                      ? "bg-blue-500 text-white"
                      : isSelected
                      ? "bg-blue-100 text-blue-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </motion.div>
              </div>

              {/* Selected Indicator */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-4 right-4 w-2 h-2 rounded-full"
                  style={{ backgroundColor: tokens.color.primary.value }}
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Footer Tip */}
      <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100">
        <p className="text-sm text-blue-900 text-center">
          🎧 点击 <Play className="inline w-4 h-4 mb-0.5" /> 按钮试听音色，选择你最喜欢的导师
        </p>
      </div>
    </div>
  );
}