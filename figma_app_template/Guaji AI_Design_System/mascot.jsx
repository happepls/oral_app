// ─────────────────────────────────────────────
// Guaji — Purple Owl Mascot
// ─────────────────────────────────────────────
// Cute round purple owl with large eyes, orange beak & feet.
// Based on the new GuaJi brand identity reference.
//
// Props:
//   mood:  'calm' | 'happy' | 'smirk' | 'angry'
//   state: 'idle' | 'thinking' | 'speaking' | 'listening'
//   size:  number (px, default 220)
//   eyeScale: number (default 1)
//   accessory: 'none' | 'tie' | 'glasses'
//   bodyColor / bodyShade / accentColor / beakColor / footColor: palette overrides

function Mascot({
  mood = 'calm',
  state = 'idle',
  size = 220,
  eyeScale = 1,
  accessory = 'none',
  bodyColor = '#9B7FD4',
  bodyShade = '#7B5EBF',
  accentColor = '#B8A0E0',
  beakColor = '#F6A742',
  footColor = '#F6A742'
}) {
  const speakingPhase = useSpeakingPhase(state === 'speaking');
  const beakOpen = state === 'speaking' ? speakingPhase * 4 : 0;

  const bobAnim =
  state === 'speaking' ? 'mascot-bob 1.6s ease-in-out infinite' :
  state === 'thinking' ? 'mascot-bob 2.4s ease-in-out infinite' :
  'mascot-bob 3.2s ease-in-out infinite';

  const id = React.useId();

  return (
    <div style={{ width: size, height: size, position: 'relative', display: 'inline-block' }}>
      <MascotStyles />
      <svg viewBox="-110 -130 220 250" width={size} height={size} style={{ animation: bobAnim, overflow: 'visible' }}>
        <defs>
          <linearGradient id={`owlBody-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={bodyColor} />
            <stop offset="100%" stopColor={bodyShade} />
          </linearGradient>
        </defs>

        {/* Floor shadow */}
        <ellipse cx="0" cy="100" rx="48" ry="6" fill="rgba(123,94,191,0.18)" />

        {/* Ear tufts */}
        <path d="M -28 -82 Q -22 -100 -14 -80 Z" fill={bodyShade} />
        <path d="M 28 -82 Q 22 -100 14 -80 Z" fill={bodyShade} />

        {/* Wings — tucked against body */}
        <g style={{ transformOrigin: '-50px 0px', animation: state === 'speaking' || state === 'thinking' ? 'mascot-arm 0.9s ease-in-out infinite' : 'none' }}>
          <path d="M -50 -10 Q -68 8 -58 40 Q -46 30 -42 10 Z" fill={bodyShade} />
        </g>
        <g style={{ transformOrigin: '50px 0px', animation: state === 'speaking' || state === 'thinking' ? 'mascot-arm 0.9s ease-in-out infinite reverse' : 'none' }}>
          <path d="M 50 -10 Q 68 8 58 40 Q 46 30 42 10 Z" fill={bodyShade} />
        </g>

        {/* Body — round egg */}
        <ellipse cx="0" cy="0" rx="52" ry="68" fill={`url(#owlBody-${id})`} />

        {/* Belly — white oval */}
        <ellipse cx="0" cy="14" rx="34" ry="44" fill="#FFFFFF" />

        {/* Face disc — lighter purple area around eyes */}
        <ellipse cx="0" cy="-26" rx="46" ry="38" fill={accentColor} />

        {/* Eye sockets — white */}
        <g transform="translate(0, -28)">
          <OwlEyes mood={mood} state={state} eyeScale={eyeScale} cx={18} cy={0} />
        </g>

        {/* Beak — small orange triangle */}
        <g transform={`translate(0, ${-8 + beakOpen / 2})`}>
          <path d={`M -6 0 L 6 0 L 0 ${10 + beakOpen} Z`} fill={beakColor} />
          {beakOpen > 0.5 &&
          <path d={`M -3 ${beakOpen / 2 + 1} L 3 ${beakOpen / 2 + 1} L 0 ${7 + beakOpen / 2} Z`} fill="#3E1A0A" opacity="0.5" />
          }
        </g>

        {/* Necktie accessory */}
        {accessory === 'tie' &&
        <g transform="translate(0, 4)">
            <path d="M -7 0 L 7 0 L 4 6 L -4 6 Z" fill="#FFFFFF" />
            <path d="M -8 6 L 8 6 L 6 38 L 0 46 L -6 38 Z" fill="#FFFFFF" />
            <path d="M -7 8 L 7 8 L 5 36 L 0 42 L -5 36 Z" fill={accentColor} opacity="0.5" />
          </g>
        }

        {/* Glasses accessory */}
        {accessory === 'glasses' &&
        <g transform="translate(0, -28)" stroke="#2C1A0E" strokeWidth={3} fill="none">
            <circle cx={-18} cy={0} r={16 * eyeScale} />
            <circle cx={18} cy={0} r={16 * eyeScale} />
            <line x1={-2} y1={0} x2={2} y2={0} />
            <line x1={-18 - 16 * eyeScale} y1={-2} x2={-18 - 22 * eyeScale} y2={-6} strokeLinecap="round" />
            <line x1={18 + 16 * eyeScale} y1={-2} x2={18 + 22 * eyeScale} y2={-6} strokeLinecap="round" />
          </g>
        }

        {/* Feet — orange toes */}
        <g transform="translate(-16, 64)">
          <path d="M -6 0 L -10 8 M -6 0 L -4 9 M -6 0 L 2 7" stroke={footColor} strokeWidth={4} strokeLinecap="round" fill="none" />
        </g>
        <g transform="translate(16, 64)">
          <path d="M 6 0 L 10 8 M 6 0 L 4 9 M 6 0 L -2 7" stroke={footColor} strokeWidth={4} strokeLinecap="round" fill="none" />
        </g>

        {/* Tail */}
        <path d="M 36 52 Q 60 52 54 74 Q 44 66 36 58 Z" fill={bodyShade} />
      </svg>

      {state === 'thinking' && <ThinkingDots />}
    </div>);

}

// Shared keyframes
function MascotStyles() {
  return (
    <style>{`
      @keyframes mascot-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
      @keyframes mascot-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
      @keyframes mascot-think-dot { 0%, 80%, 100% { opacity: 0.2; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
      @keyframes mascot-arm { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-10deg); } }
    `}</style>);

}

// ── Hooks ─────────────────────────────────────
function useSpeakingPhase(active) {
  const [p, setP] = React.useState(0);
  React.useEffect(() => {
    if (!active) {setP(0);return;}
    let raf,t0 = performance.now();
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

// ── Eyes — ALWAYS A PAIR ──
function OwlEyes({ mood, state, eyeScale = 1, cx = 18, cy = 0 }) {
  const ES = eyeScale;
  const blinkAnim = state === 'idle' ? 'mascot-blink 4.5s infinite' : 'none';

  const pupilOffset = {
    calm: { dx: 0, dy: 0 },
    happy: { dx: 0, dy: -2 },
    smirk: { dx: 4, dy: 1 },
    angry: { dx: 0, dy: 2 }
  }[mood] || { dx: 0, dy: 0 };

  const happyEyes = mood === 'happy';

  const renderHappyEye = (x) =>
  <path
    d={`M ${x - 12 * ES} 2 Q ${x} ${-8 * ES} ${x + 12 * ES} 2`}
    stroke="#2C1A0E" strokeWidth={3} fill="none" strokeLinecap="round" />;



  const renderEye = (x, side) =>
  <g style={{ animation: blinkAnim, transformOrigin: `${x}px ${cy}px` }}>
      {/* White sclera */}
      <circle cx={x} cy={cy} r={14 * ES} fill="#FFFFFF" />
      {/* Pupil */}
      <circle
      cx={x + pupilOffset.dx * ES}
      cy={cy + pupilOffset.dy * ES}
      r={8 * ES}
      fill="#2C1A0E" />
    
      {/* Highlight — large */}
      <circle
      cx={x + (pupilOffset.dx + (side === 'L' ? 3 : 2.5)) * ES}
      cy={cy + pupilOffset.dy * ES - 3 * ES}
      r={3 * ES}
      fill="#FFFFFF" />
    
      {/* Highlight — small */}
      <circle
      cx={x + (pupilOffset.dx - (side === 'L' ? 2 : 2.5)) * ES}
      cy={cy + pupilOffset.dy * ES + 1.5 * ES}
      r={1.5 * ES}
      fill="#FFFFFF" />
    
    </g>;


  // Brows
  const browY = cy - 22 * ES;
  const brows = mood === 'angry' ?
  <g stroke="#2C1A0E" strokeWidth={3.5} strokeLinecap="round">
      <path d={`M ${-cx - 12 * ES} ${browY - 2 * ES} L ${-cx + 8 * ES} ${browY + 4 * ES}`} />
      <path d={`M ${cx - 8 * ES} ${browY + 4 * ES} L ${cx + 12 * ES} ${browY - 2 * ES}`} />
    </g> :
  mood === 'smirk' ?
  <g stroke="#2C1A0E" strokeWidth={2.8} fill="none" strokeLinecap="round">
      <path d={`M ${-cx - 10 * ES} ${browY + 2} Q ${-cx} ${browY - 4 * ES} ${-cx + 10 * ES} ${browY}`} />
      <path d={`M ${cx - 10 * ES} ${browY} Q ${cx} ${browY - 4 * ES} ${cx + 10 * ES} ${browY + 2}`} />
    </g> :
  null;

  return (
    <g>
      {brows}
      {happyEyes ?
      <g>{renderHappyEye(-cx)}{renderHappyEye(cx)}</g> :

      <g>{renderEye(-cx, 'L')}{renderEye(cx, 'R')}</g>
      }
    </g>);

}

// ── Thinking dots bubble ──
function ThinkingDots() {
  return (
    <div style={{
      position: 'absolute', top: 4, right: '50%', transform: 'translateX(60%)',
      background: '#fff', borderRadius: 14, padding: '6px 10px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', gap: 4
    }}>
      {[0, 1, 2].map((i) =>
      <div key={i} style={{
        width: 6, height: 6, borderRadius: '50%', background: '#9B7FD4',
        animation: `mascot-think-dot 1.2s ${i * 0.15}s infinite`
      }} />
      )}
    </div>);

}

// ── Avatar (chat thumbnail) — head only ──
function MascotAvatar({ mood = 'calm', size = 40, accessory = 'none' }) {
  const blink = 'mascot-blink 4.5s infinite';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #D4C4F0, #E8DFFB)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, overflow: 'hidden'
    }}>
      <MascotStyles />
      <svg viewBox="-50 -50 100 100" width={size * 0.95} height={size * 0.95} style={{ overflow: 'visible' }}>
        {/* Ear tufts */}
        <path d="M -24 -30 Q -20 -42 -12 -32 Z" fill="#7B5EBF" />
        <path d="M 24 -30 Q 20 -42 12 -32 Z" fill="#7B5EBF" />
        {/* Head/face */}
        <ellipse cx="0" cy="0" rx="40" ry="36" fill="#9B7FD4" />
        {/* Face disc */}
        <ellipse cx="0" cy="-4" rx="32" ry="26" fill="#B8A0E0" />
        {/* Eyes */}
        {mood === 'happy' ?
        <g stroke="#2C1A0E" strokeWidth={2.5} fill="none" strokeLinecap="round">
            <path d="M -22 -2 Q -14 -10 -6 -2" />
            <path d="M 6 -2 Q 14 -10 22 -2" />
          </g> :

        <g style={{ animation: blink, transformOrigin: '0 -4px' }}>
            <circle cx="-14" cy="-4" r="10" fill="#fff" />
            <circle cx="-12" cy="-2" r="5.5" fill="#2C1A0E" />
            <circle cx="-10" cy="-5" r="2" fill="#FFFFFF" />
            <circle cx="14" cy="-4" r="10" fill="#fff" />
            <circle cx="16" cy="-2" r="5.5" fill="#2C1A0E" />
            <circle cx="18" cy="-5" r="2" fill="#FFFFFF" />
          </g>
        }
        {/* Beak */}
        <path d="M -4 6 L 4 6 L 0 14 Z" fill="#F6A742" />
        {/* Glasses */}
        {accessory === 'glasses' &&
        <g stroke="#2C1A0E" strokeWidth={2} fill="none">
            <circle cx={-14} cy={-4} r={12} />
            <circle cx={14} cy={-4} r={12} />
            <line x1={-2} y1={-4} x2={2} y2={-4} />
          </g>
        }
      </svg>
    </div>);

}

Object.assign(window, { Mascot, MascotAvatar });