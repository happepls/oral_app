const DIFF_MAP = {
  beginner: ['#10B981', '初级'],
  intermediate: ['#F6B443', '中级'],
  advanced: ['#FB7250', '高级'],
};

export function DiffBadge({ diff }) {
  const [bg, label] = DIFF_MAP[diff] || ['#9CA3AF', diff];
  return (
    <span style={{
      background: bg, color: '#fff', borderRadius: 9999,
      fontSize: 10, fontWeight: 600, padding: '2px 8px',
      display: 'inline-block',
    }}>{label}</span>
  );
}
