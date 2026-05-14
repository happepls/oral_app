export function MicBar({ recording, onMic, onRestart, label, secondary, className = '' }) {
  return (
    <div className={className} style={{
      padding: '12px 16px 18px', display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--card)', borderTop: '1px solid var(--border-solid)'
    }}>
      <button onClick={onMic} style={{
        flex: 1, height: 56, borderRadius: 28, border: 'none', cursor: 'pointer',
        background: recording ? 'linear-gradient(135deg, var(--error), #f87171)' : 'var(--gradient-brand)',
        color: '#fff', fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: 'var(--shadow-brand-lg)',
        transform: recording ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 120ms',
        animation: recording ? 'mic-pulse 1.2s ease-in-out infinite' : 'none',
      }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>🎤</span>
        {recording ? '正在录音…' : label || '点击说话'}
      </button>
      {secondary}
      {onRestart && (
        <button onClick={onRestart} aria-label="restart" style={{
          width: 48, height: 48, borderRadius: 24, border: '1.5px solid var(--warning)',
          background: 'rgba(245,158,11,0.08)', color: 'var(--warning)',
          cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontFamily: 'inherit',
        }}>↻</button>
      )}
    </div>
  );
}
