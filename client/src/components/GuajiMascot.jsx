import { motion, AnimatePresence } from 'motion/react';

const STATE_IMAGES = {
  idle: '/mascot/happy.png',
  speaking: '/mascot/speaking.png',
  listening: '/mascot/listening.png',
  thinking: '/mascot/thinking.png',
  correct: '/mascot/correct.png',
  tryagain: '/mascot/tryagain.png',
  achievement: '/mascot/achievement.png',
  guiding: '/mascot/guiding.png',
  recording: '/mascot/recording.png',
  practicing: '/mascot/practicing.png',
};

const MOOD_IMAGES = {
  happy: '/mascot/happy.png',
  excited: '/mascot/excited.png',
  surprised: '/mascot/surprised.png',
  thinking: '/mascot/thinking.png',
  winking: '/mascot/winking.png',
  loving: '/mascot/loving.png',
  sleepy: '/mascot/sleepy.png',
  confused: '/mascot/confused.png',
  proud: '/mascot/proud.png',
};

export function GuajiMascot({ state = 'idle', mood, size = 200, className = '' }) {
  const src = mood ? (MOOD_IMAGES[mood] || MOOD_IMAGES.happy) : (STATE_IMAGES[state] || STATE_IMAGES.idle);

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <AnimatePresence mode="wait">
        <motion.img
          key={src}
          src={src}
          alt={`GuaJi ${state}`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1, y: [0, -5, 0] }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3, y: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }}
          style={{ width: size, height: size, objectFit: 'contain' }}
          draggable={false}
        />
      </AnimatePresence>

      {state === 'thinking' && (
        <div style={{
          position: 'absolute', top: 8, right: '30%',
          background: '#fff', borderRadius: 14, padding: '6px 10px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', gap: 4
        }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--secondary)',
              animation: `mascot-think-dot 1.2s ${i * 0.15}s infinite`
            }} />
          ))}
        </div>
      )}

      {state === 'speaking' && (
        <div style={{
          position: 'absolute', bottom: '10%', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 2, alignItems: 'center'
        }}>
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              style={{ width: 3, borderRadius: 2, background: 'var(--secondary)' }}
              animate={{ height: ['8px', '20px', '8px'] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
