import React from 'react';
import { useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { id: 'home',    icon: 'home',   label: '首页', path: '/discovery' },
  { id: 'goals',   icon: 'flag',   label: '目标', path: '/goals' },
  { id: 'profile', icon: 'person', label: '我的', path: '/profile' },
];

function BottomNav({ currentPage }) {
  const navigate = useNavigate();

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: 'rgba(246,247,248,0.96)', backdropFilter: 'blur(12px)',
      borderTop: '1px solid var(--border-solid)',
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      height: 72, paddingBottom: 8,
    }}>
      {NAV_ITEMS.map((item) => {
        const active = currentPage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', cursor: 'pointer', padding: '6px 20px',
              color: active ? 'var(--primary)' : 'var(--foreground-subtle)',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 22,
                fontVariationSettings: active
                  ? "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24"
                  : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                color: active ? 'var(--primary)' : 'var(--foreground-subtle)',
              }}
            >
              {item.icon}
            </span>
            <span style={{ fontSize: 11, fontWeight: active ? 700 : 500 }}>
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default BottomNav;
