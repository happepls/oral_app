import { useTranslation } from 'react-i18next';

const DIFF_MAP = {
  beginner: ['#D1FAE5', '#065F46', 'qa_ui.level_beginner'],
  intermediate: ['#FEF3C7', '#92400E', 'qa_ui.level_intermediate'],
  advanced: ['#FFEDD5', '#9A3412', 'qa_ui.level_advanced'],
};

export function DiffBadge({ diff }) {
  const { t } = useTranslation();
  const [bg, color, labelKey] = DIFF_MAP[diff] || ['#E2E8F0', '#334155', null];
  return (
    <span style={{
      background: bg, color, borderRadius: 9999,
      fontSize: 12, fontWeight: 600, padding: '3px 8px',
      display: 'inline-block',
    }}>{labelKey ? t(labelKey) : diff}</span>
  );
}
