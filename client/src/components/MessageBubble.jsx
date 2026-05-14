import { Languages } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";
import { GuajiAvatar } from "./GuajiAvatar";
import { VoiceBubble } from "./VoiceBubble";

export function MessageBubble({
  type,
  message,
  timestamp,
  state = "default",
  translation,
  showTranslation = false,
  footer,
  audioUrl,
  audioDuration,
  onPlayAudio,
}) {
  const isUser = type === "user";
  const [isTranslationVisible, setIsTranslationVisible] = useState(showTranslation);

  useEffect(() => {
    if (translation) setIsTranslationVisible(true);
  }, [translation]);

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && <GuajiAvatar size={36} />}

      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[70%]`}>
        <div
          style={{
            backgroundColor: isUser ? 'var(--primary)' : '#E1E2E6',
            color: isUser ? '#FFFFFF' : '#1F2937',
            borderRadius: isUser ? '18px 18px 6px 18px' : '6px 18px 18px 18px',
            padding: '10px 14px',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {state === "loading" ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' }}>
              {[0, 200, 400].map((d) => (
                <div key={d} style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#9CA3AF',
                  animation: 'pulse 1.2s infinite', animationDelay: `${d}ms`,
                }} />
              ))}
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>{message}</p>

              {(audioUrl || audioDuration) && !isUser && (
                <div style={{ marginTop: 8 }}>
                  <VoiceBubble duration={audioDuration} onPlay={onPlayAudio} />
                </div>
              )}

              {footer && <div style={{ marginTop: 8 }}>{footer}</div>}

              {translation && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsTranslationVisible(!isTranslationVisible)}
                  style={{
                    marginTop: 8, display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 11, opacity: 0.6, background: 'none', border: 'none',
                    cursor: 'pointer', color: 'inherit', padding: 0,
                  }}
                >
                  <Languages style={{ width: 12, height: 12 }} />
                  <span>{isTranslationVisible ? "隐藏翻译" : "显示翻译"}</span>
                </motion.button>
              )}
            </>
          )}
        </div>

        <AnimatePresence>
          {translation && isTranslationVisible && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              style={{
                marginTop: 6, padding: '8px 12px', borderRadius: 14,
                maxWidth: '100%',
                background: isUser ? 'rgba(99,127,241,0.1)' : '#F3F4F6',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ fontSize: 12 }}>🌐</span>
                <p style={{ fontSize: 12, color: 'var(--foreground-secondary)', lineHeight: 1.5, margin: 0 }}>{translation}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {timestamp && (
          <span style={{ fontSize: 10, color: 'var(--foreground-subtle)', marginTop: 4, paddingLeft: 4 }}>{timestamp}</span>
        )}
      </div>
    </div>
  );
}
