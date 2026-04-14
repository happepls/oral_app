import { useState, useRef, useEffect } from "react";
import { Mic, X, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import designTokens from "../../imports/design-tokens.json";

interface InlineMicButtonProps {
  onRecordingComplete?: (audioBlob: Blob) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  maxDuration?: number;
}

type RecordingState = "idle" | "recording" | "locked" | "processing";
type GestureHint = "slide-up" | "slide-left" | null;

export function InlineMicButton({ onRecordingComplete, onRecordingStart, onRecordingStop, maxDuration = 60 }: InlineMicButtonProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [gestureHint, setGestureHint] = useState<GestureHint>(null);
  const [volume, setVolume] = useState(0);
  
  const tokens = designTokens.global;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const startY = useRef(0);
  const startX = useRef(0);
  const currentY = useRef(0);
  const currentX = useRef(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state === "recording" || state === "locked") {
      interval = setInterval(() => {
        setDuration((prev) => {
          if (prev >= maxDuration) {
            clearInterval(interval);
            handleComplete();
            return prev;
          }
          return prev + 1;
        });
        // Simulate volume changes
        setVolume(Math.random() * 100);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [state, maxDuration]);

  const handleComplete = () => {
    setState("processing");
    setTimeout(() => {
      setState("idle");
      setDuration(0);
      setVolume(0);
      onRecordingComplete?.(new Blob());
    }, 1000);
  };

  const handleCancel = () => {
    setState("idle");
    setDuration(0);
    setVolume(0);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;
    setState("recording");
    setDuration(0);
    onRecordingStart?.();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (state === "locked") return;

    currentY.current = e.touches[0].clientY;
    currentX.current = e.touches[0].clientX;
    
    const deltaY = startY.current - currentY.current;
    const deltaX = startX.current - currentX.current;

    // Detect slide up (lock)
    if (deltaY > 100) {
      setGestureHint("slide-up");
    }
    // Detect slide left (cancel)
    else if (deltaX > 100) {
      setGestureHint("slide-left");
    } else {
      setGestureHint(null);
    }
  };

  const handleTouchEnd = () => {
    if (state === "locked") return;

    const deltaY = startY.current - currentY.current;
    const deltaX = startX.current - currentX.current;

    // Lock recording
    if (deltaY > 100) {
      setState("locked");
      setGestureHint(null);
    }
    // Cancel recording
    else if (deltaX > 100) {
      handleCancel();
      setGestureHint(null);
    }
    // Complete recording
    else if (state === "recording") {
      handleComplete();
      onRecordingStop?.();
    }
  };

  const handleMouseDown = () => {
    setState("recording");
    setDuration(0);
    onRecordingStart?.();
  };

  const handleMouseUp = () => {
    if (state === "recording") {
      handleComplete();
      onRecordingStop?.();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative">
      <AnimatePresence>
        {(state === "recording" || state === "locked") && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-20 left-0 right-0 flex items-center justify-between px-6 py-4 bg-white rounded-2xl shadow-lg border border-gray-200 mb-2"
          >
            {/* Cancel hint */}
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ x: gestureHint === "slide-left" ? [-10, 0] : 0 }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              >
                <X className="w-5 h-5 text-red-500" />
              </motion.div>
              <span className="text-sm text-gray-600">左滑删除</span>
            </div>

            {/* Timer and volume */}
            <div className="flex items-center gap-3">
              <div className="text-lg font-mono font-semibold" style={{ color: tokens.color.error.value }}>
                {formatTime(duration)}
              </div>
              {/* Volume indicator */}
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 rounded-full"
                    style={{
                      height: `${Math.max(4, (volume / 100) * 20 * (i + 1) / 5)}px`,
                      backgroundColor: tokens.color.primary.value,
                    }}
                    animate={{
                      height: volume > (i * 20) ? `${(volume / 100) * 20}px` : "4px",
                    }}
                    transition={{ duration: 0.1 }}
                  />
                ))}
              </div>
            </div>

            {/* Lock hint */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">上滑锁定</span>
              <motion.div
                animate={{ y: gestureHint === "slide-up" ? [-10, 0] : 0 }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              >
                <Lock className="w-5 h-5 text-blue-500" />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording status overlay */}
      <AnimatePresence>
        {state === "processing" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="px-6 py-3 bg-white rounded-full shadow-lg border border-gray-200">
              <span className="text-sm text-gray-600">发送中...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main button */}
      <motion.button
        ref={buttonRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        disabled={state === "processing"}
        className="relative w-full h-16 rounded-2xl flex items-center justify-center text-white shadow-lg overflow-hidden"
        style={{
          background: state === "locked" 
            ? `linear-gradient(to right, ${tokens.color.error.value}, ${tokens.color.secondary.value})`
            : `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
        }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Volume ripple effect */}
        <AnimatePresence>
          {(state === "recording" || state === "locked") && (
            <>
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute inset-0 rounded-2xl border-2 border-white"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ 
                    scale: 1 + (volume / 100) * (0.3 + i * 0.1),
                    opacity: 0,
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.3,
                  }}
                />
              ))}
            </>
          )}
        </AnimatePresence>

        <div className="relative z-10 flex items-center gap-2">
          {state === "locked" && <Lock className="w-5 h-5" />}
          <Mic className="w-6 h-6" />
          
        </div>
      </motion.button>

      {/* Instruction text */}
      {state === "idle" && (
        <div className="text-center mt-2">
          <p className="text-xs text-gray-400">
            按住说话 • 上滑锁定 • 左滑删除
          </p>
        </div>
      )}
    </div>
  );
}