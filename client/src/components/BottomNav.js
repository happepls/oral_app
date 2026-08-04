import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const NAV_ITEMS = [
  { id: 'home',    icon: 'home',   labelKey: 'bottom_nav_home', path: '/discovery' },
  { id: 'goals',   icon: 'flag',   labelKey: 'bottom_nav_goals', path: '/goals' },
  { id: 'profile', icon: 'person', labelKey: 'bottom_nav_profile', path: '/profile' },
];

function BottomNav({ currentPage }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <nav aria-label={t('bottom_nav_label')} style={{
      position: 'fixed', bottom: 0, left: '50%', width: 'min(100%, 720px)',
      transform: 'translateX(-50%)', zIndex: 50,
      background: 'var(--background-translucent)', backdropFilter: 'blur(12px)',
      borderTop: '1px solid var(--border-solid)',
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      minHeight: 72, paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {NAV_ITEMS.map((item) => {
        const active = currentPage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            aria-label={t(item.labelKey)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', cursor: 'pointer', padding: '6px 20px',
              minWidth: 44, minHeight: 44, justifyContent: 'center', borderRadius: 12,
              backgroundColor: active ? 'var(--primary-light)' : 'transparent',
              color: active ? 'var(--primary-dark)' : 'var(--foreground-secondary)',
            }}
            aria-current={active ? 'page' : undefined}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{
                fontSize: 22,
                fontVariationSettings: active
                  ? "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24"
                  : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                color: active ? 'var(--primary-dark)' : 'var(--foreground-secondary)',
              }}
            >
              {item.icon}
            </span>
            <span style={{ fontSize: 12, fontWeight: active ? 700 : 500 }}>
              {t(item.labelKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
