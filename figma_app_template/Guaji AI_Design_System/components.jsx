// ─────────────────────────────────────────────
// Guaji AI Design System — Shared Components
// ─────────────────────────────────────────────

const _DS_LIGHT = {
  primary: '#637FF1', primaryLight: '#c3cef8', primaryDark: '#2d44ca', secondary: '#a47af6',
  success: '#10B981', warning: '#F59E0B', error: '#e2412e',
  bg: '#f6f7f8', card: '#ffffff', border: '#E5E7EB',
  fg: '#1a1a1a', fg2: '#374151', fg3: '#6B7280', fg4: '#9CA3AF',
  muted: '#ececf0',
  gradient: 'linear-gradient(135deg, #637FF1, #a47af6)',
  gradientWarm: 'linear-gradient(135deg, #F6B443, #F97316)',
  shadow: '0 10px 23px rgba(137,171,241,0.18)',
  shadowLg: '0 16px 32px rgba(137,171,241,0.24)',
  shadowCard: '0 1px 3px rgba(0,0,0,0.08)',
  radiusSm: 10, radiusMd: 13, radiusLg: 20, radiusXl: 29
};
const _DS_DARK = {
  primary: '#7B95F5', primaryLight: '#1e2d5e', primaryDark: '#a3b3f7', secondary: '#b89bf8',
  success: '#34D399', warning: '#FBBF24', error: '#F87171',
  bg: '#0f1923', card: '#1a2535', border: '#253044',
  fg: '#F1F5F9', fg2: '#CBD5E1', fg3: '#94A3B8', fg4: '#64748B',
  muted: '#1e2d45',
  gradient: 'linear-gradient(135deg, #637FF1, #a47af6)',
  gradientWarm: 'linear-gradient(135deg, #F6B443, #F97316)',
  shadow: '0 10px 23px rgba(99,127,241,0.30)',
  shadowLg: '0 16px 32px rgba(99,127,241,0.40)',
  shadowCard: '0 1px 4px rgba(0,0,0,0.45)',
  radiusSm: 10, radiusMd: 13, radiusLg: 20, radiusXl: 29
};
const DS = new Proxy({}, { get: (_, k) => (window._guaji_dark ? _DS_DARK : _DS_LIGHT)[k] });

// ── Bottom Nav ──
function BottomNav({ current, onNav }) {
  const items = [
  { id: 'home', icon: 'home', label: '首页' },
  { id: 'goals', icon: 'flag', label: '目标' },
  { id: 'profile', icon: 'person', label: '我的' }];

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'rgba(246,247,248,0.96)', borderTop: `1px solid ${DS.border}`,
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      height: 72, paddingBottom: 8
    }}>
      {items.map((item) =>
      <button key={item.id} onClick={() => onNav(item.id)} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: 'none', border: 'none', cursor: 'pointer', padding: '6px 20px',
        color: current === item.id ? DS.primary : DS.fg4
      }}>
          <span className="material-symbols-outlined" style={{
          fontSize: 22,
          fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
          color: current === item.id ? DS.primary : DS.fg4
        }}>{item.icon}</span>
          <span style={{ fontSize: 11, fontWeight: current === item.id ? 700 : 500 }}>{item.label}</span>
        </button>
      )}
    </div>);

}

// ── Card ──
function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: DS.card, borderRadius: DS.radiusLg,
      border: `1px solid ${DS.border}`, boxShadow: DS.shadowCard,
      ...style
    }}>{children}</div>);

}

// ── Primary Button ──
function PrimaryBtn({ children, onClick, style = {}, small = false }) {
  return (
    <button onClick={onClick} style={{
      background: DS.gradient, color: '#fff', border: 'none',
      borderRadius: small ? DS.radiusMd : DS.radiusLg,
      padding: small ? '8px 16px' : '13px 24px',
      fontSize: small ? 12 : 15, fontWeight: 600, fontFamily: 'Lexend, sans-serif',
      cursor: 'pointer', width: '100%', boxShadow: DS.shadow,
      ...style
    }}>{children}</button>);

}

// ── Ghost Button ──
function GhostBtn({ children, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', color: DS.fg2, border: `1.5px solid ${DS.border}`,
      borderRadius: DS.radiusLg, padding: '13px 24px',
      fontSize: 15, fontWeight: 600, fontFamily: 'Lexend, sans-serif',
      cursor: 'pointer', width: '100%', ...style
    }}>{children}</button>);

}

// ── Stat Mini Card ──
function StatMini({ emoji, value, label }) {
  return (
    <div style={{
      background: DS.card, borderRadius: DS.radiusLg, padding: '10px 6px',
      boxShadow: DS.shadowCard, display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 2, flex: 1
    }}>
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: DS.fg }}>{value}</span>
      <span style={{ fontSize: 10, color: DS.fg4, textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
    </div>);

}

// ── Section Header ──
function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: DS.fg, margin: 0, lineHeight: 1.3 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 11, color: DS.fg4, margin: '2px 0 0' }}>{subtitle}</p>}
    </div>);

}

// ── Badge ──
function DiffBadge({ diff }) {
  const map = { beginner: ['#10B981', '初级'], intermediate: ['#F6B443', '中级'], advanced: ['#FB7250', '高级'] };
  const [bg, label] = map[diff] || ['#9CA3AF', diff];
  return (
    <span style={{
      background: bg, color: '#fff', borderRadius: 9999,
      fontSize: 10, fontWeight: 600, padding: '2px 8px'
    }}>{label}</span>);

}

// ── Message Bubble ──
function Bubble({ isUser, text, loading = false }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-end',
      flexDirection: isUser ? 'row-reverse' : 'row'
    }}>
      {!isUser &&
      <div style={{
        width: 32, height: 32, borderRadius: '50%', background: DS.secondary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, color: '#fff', fontSize: 12, fontWeight: 700
      }}>AI</div>
      }
      <div style={{
        background: isUser ? DS.primary : '#E1E2E6',
        color: isUser ? '#fff' : '#1F2937',
        borderRadius: isUser ? '18px 18px 6px 18px' : '6px 18px 18px 18px',
        padding: '10px 14px', maxWidth: '72%', fontSize: 13.5, lineHeight: 1.5
      }}>
        {loading ?
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' }}>
            {[0, 200, 400].map((d) =>
          <div key={d} style={{
            width: 6, height: 6, borderRadius: '50%', background: '#9CA3AF',
            animation: 'pulse 1.2s infinite', animationDelay: `${d}ms`
          }} />
          )}
          </div> :
        text}
      </div>
    </div>);

}

// ── Streak Ring SVG ──
function StreakRing({ streak = 7, checked = false, onCheckin }) {
  const r = 42,circ = 2 * Math.PI * r;
  const pct = Math.min(streak / 30, 1);
  return (
    <Card style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
        <svg width="84" height="84" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={r} fill="none" stroke="#F3F4F6" strokeWidth="8" />
          <circle cx="48" cy="48" r={r} fill="none" stroke={DS.primary} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          transform="rotate(-90 48 48)" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center'
        }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: DS.fg, lineHeight: 1 }}>{streak}</span>
          <span style={{ fontSize: 9, color: DS.fg4 }}>天连续</span>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: DS.fg, marginBottom: 4 }}>连续学习 {streak} 天 🔥</div>
        <div style={{ fontSize: 12, color: DS.fg3, marginBottom: 10 }}>目标：30天学习计划 · {Math.round(pct * 100)}% 完成</div>
        {!checked ?
        <button onClick={onCheckin} style={{
          background: DS.gradient, color: '#fff', border: 'none',
          borderRadius: 10, padding: '7px 16px', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', boxShadow: DS.shadow
        }}>✅ 今日打卡</button> :

        <span style={{ fontSize: 12, color: DS.success, fontWeight: 600 }}>✅ 今日已打卡</span>
        }
      </div>
    </Card>);

}

Object.assign(window, { DS, BottomNav, Card, PrimaryBtn, GhostBtn, StatMini, SectionHeader, DiffBadge, Bubble, StreakRing });