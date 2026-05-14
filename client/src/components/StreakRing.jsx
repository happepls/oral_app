import React from 'react';

export function StreakRing({ streak = 0, checkedInToday = false, onCheckin, monthlyCheckinDays = 0 }) {
  const r = 42, circ = 2 * Math.PI * r;
  const pct = Math.min(streak / 30, 1);

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-solid)', boxShadow: 'var(--shadow-card)',
      padding: 16, display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
        <svg width="84" height="84" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={r} fill="none" stroke="#F3F4F6" strokeWidth="8" />
          <circle cx="48" cy="48" r={r} fill="none" stroke="var(--primary)" strokeWidth="8"
            strokeLinecap="round" strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            transform="rotate(-90 48 48)" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1 }}>{streak}</span>
          <span style={{ fontSize: 9, color: 'var(--foreground-subtle)' }}>天连续</span>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
          连续学习 {streak} 天 🔥
        </div>
        <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginBottom: 10 }}>
          目标：30天学习计划 · {Math.round(pct * 100)}% 完成
        </div>
        {!checkedInToday && onCheckin ? (
          <button onClick={onCheckin} style={{
            background: 'var(--gradient-brand)', color: '#fff', border: 'none',
            borderRadius: 10, padding: '7px 16px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', boxShadow: 'var(--shadow-brand)',
          }}>✅ 今日打卡</button>
        ) : checkedInToday ? (
          <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>✅ 今日已打卡</span>
        ) : null}
      </div>
    </div>
  );
}
