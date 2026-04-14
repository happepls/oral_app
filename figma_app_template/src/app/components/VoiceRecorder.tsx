import { useState, useEffect } from "react";
import { Mic, Square } from "lucide-react";
import { motion } from "motion/react";
import designTokens from "../../imports/design-tokens.json";

interface VoiceRecorderProps {
  onRecordingComplete?: (audioBlob: Blob) => void;
  maxDuration?: number;
  state?: "idle" | "recording" | "processing";
}

export function VoiceRecorder({ onRecordingComplete, maxDuration = 300, state: controlledState }: VoiceRecorderProps) {
  const [internalState, setInternalState] = useState<"idle" | "recording" | "processing">("idle");
  const [duration, setDuration] = useState(0);
  const tokens = designTokens.global;

  const state = controlledState || internalState;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state === "recording") {
      interval = setInterval(() => {
        setDuration((prev) => {
          if (prev >= maxDuration) {
            clearInterval(interval);
            setInternalState("processing");
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [state, maxDuration]);

  const handleStartRecording = () => {
    setInternalState("recording");
    setDuration(0);
  };

  const handleStopRecording = () => {
    setInternalState("processing");
    // Simulate processing
    setTimeout(() => {
      setInternalState("idle");
      setDuration(0);
    }, 2000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        {/* Duration Display */}
        {state === "recording" && (
          <div className="text-center mb-8">
            <div className="text-5xl font-mono font-semibold text-gray-900 mb-2">
              {formatTime(duration)}
            </div>
            <div className="text-sm text-gray-500">录音中...</div>
          </div>
        )}

        {state === "processing" && (
          <div className="text-center mb-8">
            <div className="text-lg font-semibold text-gray-900 mb-2">处理中...</div>
            <div className="text-sm text-gray-500">正在转换音频</div>
          </div>
        )}

        {/* Control Button */}
        <div className="flex items-center justify-center">
          {state === "idle" && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleStartRecording}
              className="relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
              style={{ backgroundColor: tokens.color.primary.value }}
            >
              <Mic className="w-8 h-8 text-white" />
            </motion.button>
          )}

          {state === "recording" && (
            <div className="relative">
              {/* Pulsing rings */}
              <motion.div
                className="absolute inset-0 rounded-full border-2"
                style={{ 
                  width: "120px", 
                  height: "120px",
                  left: "-20px",
                  top: "-20px",
                  borderColor: tokens.color.primary.value 
                }}
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 0, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                }}
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleStopRecording}
                className="relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
                style={{ backgroundColor: tokens.color.error.value }}
              >
                <Square className="w-8 h-8 text-white" fill="white" />
              </motion.button>
            </div>
          )}

          {state === "processing" && (
            <motion.div
              className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
              style={{ backgroundColor: tokens.color["primary-light"].value }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <div 
                className="w-12 h-12 rounded-full border-4 border-t-transparent"
                style={{ borderColor: tokens.color.primary.value, borderTopColor: "transparent" }}
              />
            </motion.div>
          )}
        </div>

        {/* Waveform Visualization */}
        {state === "recording" && (
          <div className="flex items-center justify-center gap-1 h-16 mt-8">
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                className="w-1 rounded-full"
                style={{ backgroundColor: tokens.color.primary.value }}
                animate={{
                  height: [8, Math.random() * 40 + 20, 8],
                }}
                transition={{
                  duration: 0.5,
                  repeat: Infinity,
                  delay: i * 0.05,
                }}
              />
            ))}
          </div>
        )}

        {/* Progress Bar */}
        {state === "recording" && (
          <div className="mt-8">
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{ 
                  width: `${(duration / maxDuration) * 100}%`,
                  backgroundColor: tokens.color.primary.value 
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}