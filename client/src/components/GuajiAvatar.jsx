export function GuajiAvatar({ mood = 'calm', size = 36, className = '' }) {
  const blink = 'mascot-blink 4.5s infinite';
  return (
    <div className={className} style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #C8C6E8, #DBD9F2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, overflow: 'hidden',
    }}>
      <svg viewBox="-50 -50 100 100" width={size * 0.92} height={size * 0.92}>
        <ellipse cx="0" cy="2" rx="42" ry="40" fill="#8B87C0" stroke="#3D3B6E" strokeWidth="3" />
        <ellipse cx="0" cy="16" rx="20" ry="16" fill="#AAA7D0" />
        {mood === 'happy' ? (
          <g>
            <circle cx="-14" cy="-8" r="14" fill="#E8B892" />
            <circle cx="14" cy="-8" r="14" fill="#E8B892" />
            <g stroke="#3A2510" strokeWidth={2} fill="none" strokeLinecap="round">
              <path d="M -20 -6 Q -14 -13 -8 -6" />
              <path d="M 8 -6 Q 14 -13 20 -6" />
            </g>
          </g>
        ) : (
          <g style={{ animation: blink, transformOrigin: '0 -8px' }}>
            <circle cx="-14" cy="-8" r="14" fill="#E8B892" />
            <circle cx="14" cy="-8" r="14" fill="#E8B892" />
            <circle cx="-14" cy="-8" r="10" fill="#fff" />
            <circle cx="14" cy="-8" r="10" fill="#fff" />
            <circle cx="-12" cy="-6" r="5.5" fill="#3A2510" />
            <circle cx="16" cy="-6" r="5.5" fill="#3A2510" />
            <circle cx="-9" cy="-9" r="2" fill="#fff" />
            <circle cx="19" cy="-9" r="2" fill="#fff" />
          </g>
        )}
        <path d="M -2.5 5 L 2.5 5 L 0 10 Z" fill="#D4944A" />
      </svg>
    </div>
  );
}
