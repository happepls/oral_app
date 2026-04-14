import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { LanguageSelector } from "../components/LanguageSelector";
import { LevelSelector } from "../components/LevelSelector";
import { InterestAreaSelector } from "../components/InterestAreaSelector";
import { GoalSet } from "../components/GoalSet";
import designTokens from "../../imports/design-tokens.json";

type OnboardingStep = "welcome" | "features" | "scenarios" | "setup";

export function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [selectedLevel, setSelectedLevel] = useState("intermediate");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [dailyGoal, setDailyGoal] = useState(15);

  const tokens = designTokens.global;

  const steps: OnboardingStep[] = ["welcome", "features", "scenarios", "setup"];
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const canProceed = () => {
    switch (currentStep) {
      case "scenarios":
        return selectedInterests.length > 0;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStep(steps[currentStepIndex + 1]);
    }
  };

  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(steps[currentStepIndex - 1]);
    }
  };

  const handleComplete = () => {
    // Save preferences
    const preferences = {
      language: selectedLanguage,
      level: selectedLevel,
      interests: selectedInterests,
      dailyGoal,
    };
    console.log("Onboarding completed with preferences:", preferences);
    
    // In production, navigate to main app
    // navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Progress Bar */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🦜</span>
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                Oral AI
              </span>
            </div>
            <span className="text-sm text-gray-600">
              步骤 {currentStepIndex + 1} / {steps.length}
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              className="h-full"
              style={{
                background: `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-3xl shadow-xl p-8 md:p-12 mb-8">
          <AnimatePresence mode="wait">
            {currentStep === "welcome" && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-center"
              >
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="text-8xl mb-8"
                >
                  🦜
                </motion.div>
                <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                  欢迎来到 Oral AI
                </h1>
                <p className="text-xl text-gray-600 mb-3">
                  你的私人 AI 口语练习伙伴
                </p>
                <p className="text-lg text-gray-500">
                  随时随地，自信开口说外语
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
                  {[
                    { emoji: "🎯", title: "个性化学习", desc: "根据你的水平定制内容" },
                    { emoji: "💬", title: "真实场景", desc: "18+ 生活场景任你选" },
                    { emoji: "🎤", title: "实时反馈", desc: "发音和表达即时点评" },
                  ].map((feature, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + idx * 0.1 }}
                      className="p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50"
                    >
                      <div className="text-4xl mb-3">{feature.emoji}</div>
                      <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                      <p className="text-sm text-gray-600">{feature.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {currentStep === "features" && (
              <motion.div
                key="features"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <LanguageSelector
                  title="选择学习语言"
                  subtitle="开始你的语言学习之旅"
                  selectedLanguage={selectedLanguage}
                  onChange={setSelectedLanguage}
                />
              </motion.div>
            )}

            {currentStep === "scenarios" && (
              <motion.div
                key="scenarios"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <InterestAreaSelector
                  title="兴趣领域"
                  subtitle="选择你想重点练习的场景（最多3个）"
                  selectedAreas={selectedInterests}
                  maxSelection={3}
                  onChange={setSelectedInterests}
                />
              </motion.div>
            )}

            {currentStep === "setup" && (
              <motion.div
                key="setup"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Level Selector */}
                <div>
                  <LevelSelector
                    title="目标水平"
                    subtitle="你希望达到的语言水平"
                    selectedLevel={selectedLevel}
                    onChange={setSelectedLevel}
                  />
                </div>

                <div className="border-t border-gray-200 pt-8">
                  <div className="mb-6">
                    <h3 className="text-2xl font-semibold text-gray-900 mb-2">
                      每日练习目标
                    </h3>
                    <p className="text-sm text-gray-600">
                      选择适合你的每日学习时长
                    </p>
                  </div>

                  <GoalSet
                    title="设定每日练习时长"
                    subtitle="建议从小目���开始，循序渐进"
                    defaultValue={dailyGoal}
                    onChange={setDailyGoal}
                  />

                  <div className="mt-6 p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">预计每周学习</p>
                        <p className="text-3xl font-bold" style={{ color: tokens.color.primary.value }}>
                          {dailyGoal * 7} 分钟
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600 mb-1">预计每月学习</p>
                        <p className="text-3xl font-bold text-gray-900">
                          {dailyGoal * 30} 分钟
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="border-t border-gray-200 pt-8">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">📋 你的学习计划</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500 mb-1">学习语言</p>
                      <p className="font-semibold text-gray-900 text-sm">
                        {selectedLanguage === "en" && "🇺🇸 英语"}
                        {selectedLanguage === "es" && "🇪🇸 西班牙语"}
                        {selectedLanguage === "fr" && "🇫🇷 法语"}
                        {selectedLanguage === "de" && "🇩🇪 德语"}
                        {selectedLanguage === "ja" && "🇯🇵 日语"}
                        {selectedLanguage === "ko" && "🇰🇷 韩语"}
                        {selectedLanguage === "zh-cn" && "🇨🇳 简体中文"}
                        {selectedLanguage === "zh-tw" && "🇹🇼 繁体中文"}
                        {!["en", "es", "fr", "de", "ja", "ko", "zh-cn", "zh-tw"].includes(selectedLanguage) && "🌍 " + selectedLanguage}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500 mb-1">目标水平</p>
                      <p className="font-semibold text-gray-900 text-sm">
                        {selectedLevel === "beginner" && "🌱 初级"}
                        {selectedLevel === "intermediate" && "🌿 中级"}
                        {selectedLevel === "advanced" && "🌳 高级"}
                        {selectedLevel === "native" && "🏆 母语级别"}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500 mb-1">兴趣领域</p>
                      <p className="font-semibold text-gray-900 text-sm">{selectedInterests.length} 个场景</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500 mb-1">每日目标</p>
                      <p className="font-semibold text-gray-900 text-sm">{dailyGoal} 分钟</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation Buttons */}
        {currentStep !== "setup" && (
          <div className="flex gap-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handlePrevious}
              disabled={currentStepIndex === 0}
              className="px-6 py-3 rounded-xl font-medium text-gray-700 bg-white border-2 border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
            >
              <ChevronLeft className="w-5 h-5" />
              上一步
            </motion.button>

            <motion.button
              whileHover={canProceed() ? { scale: 1.02 } : {}}
              whileTap={canProceed() ? { scale: 0.98 } : {}}
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex-1 px-6 py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              style={{
                background: canProceed()
                  ? `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`
                  : "#9ca3af",
              }}
            >
              {currentStep === "welcome" ? "开始设置" : "下一步"}
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          </div>
        )}

        {/* Complete Button for Setup Step */}
        {currentStep === "setup" && (
          <div className="flex gap-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handlePrevious}
              className="px-6 py-3 rounded-xl font-medium text-gray-700 bg-white border-2 border-gray-200 flex items-center gap-2 shadow-sm"
            >
              <ChevronLeft className="w-5 h-5" />
              上一步
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleComplete}
              className="flex-1 px-6 py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 shadow-lg"
              style={{
                background: `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
              }}
            >
              <Check className="w-5 h-5" />
              完成设置，开始学习
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
}