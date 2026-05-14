import { motion } from "motion/react";
import { GuajiMascot } from "./GuajiMascot";

const STATUS_TEXT = {
  idle: "等待中",
  listening: "聆听中",
  speaking: "回应中",
  thinking: "思考中",
};

const STATUS_COLOR = {
  idle: 'var(--primary)',
  listening: 'var(--success)',
  speaking: 'var(--secondary)',
  thinking: 'var(--warning)',
};

export function AiAvatar({
  name = "AI 导师",
  status = "idle",
}) {
  const color = STATUS_COLOR[status] || STATUS_COLOR.idle;
  const text = STATUS_TEXT[status] || STATUS_TEXT.idle;

  return (
    <div className="relative h-full">
      <div
        className="relative w-full h-full rounded-3xl overflow-hidden"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(99,127,241,0.15), transparent 60%), var(--background)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <GuajiMascot state={status} size={220} />

        <motion.div
          className="absolute bottom-8 left-1/2"
          style={{ transform: 'translateX(-50%)', width: '90%' }}
          animate={{
            boxShadow: [
              `0 0 20px ${color}40`,
              `0 0 40px ${color}60`,
              `0 0 20px ${color}40`,
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div style={{
            background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
            borderRadius: 16, padding: '10px 16px', boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <motion.div
                  style={{ width: 8, height: 8, borderRadius: '50%', background: color }}
                  animate={{ scale: [1, 1.2, 1], opacity: [1, 0.6, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span style={{ fontWeight: 600, color: 'var(--foreground)', fontSize: 14 }}>{name}</span>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 9999,
                background: `${color}15`, color: color,
              }}>{text}</span>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        style={{ position: 'absolute', bottom: -24, left: 0, right: 0, textAlign: 'center' }}
      >
        <p style={{ fontSize: 11, color: 'var(--foreground-subtle)' }}>
          Powered by <span style={{ fontWeight: 600, color: 'var(--foreground-muted)' }}>Qwen3.5-Omni</span>
        </p>
      </motion.div>
    </div>
  );
}
