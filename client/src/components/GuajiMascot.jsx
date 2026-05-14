import React, { useState, useEffect } from 'react';

const C = {
  body: '#8B87C0',
  outline: '#3D3B6E',
  belly: '#AAA7D0',
  eyeRing: '#E8B892',
  pupil: '#3A2510',
  beak: '#D4944A',
};

const MOOD_PUPIL = {
  calm:     { dx: 0, dy: 0 },
  happy:    { dx: 0, dy: -2 },
  excited:  { dx: 0, dy: -2 },
  smirk:    { dx: 4, dy: 1 },
  angry:    { dx: 0, dy: 2 },
  proud:    { dx: 3, dy: -1 },
  surprised:{ dx: 0, dy: 0 },
  confused: { dx: -3, dy: 2 },
  sleepy:   { dx: 0, dy: 3 },
  winking:  { dx: 2, dy: 0 },
  loving:   { dx: 0, dy: -1 },
  thinking: { dx: -2, dy: -1 },
};

function useSpeakingPhase(active) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!active) { setP(0); return; }
    let raf, t0 = performance.now();
    const tick = (t) => {
      const elapsed = (t - t0) / 1000;
      const v = (Math.sin(elapsed * 11) * 0.5 + Math.sin(elapsed * 17) * 0.3 + Math.sin(elapsed * 5) * 0.2 + 1) / 2;
      setP(Math.max(0, Math.min(1, v)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return p;
}

function OwlEyes({ mood, state, ES = 1, cx = 17 }) {
  const blinkAnim = state === 'idle' ? 'mascot-blink 4.5s infinite' : 'none';
  const off = MOOD_PUPIL[mood] || MOOD_PUPIL.calm;

  const closedHappyEyes = () => (
    <g stroke={C.pupil} strokeWidth={2.5} fill="none" strokeLinecap="round">
      <path d={`M ${-cx - 10 * ES} 2 Q ${-cx} ${-8 * ES} ${-cx + 10 * ES} 2`} />
      <path d={`M ${cx - 10 * ES} 2 Q ${cx} ${-8 * ES} ${cx + 10 * ES} 2`} />
    </g>
  );

  const normalEye = (x, side, pupilR = 8.5) => (
    <g style={{ animation: blinkAnim, transformOrigin: `${x}px 0px` }}>
      <circle cx={x} cy={0} r={15 * ES} fill="#FFFFFF" />
      <circle cx={x + off.dx * ES + (side === 'L' ? 3 : -3)} cy={off.dy * ES + 3} r={pupilR * ES} fill={C.pupil} />
      <circle cx={x + off.dx * ES + (side === 'L' ? 7 : 1)} cy={off.dy * ES - 1} r={3.5 * ES} fill="#FFFFFF" />
      <circle cx={x + off.dx * ES + (side === 'L' ? 1 : -1)} cy={off.dy * ES + 6 * ES} r={1.5 * ES} fill="#FFFFFF" />
    </g>
  );

  const eyeRings = () => (
    <g>
      <circle cx={-cx} cy={0} r={20 * ES} fill={C.eyeRing} />
      <circle cx={cx} cy={0} r={20 * ES} fill={C.eyeRing} />
    </g>
  );

  let eyes;
  switch (mood) {
    case 'happy':
    case 'loving':
      eyes = <g>{eyeRings()}{closedHappyEyes()}</g>;
      break;
    case 'sleepy':
      eyes = (
        <g>
          {eyeRings()}
          <g stroke={C.pupil} strokeWidth={2} fill="none" strokeLinecap="round">
            <path d={`M ${-cx - 10 * ES} 1 Q ${-cx} ${4 * ES} ${-cx + 10 * ES} 1`} />
            <path d={`M ${cx - 10 * ES} 1 Q ${cx} ${4 * ES} ${cx + 10 * ES} 1`} />
          </g>
        </g>
      );
      break;
    case 'winking':
      eyes = (
        <g>
          {eyeRings()}
          {normalEye(-cx, 'L')}
          <g stroke={C.pupil} strokeWidth={2.5} fill="none" strokeLinecap="round">
            <path d={`M ${cx - 10 * ES} 2 Q ${cx} ${-8 * ES} ${cx + 10 * ES} 2`} />
          </g>
        </g>
      );
      break;
    case 'surprised':
      eyes = (
        <g>
          {eyeRings()}
          <g>
            <circle cx={-cx} cy={0} r={15 * ES} fill="#FFFFFF" />
            <circle cx={-cx} cy={1} r={10 * ES} fill={C.pupil} />
            <circle cx={-cx + 4} cy={-3} r={4 * ES} fill="#FFFFFF" />
            <circle cx={cx} cy={0} r={15 * ES} fill="#FFFFFF" />
            <circle cx={cx} cy={1} r={10 * ES} fill={C.pupil} />
            <circle cx={cx + 4} cy={-3} r={4 * ES} fill="#FFFFFF" />
          </g>
        </g>
      );
      break;
    default:
      eyes = <g>{eyeRings()}{normalEye(-cx, 'L')}{normalEye(cx, 'R')}</g>;
  }

  const browY = -26 * ES;
  let brows = null;
  if (mood === 'angry') {
    brows = (
      <g stroke={C.pupil} strokeWidth={3} strokeLinecap="round">
        <path d={`M ${-cx - 12 * ES} ${browY} L ${-cx + 8 * ES} ${browY + 6 * ES}`} />
        <path d={`M ${cx - 8 * ES} ${browY + 6 * ES} L ${cx + 12 * ES} ${browY}`} />
      </g>
    );
  } else if (mood === 'smirk' || mood === 'proud') {
    brows = (
      <g stroke={C.pupil} strokeWidth={2.5} fill="none" strokeLinecap="round">
        <path d={`M ${-cx - 10 * ES} ${browY + 2} Q ${-cx} ${browY - 4 * ES} ${-cx + 10 * ES} ${browY}`} />
        <path d={`M ${cx - 10 * ES} ${browY} Q ${cx} ${browY - 4 * ES} ${cx + 10 * ES} ${browY + 2}`} />
      </g>
    );
  } else if (mood === 'confused') {
    brows = (
      <g stroke={C.pupil} strokeWidth={2.5} fill="none" strokeLinecap="round">
        <path d={`M ${-cx - 8 * ES} ${browY + 4} L ${-cx + 8 * ES} ${browY}`} />
        <path d={`M ${cx - 8 * ES} ${browY} L ${cx + 8 * ES} ${browY + 4}`} />
      </g>
    );
  }

  return <g>{brows}{eyes}</g>;
}

function ThinkingDots() {
  return (
    <div style={{
      position: 'absolute', top: 4, right: '50%', transform: 'translateX(60%)',
      background: '#fff', borderRadius: 14, padding: '6px 10px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', gap: 4,
    }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: '50%', background: C.body,
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
  const speakingPhase = useSpeakingPhase(state === 'speaking');
  const beakOpen = state === 'speaking' ? speakingPhase * 4 : 0;

  const effectiveMood = state === 'listening' ? 'calm'
    : state === 'thinking' ? 'thinking'
    : state === 'speaking' ? 'excited'
    : mood;

  const bobSpeed =
    state === 'speaking' ? 1.6 :
    state === 'thinking' ? 2.4 : 3.2;

  const wingActive = state === 'speaking' || state === 'thinking';

  return (
    <div className={className} style={{ width: size, height: size, position: 'relative', display: 'inline-block' }}>
      <svg viewBox="-100 -110 200 220" width={size} height={size}
        style={{ animation: `mascot-bob ${bobSpeed}s ease-in-out infinite`, overflow: 'visible' }}>

        {/* Ear tufts — small triangles growing FROM the body top curve */}
        <path d="M -14 -52 C -16 -62, -20 -66, -18 -68 C -16 -66, -10 -60, -6 -52" fill={C.outline} />
        <path d="M 14 -52 C 16 -62, 20 -66, 18 -68 C 16 -66, 10 -60, 6 -52" fill={C.outline} />

        {/* Wings */}
        <g style={{ transformOrigin: '-50px 10px', animation: wingActive ? 'mascot-arm 0.9s ease-in-out infinite' : 'none' }}>
          <ellipse cx="-56" cy="10" rx="14" ry="22" fill={C.outline} transform="rotate(-15 -56 10)" />
        </g>
        <g style={{ transformOrigin: '50px 10px', animation: wingActive ? 'mascot-arm 0.9s ease-in-out infinite reverse' : 'none' }}>
          <ellipse cx="56" cy="10" rx="14" ry="22" fill={C.outline} transform="rotate(15 56 10)" />
        </g>

        {/* Body */}
        <ellipse cx="0" cy="0" rx="50" ry="52" fill={C.body} stroke={C.outline} strokeWidth="4" />

        {/* Belly */}
        <ellipse cx="0" cy="20" rx="28" ry="24" fill={C.belly} />

        {/* Eyes */}
        <g transform="translate(0, -12)">
          <OwlEyes mood={effectiveMood} state={state} ES={eyeScale} cx={17} />
        </g>

        {/* Beak */}
        <g transform={`translate(0, ${4 + beakOpen / 2})`}>
          <path d={`M -3.5 0 L 3.5 0 L 0 ${6 + beakOpen} Z`} fill={C.beak} />
          {beakOpen > 0.5 && (
            <path d={`M -2 ${beakOpen / 2 + 1} L 2 ${beakOpen / 2 + 1} L 0 ${4 + beakOpen / 2} Z`} fill="#1A0A0A" opacity="0.3" />
          )}
        </g>

        {/* Mouth expression for surprised */}
        {effectiveMood === 'surprised' && (
          <ellipse cx="0" cy="12" rx="4" ry="5" fill={C.outline} />
        )}

        {/* Feet */}
        <g transform="translate(-12, 50)">
          <path d="M -3 0 L -6 5 M -3 0 L 0 6 M -3 0 L 3 4" stroke={C.beak} strokeWidth={2.8} strokeLinecap="round" fill="none" />
        </g>
        <g transform="translate(12, 50)">
          <path d="M 3 0 L 6 5 M 3 0 L 0 6 M 3 0 L -3 4" stroke={C.beak} strokeWidth={2.8} strokeLinecap="round" fill="none" />
        </g>

        {/* Decorators per mood */}
        {effectiveMood === 'loving' && (
          <g fill="#E8637A">
            <path d="M -46 -48 C -46 -52, -42 -56, -38 -52 C -34 -56, -30 -52, -30 -48 C -30 -44, -38 -38, -38 -38 C -38 -38, -46 -44, -46 -48 Z" opacity="0.8" />
            <path d="M 36 -52 C 36 -55, 39 -58, 42 -55 C 45 -58, 48 -55, 48 -52 C 48 -49, 42 -44, 42 -44 C 42 -44, 36 -49, 36 -52 Z" opacity="0.6" transform="scale(0.7) translate(20 -20)" />
          </g>
        )}

        {effectiveMood === 'excited' && (
          <g>
            <path d="M -44 -50 L -42 -56 L -40 -50 L -46 -52 L -38 -52 Z" fill="#FFD700" opacity="0.7" />
            <path d="M 40 -46 L 42 -52 L 44 -46 L 38 -48 L 46 -48 Z" fill="#FFD700" opacity="0.5" />
          </g>
        )}

        {effectiveMood === 'confused' && (
          <text x="36" y="-44" fontSize="24" fontWeight="800" fill={C.outline} fontFamily="Lexend, sans-serif">?</text>
        )}

        {effectiveMood === 'sleepy' && (
          <g fill={C.outline} fontFamily="Lexend, sans-serif" fontWeight="700" opacity="0.6">
            <text x="30" y="-42" fontSize="12">z</text>
            <text x="38" y="-52" fontSize="16">z</text>
            <text x="48" y="-58" fontSize="10">z</text>
          </g>
        )}

        {/* Listening rings */}
        {state === 'listening' && (
          <g opacity="0.3">
            {[0, 1, 2].map((i) => (
              <circle key={i} cx="0" cy="-10" r={34 + i * 16} fill="none"
                stroke={C.body} strokeWidth={2}
                style={{ animation: `mascot-listen-ring 2s ${i * 0.5}s ease-out infinite` }} />
            ))}
          </g>
        )}
      </svg>

      {state === 'thinking' && <ThinkingDots />}
    </div>
  );
}
