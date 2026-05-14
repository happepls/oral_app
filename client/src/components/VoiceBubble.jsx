export function VoiceBubble({ duration = '3.4s', dark = false, bars = 24, accent, onPlay }) {
  const c = accent || 'var(--primary)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <button onClick={onPlay} style={{
        width: 30, height: 30, borderRadius: '50%', background: c,
        border: 'none', color: '#fff', cursor: 'pointer', fontSize: 11, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>&#9654;</button>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', flex: 1, height: 22 }}>
        {Array.from({ length: bars }, (_, i) => {
          const h = 4 + Math.abs(Math.sin(i * 1.7)) * 14 + i % 3 * 2;
          return <div key={i} style={{ width: 2.5, height: h, background: c, opacity: dark ? 0.85 : 0.6, borderRadius: 1 }} />;
        })}
      </div>
      <span style={{ fontSize: 10, color: dark ? 'rgba(255,255,255,0.7)' : 'var(--foreground-muted)', flexShrink: 0, fontWeight: 500 }}>{duration}</span>
    </div>
  );
}
