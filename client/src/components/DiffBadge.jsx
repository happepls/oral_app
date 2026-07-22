import { useTranslation } from 'react-i18next';

const DIFF_MAP = {
  beginner: ['#047857', 'qa_ui.level_beginner'],
  intermediate: ['#F6B443', 'qa_ui.level_intermediate'],
  advanced: ['#FB7250', 'qa_ui.level_advanced'],
};

export function DiffBadge({ diff }) {
  const { t } = useTranslation();
  const [bg, labelKey] = DIFF_MAP[diff] || ['#9CA3AF', null];
  return (
    <span style={{
      background: bg, color: '#fff', borderRadius: 9999,
      fontSize: 10, fontWeight: 600, padding: '2px 8px',
      display: 'inline-block',
    }}>{labelKey ? t(labelKey) : diff}</span>
  );
}
