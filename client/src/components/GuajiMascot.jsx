import React from 'react';

const SVG_MAP = {
  listening: 'bird-state-listening.svg',
  speaking: 'bird-state-speaking.svg',
  guiding: 'bird-state-guiding.svg',
  correctAnswer: 'bird-state-correct-answer.svg',
  happy: 'bird-expression-happy.svg',
  excited: 'bird-expression-excited.svg',
  confuse: 'bird-expression-confuse.svg',
  confused: 'bird-expression-confuse.svg',
  loving: 'bird-expression-loving.svg',
  proud: 'bird-expression-proud.svg',
  sleepy: 'bird-expression-sleepy.svg',
  surprised: 'bird-expression-surprised.svg',
  thinking: 'bird-expression-thinking.svg',
  winking: 'bird-expression-winking.svg',
  calm: 'bird-logo.svg',
};

const THINKING_DOTS_WRAP_STYLE = {
  position: 'absolute', top: 4, right: '50%', transform: 'translateX(60%)',
  background: '#fff', borderRadius: 14, padding: '6px 10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', gap: 4,
};

const IMG_STYLE = {
  width: '85%',
  height: '85%',
  objectFit: 'contain',
  transition: 'opacity 0.15s ease',
};

const LISTEN_RING_STYLE = {
  position: 'absolute', top: 0, left: 0, pointerEvents: 'none',
};

function ThinkingDots() {
  return (
    <div style={THINKING_DOTS_WRAP_STYLE}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: '50%', background: '#8B87C0',
          animation: `mascot-think-dot 1.2s ${i * 0.15}s infinite`,
        }} />
      ))}
    </div>
  );
}

export function GuajiMascot({
  mood = 'calm',
  state = 'idle',
  size = 220,
  eyeScale = 1,
  accessory = 'none',
  className = '',
}) {
  let svgKey;
  if (state === 'listening') svgKey = 'listening';
  else if (state === 'speaking') svgKey = 'speaking';
  else if (state === 'thinking') svgKey = 'thinking';
  else svgKey = mood;

  const svgFile = SVG_MAP[svgKey] || SVG_MAP.calm;
  const svgPath = `${process.env.PUBLIC_URL}/assets/mascot/${svgFile}`;

  const bobSpeed =
    state === 'speaking' ? 1.6 :
    state === 'thinking' ? 2.4 : 3.2;

  return (
    <div className={className} style={{
      width: size, height: size, position: 'relative', display: 'inline-block',
    }}>
      <div style={{
        animation: `mascot-bob ${bobSpeed}s ease-in-out infinite`,
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img
          src={svgPath}
          alt="mascot"
          style={IMG_STYLE}
        />
      </div>

      {state === 'listening' && (
        <svg viewBox="0 0 200 200" width={size} height={size} style={LISTEN_RING_STYLE}>
          <g opacity="0.3">
            {[0, 1, 2].map((i) => (
              <circle key={i} cx="100" cy="100" r={50 + i * 30} fill="none"
                stroke="#8B87C0" strokeWidth="2"
                style={{ animation: `mascot-listen-ring 2s ${i * 0.5}s ease-out infinite` }} />
            ))}
          </g>
        </svg>
      )}

      {state === 'thinking' && <ThinkingDots />}
    </div>
  );
}
