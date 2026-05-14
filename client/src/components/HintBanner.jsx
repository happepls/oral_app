export function HintBanner({ text, onSkip }) {
  return (
    <div style={{ margin: '0 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        flex: 1, padding: '9px 12px', borderRadius: 'var(--radius-md)',
        background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)',
        fontSize: 12, color: 'var(--foreground-secondary)', lineHeight: 1.45,
      }}>💡 {text}</div>
      {onSkip && (
        <button onClick={onSkip} style={{
          padding: '8px 14px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-solid)', background: 'var(--card)',
          color: 'var(--foreground-secondary)', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
        }}>跳过 →</button>
      )}
    </div>
  );
}
