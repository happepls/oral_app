export function StatCard({ emoji, value, label, unit }) {
  return (
    <div style={{
      background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: '10px 6px',
      boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 2, flex: 1,
      border: '1px solid var(--border-solid)',
    }}>
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>
        {value}{unit && <span style={{ fontSize: 11, fontWeight: 400 }}>{unit}</span>}
      </span>
      <span style={{ fontSize: 10, color: 'var(--foreground-subtle)', textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
    </div>
  );
}
