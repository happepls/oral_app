import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Sparkles, Volume2, X } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

interface Avatar {
  id: string;
  name: string;
  imageUrl: string;
  voice: string;
  gender: "female" | "male";
  style: string;
  isPremium: boolean;
}

interface AvatarSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (avatar: Avatar) => void;
  selectedAvatarId?: string;
  userIsPremium: boolean;
}

export function AvatarSelector({
  isOpen,
  onClose,
  onSelect,
  selectedAvatarId,
  userIsPremium,
}: AvatarSelectorProps) {
  const tokens = designTokens.global;
  const [previewVoice, setPreviewVoice] = useState<string | null>(null);

  // 模拟数字人数据（实际应从 Keevx API 获取）
  const avatars: Avatar[] = [
    {
      id: "avatar-1",
      name: "Emma",
      imageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80",
      voice: "温柔女声",
      gender: "female",
      style: "职场商务",
      isPremium: true,
    },
    {
      id: "avatar-2",
      name: "Sophie",
      imageUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&q=80",
      voice: "甜美女声",
      gender: "female",
      style: "亲和活泼",
      isPremium: true,
    },
    {
      id: "avatar-3",
      name: "James",
      imageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80",
      voice: "磁性男声",
      gender: "male",
      style: "成熟稳重",
      isPremium: true,
    },
    {
      id: "avatar-4",
      name: "Lucas",
      imageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80",
      voice: "阳光男声",
      gender: "male",
      style: "青春活力",
      isPremium: true,
    },
    {
      id: "avatar-5",
      name: "Olivia",
      imageUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&q=80",
      voice: "知性女声",
      gender: "female",
      style: "专业优雅",
      isPremium: true,
    },
    {
      id: "avatar-6",
      name: "Michael",
      imageUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&q=80",
      voice: "浑厚男声",
      gender: "male",
      style: "权威专业",
      isPremium: true,
    },
  ];

  const handlePreviewVoice = (voiceId: string) => {
    setPreviewVoice(voiceId);
    // 模拟音频播放
    setTimeout(() => setPreviewVoice(null), 2000);
  };

  const handleSelectAvatar = (avatar: Avatar) => {
    if (!userIsPremium) {
      // 显示升级提示
      return;
    }
    onSelect(avatar);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[900px] md:max-h-[80vh] bg-white rounded-3xl shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div
              className="px-8 py-6 flex items-center justify-between"
              style={{
                background: `linear-gradient(135deg, ${tokens.color["primary-light"].value}30, ${tokens.color.secondary.value}20)`,
              }}
            >
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">选择 AI 数字人</h2>
                <p className="text-sm text-gray-600">
                  选择你喜欢的数字人形象，音色将自动匹配
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/50 hover:bg-white/80 flex items-center justify-center transition-colors"
              >
                <X className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {avatars.map((avatar) => {
                  const isSelected = avatar.id === selectedAvatarId;
                  const isLocked = !userIsPremium && avatar.isPremium;

                  return (
                    <motion.div
                      key={avatar.id}
                      whileHover={{ scale: isLocked ? 1 : 1.02 }}
                      whileTap={{ scale: isLocked ? 1 : 0.98 }}
                      className={`relative rounded-2xl overflow-hidden cursor-pointer transition-all ${
                        isSelected
                          ? "ring-4 shadow-xl"
                          : "ring-2 ring-gray-200 hover:ring-gray-300"
                      }`}
                      style={{
                        ringColor: isSelected ? tokens.color.primary.value : undefined,
                      }}
                      onClick={() => handleSelectAvatar(avatar)}
                    >
                      {/* Avatar Image */}
                      <div className="aspect-[3/4] relative">
                        <img
                          src={avatar.imageUrl}
                          alt={avatar.name}
                          className={`w-full h-full object-cover ${
                            isLocked ? "blur-sm grayscale" : ""
                          }`}
                        />

                        {/* Locked Overlay */}
                        {isLocked && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <div className="text-center">
                              <div
                                className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
                                style={{ backgroundColor: `${tokens.color.primary.value}` }}
                              >
                                <Sparkles className="w-8 h-8 text-white" />
                              </div>
                              <p className="text-white font-semibold">会员专享</p>
                            </div>
                          </div>
                        )}

                        {/* Selected Badge */}
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
                            style={{ backgroundColor: tokens.color.primary.value }}
                          >
                            <Check className="w-6 h-6 text-white" />
                          </motion.div>
                        )}

                        {/* Gradient Overlay */}
                        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent" />

                        {/* Info */}
                        <div className="absolute bottom-0 left-0 right-0 p-4">
                          <h3 className="text-lg font-bold text-white mb-1">{avatar.name}</h3>
                          <p className="text-sm text-gray-200 mb-2">{avatar.style}</p>

                          {/* Voice Preview Button */}
                          {!isLocked && (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreviewVoice(avatar.id);
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full text-sm font-medium text-gray-900"
                            >
                              <Volume2
                                className={`w-4 h-4 ${
                                  previewVoice === avatar.id ? "animate-pulse" : ""
                                }`}
                                style={{
                                  color:
                                    previewVoice === avatar.id
                                      ? tokens.color.primary.value
                                      : undefined,
                                }}
                              />
                              <span>{avatar.voice}</span>
                            </motion.button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Upgrade Prompt for Free Users */}
              {!userIsPremium && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 p-6 rounded-2xl text-center"
                  style={{
                    background: `linear-gradient(135deg, ${tokens.color.primary.value}15, ${tokens.color.secondary.value}15)`,
                  }}
                >
                  <Sparkles className="w-12 h-12 mx-auto mb-4" style={{ color: tokens.color.primary.value }} />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">解锁所有 AI 数字人</h3>
                  <p className="text-gray-600 mb-6">
                    升级至付费会员，体验沉浸式 AI 数字人对话练习
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-8 py-3 rounded-2xl font-semibold text-white shadow-lg"
                    style={{
                      background: `linear-gradient(135deg, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
                    }}
                  >
                    查看订阅计划
                  </motion.button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
