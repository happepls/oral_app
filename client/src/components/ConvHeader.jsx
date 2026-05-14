export function ConvHeader({ onBack, title, dots, online = true }) {
  return (
    <div style={{
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--card)', borderBottom: '1px solid var(--border-solid)',
    }}>
      <button onClick={onBack} aria-label="close" style={{
        width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border-solid)',
        background: 'var(--background)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--foreground-muted)', fontSize: 16, padding: 0, flexShrink: 0,
      }}>&times;</button>
      <div style={{
        flex: 1, fontSize: 16, fontWeight: 700, color: 'var(--foreground)',
        minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{title}</div>
      {dots && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {dots.map((active, i) => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: active ? 'var(--primary)' : 'var(--border-solid)',
            }} />
          ))}
        </div>
      )}
      {online && (
        <span style={{
          background: 'rgba(16,185,129,0.12)', color: 'var(--success)',
          fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 9999,
          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
          在线
        </span>
      )}
    </div>
  );
}
