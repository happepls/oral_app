import { Play, Clock, Star, Lock } from "lucide-react";
import { motion } from "motion/react";
import designTokens from "../../imports/design-tokens.json";

interface ScenarioCardProps {
  title: string;
  description: string;
  image: string;
  duration?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  rating?: number;
  progress?: number;
  state?: "default" | "hover" | "selected" | "locked";
  onStart?: () => void;
}

export function ScenarioCard({
  title,
  description,
  image,
  duration,
  difficulty = "intermediate",
  rating,
  progress = 0,
  state = "default",
  onStart,
}: ScenarioCardProps) {
  const tokens = designTokens.global;
  
  const difficultyColors = {
    beginner: { bg: "#10B981", text: "#FFFFFF" },
    intermediate: { bg: "#F6B443", text: "#FFFFFF" },
    advanced: { bg: "#FB7250", text: "#FFFFFF" },
  };

  const difficultyLabels = {
    beginner: "初级",
    intermediate: "中级",
    advanced: "高级",
  };

  const isLocked = state === "locked";
  const isSelected = state === "selected";

  return (
    <motion.div
      whileHover={!isLocked ? { y: -4 } : {}}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="relative bg-white rounded-2xl shadow-md overflow-hidden cursor-pointer transition-all"
      style={{
        borderWidth: isSelected ? "2px" : "1px",
        borderColor: isSelected ? tokens.color.primary.value : "#E5E7EB",
        opacity: isLocked ? 0.6 : 1,
        boxShadow: state === "hover" ? `0 ${tokens.shadow.y.value} ${tokens.shadow.blur.value} rgba(${tokens.shadow.color.value}, ${tokens.shadow.opacity.value})` : undefined,
      }}
    >
      {/* Lock Overlay */}
      {isLocked && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
            <Lock className="w-8 h-8 text-gray-600" />
          </div>
        </div>
      )}

      {/* Image with Icon */}
      <div className="relative h-[200px] overflow-hidden bg-gradient-to-br from-blue-100 to-purple-100">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover"
        />
        
        {/* Icon Badge */}
        <div 
          className="absolute top-4 left-4 w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
          style={{ backgroundColor: tokens.color.primary.value }}
        >
          <Play className="w-6 h-6 text-white ml-0.5" />
        </div>

        {/* Difficulty Badge */}
        <div 
          className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-medium shadow-md"
          style={{ 
            backgroundColor: difficultyColors[difficulty].bg,
            color: difficultyColors[difficulty].text 
          }}
        >
          {difficultyLabels[difficulty]}
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-1">
          {title}
        </h3>

        {/* Description */}
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">
          {description}
        </p>

        {/* Meta Information */}
        <div className="flex items-center gap-3 mb-4 text-sm text-gray-500">
          {duration && (
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{duration}</span>
            </div>
          )}

          {rating && (
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="text-[15px] text-[14px]">{rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {progress > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>进度</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-300 rounded-full"
                style={{ 
                  width: `${progress}%`,
                  backgroundColor: tokens.color.primary.value 
                }}
              />
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={onStart}
          disabled={isLocked}
          className="w-full py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: isLocked ? "#D1D5DB" : tokens.color.primary.value,
            color: "#FFFFFF",
          }}
        >
          {isLocked ? "已锁定" : "开始练习"}
        </button>
      </div>
    </motion.div>
  );
}