// ─────────────────────────────────────────────
// Guaji — Purple Owl Mascot (复刻 Logo 风格)
// Cute circular owl with smooth proportions
// ─────────────────────────────────────────────

function useSpeakingPhase(active) {
  const [p, setP] = React.useState(0);
  React.useEffect(() => {
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

function MascotStyles() {
  return (
    <style>{`
      @keyframes mascot-bob   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
      @keyframes mascot-blink { 0%,88%,100%{transform:scaleY(1)} 92%{transform:scaleY(0.07)} }
      @keyframes mascot-think-dot { 0%,80%,100%{opacity:.2;transform:translateY(0)} 40%{opacity:1;transform:translateY(-4px)} }
    `}</style>
  );
}

// ── One eye (复刻 logo 风格) ──
function OwlEye({ x, y, mood, state, ring, inner, pupil, outline }) {
  const blink = state === 'idle' ? 'mascot-blink 5s infinite' : 'none';
  const isHappy = mood === 'happy';

  if (isHappy) {
    // Happy = closed eyes with curve
    return (
      <g>
        <circle cx={x} cy={y} r="18.5" fill={ring} stroke={outline} strokeWidth="2"/>
        <path d={`M ${x-13} ${y+2} Q ${x} ${y-8} ${x+13} ${y+2}`}
          stroke={outline} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
      </g>
    );
  }

  return (
    <g style={{ animation: blink, transformOrigin: `${x}px ${y}px` }}>
      {/* Outer ring (peach) */}
      <circle cx={x} cy={y} r="18.5" fill={ring} stroke={outline} strokeWidth="2"/>
      {/* Inner (cream) */}
      <circle cx={x} cy={y} r="13" fill={inner}/>
      {/* Pupil (dark blue) */}
      <circle cx={x} cy={y+0.5} r="7.5" fill={pupil}/>
      {/* Shine 1 (large) */}
      <circle cx={x+3} cy={y-3.5} r="2.8" fill="#fff"/>
      {/* Shine 2 (small) */}
      <circle cx={x-1.5} cy={y+2.5} r="1.2" fill="#fff"/>
    </g>
  );
}

function ThinkingDots() {
  return (
    <div style={{
      position:'absolute', top:6, right:'50%', transform:'translateX(70%)',
      background:'#fff', borderRadius:14, padding:'6px 10px',
      boxShadow:'0 4px 12px rgba(0,0,0,0.12)', display:'flex', gap:4,
    }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width:6, height:6, borderRadius:'50%', background:'#7070C4',
          animation:`mascot-think-dot 1.2s ${i*0.15}s infinite`,
        }}/>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// FULL MASCOT — Exact Logo Recreation
// viewBox: "-90 -70 180 220"
// Overall silhouette: large circular owl
// Head blends seamlessly into body
// ────────────────────────────────────────────────────────────
function Mascot({
  mood         = 'calm',
  state        = 'idle',
  size         = 220,
  accessory    = 'none',
  // GuaJi token colours
  bodyColor    = '#7070C4',
  bodyShade    = '#4E4E9A',
  eyeRingColor = '#F0A878',
  eyeInnerColor= '#FDDDC8',
  pupilColor   = '#252060',
  outlineColor = '#252065',
  beakColor    = '#F0A030',
  footColor    = '#F0A030',
  accentColor, eyeScale, // ignored legacy
}) {
  const speakPhase = useSpeakingPhase(state === 'speaking');
  const beakOpen   = state === 'speaking' ? speakPhase * 4 : 0;
  const uid = React.useId ? React.useId() : 'm' + Math.random().toString(36).slice(2,6);

  const bob =
    state === 'speaking'  ? 'mascot-bob 1.4s ease-in-out infinite' :
    state === 'thinking'  ? 'mascot-bob 2.2s ease-in-out infinite' :
                            'mascot-bob 3.2s ease-in-out infinite';

  return (
    <div style={{ width:size, height:size, position:'relative', display:'inline-block' }}>
      <MascotStyles/>
      <svg viewBox="-90 -70 180 220" width={size} height={size}
        style={{ animation:bob, overflow:'visible' }}>

        <defs>
          {/* Main body gradient */}
          <radialGradient id={`body${uid}`} cx="40%" cy="28%" r="72%">
            <stop offset="0%"   stopColor="#9292D2"/>
            <stop offset="48%"  stopColor={bodyColor}/>
            <stop offset="100%" stopColor={bodyShade}/>
          </radialGradient>
          {/* Belly light area */}
          <radialGradient id={`belly${uid}`} cx="50%" cy="35%" r="68%">
            <stop offset="0%"   stopColor="#BBBAEA"/>
            <stop offset="100%" stopColor="#8888CC"/>
          </radialGradient>
          {/* Wing shade */}
          <linearGradient id={`wing${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={bodyShade}/>
            <stop offset="100%" stopColor="#3A3A82"/>
          </linearGradient>
          {/* Shadow under body */}
          <radialGradient id={`shadow${uid}`} cx="50%" cy="0%" r="100%">
            <stop offset="0%"   stopColor={bodyShade} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={bodyShade} stopOpacity="0"/>
          </radialGradient>
        </defs>

        {/* Ground shadow */}
        <ellipse cx="0" cy="142" rx="42" ry="6" fill="rgba(37,32,101,0.15)"/>

        {/* MAIN BODY — large smooth circle blending head & torso */}
        <circle cx="0" cy="18" r="64"
          fill={`url(#body${uid})`} stroke={outlineColor} strokeWidth="4.5"/>

        {/* Belly highlight — lighter center area */}
        <ellipse cx="0" cy="28" rx="38" ry="48"
          fill={`url(#belly${uid})`} opacity="0.65"/>

        {/* LEFT WING */}
        <g>
          <path d="M -58 -8 Q -85 10, -78 58 Q -62 42, -52 8 Z"
            fill={`url(#wing${uid})`} stroke={outlineColor} strokeWidth="2.5" strokeLinejoin="round"/>
          {/* Wing highlight */}
          <ellipse cx="-68" cy="22" rx="12" ry="20" fill="#fff" opacity="0.08"/>
        </g>

        {/* RIGHT WING */}
        <g>
          <path d="M 58 -8 Q 85 10, 78 58 Q 62 42, 52 8 Z"
            fill={`url(#wing${uid})`} stroke={outlineColor} strokeWidth="2.5" strokeLinejoin="round"/>
          {/* Wing highlight */}
          <ellipse cx="68" cy="22" rx="12" ry="20" fill="#fff" opacity="0.08"/>
        </g>

        {/* EYES — spaced wide apart, large */}
        <OwlEye x={-28} y={-18} mood={mood} state={state}
          ring={eyeRingColor} inner={eyeInnerColor} pupil={pupilColor} outline={outlineColor}/>
        <OwlEye x={28} y={-18} mood={mood} state={state}
          ring={eyeRingColor} inner={eyeInnerColor} pupil={pupilColor} outline={outlineColor}/>

        {/* BEAK — small yellow triangle */}
        <path d={`M -6 8 L 6 8 L 0 ${19 + beakOpen} Z`}
          fill={beakColor} stroke={outlineColor} strokeWidth="2" strokeLinejoin="round"/>

        {/* FEET — two orange stumps */}
        <g transform="translate(-14,78)">
          <path d="M 0 0 L -6 9 M 0 0 L 0 10 M 0 0 L 6 9"
            stroke={footColor} strokeWidth="4" strokeLinecap="round"/>
        </g>
        <g transform="translate(14,78)">
          <path d="M 0 0 L -6 9 M 0 0 L 0 10 M 0 0 L 6 9"
            stroke={footColor} strokeWidth="4" strokeLinecap="round"/>
        </g>

      </svg>
      {state === 'thinking' && <ThinkingDots/>}
    </div>
  );
}

// ── Avatar — real app icon ──
function MascotAvatar({ mood='calm', size=40, accessory='none' }) {
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%',
      overflow:'hidden', flexShrink:0, display:'block', lineHeight:0,
    }}>
      <img src="../../assets/logo-app-icon.jpg" alt="GuaJi"
        style={{
          width:'100%', height:'100%', objectFit:'cover',
          display:'block', transform:'scale(1.06)', transformOrigin:'center',
        }}/>
    </div>
  );
}

Object.assign(window, { Mascot, MascotAvatar });
