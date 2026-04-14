import { User, Bot, Languages } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import designTokens from "../../imports/design-tokens.json";

interface MessageBubbleProps {
  type: "user" | "ai";
  message: string;
  timestamp?: string;
  avatar?: string;
  state?: "default" | "loading" | "error";
  translation?: string;
  showTranslation?: boolean;
}

export function MessageBubble({ 
  type, 
  message, 
  timestamp, 
  avatar, 
  state = "default",
  translation,
  showTranslation = false,
}: MessageBubbleProps) {
  const isUser = type === "user";
  const tokens = designTokens.global;
  const [isTranslationVisible, setIsTranslationVisible] = useState(showTranslation);

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar - only for AI */}
      {!isUser && (
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: tokens.color.secondary.value }}
        >
          {avatar ? (
            <img src={avatar} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <Bot className="w-6 h-6 text-white" />
          )}
        </div>
      )}

      {/* Message Content */}
      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[70%]`}>
        <div
          className={`px-6 py-4 ${
            state === "error" ? "border-2" : ""
          }`}
          style={{
            backgroundColor: isUser ? tokens.color.primary.value : "#E1E2E6",
            color: isUser ? "#FFFFFF" : "#1F2937",
            borderRadius: isUser ? "24px 24px 8px 24px" : "8px 24px 24px 24px",
            borderColor: state === "error" ? tokens.color.error.value : "transparent",
          }}
        >
          {state === "loading" ? (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-current opacity-40 animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-current opacity-40 animate-pulse" style={{ animationDelay: "0.2s" }} />
              <div className="w-2 h-2 rounded-full bg-current opacity-40 animate-pulse" style={{ animationDelay: "0.4s" }} />
            </div>
          ) : (
            <>
              <p className="text-[15px] leading-relaxed">{message}</p>
              
              {/* Translation Toggle Button */}
              {translation && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsTranslationVisible(!isTranslationVisible)}
                  className="mt-2 flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity"
                >
                  <Languages className="w-3 h-3" />
                  <span>{isTranslationVisible ? "隐藏翻译" : "显示翻译"}</span>
                </motion.button>
              )}
            </>
          )}
        </div>

        {/* Translation */}
        <AnimatePresence>
          {translation && isTranslationVisible && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={`mt-2 px-4 py-3 rounded-2xl max-w-full ${
                isUser ? "bg-blue-50" : "bg-gray-100"
              }`}
            >
              <div className="flex items-start gap-2">
                <Languages className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700 leading-relaxed">{translation}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {timestamp && (
          <span className="text-xs text-gray-500 mt-1 px-2">{timestamp}</span>
        )}
      </div>
    </div>
  );
}