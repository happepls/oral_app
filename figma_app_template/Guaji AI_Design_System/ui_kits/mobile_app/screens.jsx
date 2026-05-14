// ─────────────────────────────────────────────
// Guaji AI — Screen Components
// ─────────────────────────────────────────────

// ── DISCOVERY (HOME) SCREEN ──
function DiscoveryScreen({ onNav, onOpenConversation }) {
  const [checkedIn, setCheckedIn] = React.useState(false);
  const [filter, setFilter] = React.useState('all');

  const scenarios = [
    { title: '商务自我介绍', emoji: '💼', diff: 'beginner', progress: 100 },
    { title: '机场值机', emoji: '✈️', diff: 'intermediate', progress: 60 },
    { title: '点咖啡', emoji: '☕', diff: 'beginner', progress: 0 },
    { title: '谈判基础', emoji: '🎯', diff: 'intermediate', progress: 0, locked: true },
    { title: '看医生', emoji: '🏥', diff: 'advanced', progress: 0, locked: true },
    { title: '工作面试', emoji: '💡', diff: 'intermediate', progress: 0, locked: true },
  ];

  const filters = [
    { id: 'all', label: '全部' },
    { id: 'in-progress', label: '进行中' },
    { id: 'completed', label: '已完成' },
    { id: 'not-started', label: '未开始' },
  ];

  const filtered = scenarios.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'in-progress') return !s.locked && s.progress > 0 && s.progress < 100;
    if (filter === 'completed') return s.progress === 100;
    if (filter === 'not-started') return !s.locked && s.progress === 0;
    return true;
  });

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: DS.bg, paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 12, color: DS.fg4, margin: 0 }}>早上好，</p>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: DS.fg, margin: '2px 0 6px' }}>
            学习者 <span style={{ fontSize: 11, background: '#FEF3C7', color: '#92400E', padding: '2px 6px', borderRadius: 9999, fontWeight: 700, verticalAlign: 'middle' }}>Pro</span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 100, height: 4, background: DS.muted, borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{ width: '33%', height: '100%', background: DS.primary, borderRadius: 9999 }} />
            </div>
            <span style={{ fontSize: 11, color: DS.fg4 }}>33% 完成</span>
          </div>
        </div>
        <div style={{
          width: 38, height: 38, borderRadius: '50%', background: DS.gradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 15, flexShrink: 0,
        }}>L</div>
      </div>

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Streak Ring */}
        <StreakRing streak={7} checked={checkedIn} onCheckin={() => setCheckedIn(true)} />

        {/* Stats Grid */}
        <div style={{ display: 'flex', gap: 8 }}>
          <StatMini emoji="📚" value="24" label="总对话" />
          <StatMini emoji="📅" value="12" label="学习天" />
          <StatMini emoji="✅" value="1/6" label="场景完成" />
        </div>

        {/* Today's Task — merged recall + daily Q&A */}
        <div style={{ borderRadius: DS.radiusLg, overflow: 'hidden', border: `1px solid ${DS.border}`, boxShadow: DS.shadowCard }}>
          <div style={{ background: DS.gradient, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <MascotAvatar size={32} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>今日任务</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, background: 'rgba(255,255,255,0.2)', color: '#fff', padding: '2px 8px', borderRadius: 9999 }}>0/2 完成</span>
          </div>
          <div style={{ background: DS.card }}>
            {/* Recall task */}
            <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${DS.border}` }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,127,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📝</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: DS.fg }}>今日复述</div>
                <div style={{ fontSize: 11, color: DS.fg4, marginTop: 1 }}>询问顾客偏好的颜色</div>
              </div>
              <button onClick={() => onNav && onNav('recall')} style={{
                background: DS.primary, color: '#fff', border: 'none', borderRadius: 10,
                padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              }}>开始 →</button>
            </div>
            {/* Daily QA task */}
            <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(164,122,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🔊</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: DS.fg }}>今日问答</div>
                <div style={{ fontSize: 11, color: DS.fg4, marginTop: 1 }}>听问题并用外语回答</div>
              </div>
              <button onClick={() => onNav && onNav('daily-qa')} style={{
                background: DS.secondary, color: '#fff', border: 'none', borderRadius: 10,
                padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              }}>开始 →</button>
            </div>
          </div>
        </div>

        {/* Scenario Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: DS.fg, margin: 0 }}>场景练习</h2>
              <p style={{ fontSize: 11, color: DS.fg4, margin: '2px 0 0' }}>英语 · 中级</p>
            </div>
            <span style={{ fontSize: 11, color: DS.fg4, background: '#F3F4F6', padding: '4px 10px', borderRadius: 9999 }}>{scenarios.length} 个场景</span>
          </div>

          {/* Filter Chips */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
            {filters.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                flexShrink: 0, padding: '5px 12px', borderRadius: 9999, border: 'none',
                background: filter === f.id ? DS.primary : '#F3F4F6',
                color: filter === f.id ? '#fff' : DS.fg3,
                fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'Lexend, sans-serif',
              }}>{f.label}</button>
            ))}
          </div>

          {/* 2-column grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {filtered.map((s, i) => (
              <div key={i} onClick={!s.locked ? onOpenConversation : undefined} style={{
                background: DS.card, borderRadius: DS.radiusLg, overflow: 'hidden',
                border: `1.5px solid ${DS.border}`, boxShadow: DS.shadowCard,
                cursor: s.locked ? 'default' : 'pointer', opacity: s.locked ? 0.6 : 1,
                position: 'relative',
              }}>
                {/* Image area */}
                <div style={{
                  height: 80, background: 'linear-gradient(135deg, #EEF2FF, #F5F3FF)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  <span style={{ fontSize: 30 }}>{s.emoji}</span>
                  <div style={{
                    position: 'absolute', top: 8, left: 8, width: 26, height: 26,
                    borderRadius: '50%', background: DS.primary, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10,
                  }}>▶</div>
                  <div style={{ position: 'absolute', top: 8, right: 8 }}>
                    <DiffBadge diff={s.diff} />
                  </div>
                </div>
                {/* Body */}
                <div style={{ padding: '10px 10px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: DS.fg, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
                  {s.progress > 0 && s.progress < 100 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: DS.fg4, marginBottom: 3 }}>
                        <span>进度</span><span>{s.progress}%</span>
                      </div>
                      <div style={{ height: 3, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${s.progress}%`, height: '100%', background: DS.primary, borderRadius: 3 }} />
                      </div>
                    </div>
                  )}
                  <button style={{
                    width: '100%', padding: '6px 0', borderRadius: 9, border: 'none',
                    background: s.locked ? '#D1D5DB' : DS.primary,
                    color: '#fff', fontSize: 11, fontWeight: 600, cursor: s.locked ? 'not-allowed' : 'pointer',
                    fontFamily: 'Lexend, sans-serif',
                  }}>{s.locked ? '已锁定' : s.progress === 100 ? '已完成 ✅' : '开始练习'}</button>
                </div>
                {s.locked && (
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: DS.radiusLg,
                  }}>
                    <div style={{ width: 32, height: 32, background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🔒</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CONVERSATION SCREEN — dispatcher ──
//   mode='daily_qa'  → /conversation?mode=daily_qa
//   mode='recall'    → /conversation?scenario=xxx&mode=recall
//   mode='scenario'  → /conversation?scenario=xxx (default)
function ConversationScreen({ onBack, mode = 'scenario', scenario }) {
  if (mode === 'daily_qa') return <DailyQAScreen onBack={onBack} />;
  if (mode === 'recall')   return <RecallScreen onBack={onBack} scenario={scenario} />;
  return <ScenarioConversationScreen onBack={onBack} scenario={scenario} />;
}

// ── DAILY Q&A MODE ──
function DailyQAScreen({ onBack }) {
  const [immersive, setImmersive] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [thinking, setThinking] = React.useState(false);
  const [aiSpeaking, setAiSpeaking] = React.useState(true);
  const [showRef, setShowRef] = React.useState(false);
  const [subtitle, setSubtitle] = React.useState({ text: 'こんにちは！今日の朝ごはんは何を食べましたか？', speaker: 'ai', visible: true });
  const [messages, setMessages] = React.useState([
    { isUser: false, text: 'こんにちは！今日の朝ごはんは何を食べましたか？', duration: '3.4s' },
  ]);
  const [mascotMood, setMascotMood] = React.useState('happy');

  // Subtitle auto-fade after 2s
  React.useEffect(() => {
    if (!subtitle.visible) return;
    const t = setTimeout(() => setSubtitle(s => ({ ...s, visible: false })), 2000);
    return () => clearTimeout(t);
  }, [subtitle.text, subtitle.visible]);

  // Stop AI speaking after 3.4s
  React.useEffect(() => {
    if (!aiSpeaking) return;
    const t = setTimeout(() => setAiSpeaking(false), 3400);
    return () => clearTimeout(t);
  }, [aiSpeaking]);

  const handleMic = () => {
    if (recording) {
      // user finished — show user subtitle, then thinking, then AI reply
      setRecording(false);
      const userText = 'パンとコーヒーを飲みました。';
      setSubtitle({ text: userText, speaker: 'user', visible: true });
      setMessages(prev => [...prev, { isUser: true, text: userText, duration: '2.1s' }]);
      setTimeout(() => {
        setThinking(true);
        setMascotMood('calm');
      }, 600);
      setTimeout(() => {
        setThinking(false);
        const reply = 'いいですね！パンは何味でしたか？';
        setMessages(prev => [...prev, { isUser: false, text: reply, duration: '2.8s' }]);
        setSubtitle({ text: reply, speaker: 'ai', visible: true });
        setAiSpeaking(true);
        setMascotMood('happy');
      }, 2400);
    } else {
      setRecording(true);
      setMascotMood('calm');
    }
  };

  const mascotState = aiSpeaking ? 'speaking' : thinking ? 'thinking' : recording ? 'listening' : 'idle';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: DS.bg, position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} aria-label="close" style={{
          width: 32, height: 32, borderRadius: '50%', border: `1px solid ${DS.border}`,
          background: DS.card, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: DS.fg3, fontSize: 16, padding: 0,
        }}>×</button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: DS.fg }}>今日问答</div>
        <span style={{
          background: 'rgba(16,185,129,0.12)', color: DS.success,
          fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 9999,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: DS.success, display: 'inline-block' }} />
          在线
        </span>
      </div>

      {!immersive ? (
        <>
          {/* Prompt card */}
          <div style={{ margin: '4px 14px 12px', padding: '12px 14px', background: 'rgba(99,127,241,0.07)', borderRadius: DS.radiusMd }}>
            <p style={{ fontSize: 14, color: DS.fg, margin: '0 0 8px', lineHeight: 1.4, fontWeight: 500 }}>
              今日の朝ごはんは何を食べましたか？
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button aria-label="play prompt" style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: DS.fg3, fontSize: 16,
              }}>🔊</button>
              <button onClick={() => setShowRef(s => !s)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: DS.primary, fontSize: 12, fontWeight: 600,
              }}>查看参考答案 {showRef ? '▲' : '▼'}</button>
            </div>
            {showRef && (
              <p style={{ fontSize: 12, color: DS.fg3, margin: '8px 0 0', lineHeight: 1.5, padding: '8px 10px', background: DS.card, borderRadius: 8 }}>
                例：今日の朝ごはんはパンとコーヒーでした。とても美味しかったです。
              </p>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: m.isUser ? 'row-reverse' : 'row' }}>
                {m.isUser ? (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#F6B443,#a47af6)', flexShrink: 0 }} />
                ) : (
                  <MascotAvatar mood="happy" size={36} />
                )}
                <div style={{ maxWidth: '75%' }}>
                  <div style={{
                    background: m.isUser ? 'rgba(99,127,241,0.15)' : DS.card,
                    padding: '10px 14px', borderRadius: 14,
                    fontSize: 13, color: DS.fg, lineHeight: 1.5,
                  }}>
                    {m.text}
                    {!m.isUser && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <button style={{
                          width: 28, height: 28, borderRadius: '50%', background: DS.primary,
                          border: 'none', color: '#fff', cursor: 'pointer', fontSize: 11, padding: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>▶</button>
                        <div style={{ display: 'flex', gap: 2, alignItems: 'center', flex: 1 }}>
                          {[6, 12, 8, 14, 10, 16, 9, 13, 7, 11].map((h, k) => (
                            <div key={k} style={{ width: 2.5, height: h, background: DS.primary, opacity: 0.6, borderRadius: 1 }} />
                          ))}
                        </div>
                        <span style={{ fontSize: 10, color: DS.fg4 }}>{m.duration}</span>
                      </div>
                    )}
                  </div>
                  {!m.isUser && (
                    <button style={{ marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', color: DS.fg4, fontSize: 11, padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 3 }}>
                      🌐 翻译
                    </button>
                  )}
                </div>
              </div>
            ))}
            {thinking && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <MascotAvatar mood="calm" size={36} />
                <div style={{ background: DS.card, padding: '12px 16px', borderRadius: 14, display: 'flex', gap: 4 }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: DS.primary, animation: `mascot-think-dot 1.2s ${i * 0.15}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ flex: 1 }} />
      )}

      {/* Immersive mode overlay */}
      {immersive && (
        <div style={{
          position: 'absolute', inset: '60px 0 0 0', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '0 24px',
          background: `radial-gradient(ellipse at top, rgba(99,127,241,0.15), transparent 60%), ${DS.bg}`,
        }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <Mascot mood={mascotMood} state={mascotState} size={240} />
          </div>
          {/* Subtitle */}
          <div style={{ minHeight: 80, width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingBottom: 16 }}>
            {subtitle.visible && (
              <div style={{
                padding: '10px 18px', borderRadius: 14,
                background: subtitle.speaker === 'user' ? 'rgba(99,127,241,0.18)' : 'rgba(0,0,0,0.7)',
                color: subtitle.speaker === 'user' ? DS.fg : '#fff',
                fontSize: 14, lineHeight: 1.5, maxWidth: '100%', textAlign: 'center', fontWeight: 500,
                animation: 'subtitle-in 240ms ease-out',
              }}>{subtitle.text}</div>
            )}
          </div>
          <style>{`@keyframes subtitle-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
      )}

      {/* Bottom mic + CC */}
      <div style={{ padding: '10px 16px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={handleMic} style={{
          flex: 1, height: 48, borderRadius: 24, border: 'none', cursor: 'pointer',
          background: recording ? `linear-gradient(135deg, ${DS.error}, #f87171)` : DS.gradient,
          color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: DS.shadowLg,
          transform: recording ? 'scale(0.98)' : 'scale(1)', transition: 'transform 120ms',
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>🎤</span>
          {recording ? '正在录音…' : '点击说话'}
        </button>
        <button onClick={() => setImmersive(v => !v)} aria-label="toggle immersive" style={{
          width: 48, height: 48, borderRadius: 24, border: `1.5px solid ${immersive ? DS.primary : DS.border}`,
          background: immersive ? 'rgba(99,127,241,0.12)' : DS.card,
          color: immersive ? DS.primary : DS.fg3, cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
          fontFamily: 'inherit',
        }}>CC</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SHARED CONVERSATION ATOMS
// Used by Scenario, Recall, DailyQA — the visual vocabulary of conversation.
// ─────────────────────────────────────────────

// Conversation header — close button, title, task progress dots, online pill
function ConvHeader({ onBack, title, dots, online = true }) {
  return (
    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, background: DS.card, borderBottom: `1px solid ${DS.border}` }}>
      <button onClick={onBack} aria-label="close" style={{
        width: 32, height: 32, borderRadius: '50%', border: `1px solid ${DS.border}`,
        background: DS.bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: DS.fg3, fontSize: 16, padding: 0, flexShrink: 0,
      }}>×</button>
      <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: DS.fg, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
      {dots && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {dots.map((active, i) => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: active ? DS.primary : DS.border,
            }} />
          ))}
        </div>
      )}
      {online && (
        <span style={{
          background: 'rgba(16,185,129,0.12)', color: DS.success,
          fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 9999,
          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: DS.success }} />
          在线
        </span>
      )}
    </div>
  );
}

// Voice bubble with play button + waveform + duration
function VoiceBubble({ duration = '3.4s', dark = false, bars = 24, accent }) {
  const c = accent || DS.primary;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <button style={{
        width: 30, height: 30, borderRadius: '50%', background: c,
        border: 'none', color: '#fff', cursor: 'pointer', fontSize: 11, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>▶</button>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', flex: 1, height: 22 }}>
        {Array.from({ length: bars }, (_, i) => {
          const h = 4 + Math.abs(Math.sin(i * 1.7)) * 14 + (i % 3) * 2;
          return <div key={i} style={{ width: 2.5, height: h, background: c, opacity: dark ? 0.85 : 0.6, borderRadius: 1 }} />;
        })}
      </div>
      <span style={{ fontSize: 10, color: dark ? 'rgba(255,255,255,0.7)' : DS.fg4, flexShrink: 0, fontWeight: 500 }}>{duration}</span>
    </div>
  );
}

// AI message — mascot avatar + bubble + voice + translate
function AIMessage({ text, duration }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <MascotAvatar mood="calm" size={36} accessory="tie" />
      <div style={{ maxWidth: '78%' }}>
        <div style={{
          background: DS.card, padding: '10px 14px', borderRadius: '4px 16px 16px 16px',
          fontSize: 13, color: DS.fg, lineHeight: 1.55,
          boxShadow: DS.shadowCard,
        }}>
          {text}
          {duration && <div style={{ marginTop: 8 }}><VoiceBubble duration={duration} /></div>}
        </div>
        <button style={{
          marginTop: 4, background: 'none', border: 'none', cursor: 'pointer',
          color: DS.fg4, fontSize: 11, padding: '2px 4px',
          display: 'flex', alignItems: 'center', gap: 3,
        }}>🌐 翻译</button>
      </div>
    </div>
  );
}

// User message — voice bubble in a gradient pill, right-aligned
function UserVoiceMessage({ duration }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        background: DS.gradient, padding: '8px 14px', borderRadius: '16px 4px 16px 16px',
        maxWidth: '72%', minWidth: 140,
      }}>
        <VoiceBubble duration={duration} dark accent="#fff" bars={14} />
      </div>
    </div>
  );
}

// Mic button — primary CTA, with optional restart button next to it (sketch shows restart on right)
function MicBar({ recording, onMic, onRestart, label, secondary }) {
  return (
    <div style={{ padding: '10px 16px 16px', display: 'flex', alignItems: 'center', gap: 10, background: DS.card, borderTop: `1px solid ${DS.border}` }}>
      <button onClick={onMic} style={{
        flex: 1, height: 48, borderRadius: 24, border: 'none', cursor: 'pointer',
        background: recording ? `linear-gradient(135deg, ${DS.error}, #f87171)` : DS.gradient,
        color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: DS.shadowLg,
        transform: recording ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 120ms',
        animation: recording ? 'mic-pulse 1.2s ease-in-out infinite' : 'none',
      }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>🎤</span>
        {recording ? '正在录音…' : label || '点击说话'}
      </button>
      {secondary}
      {onRestart && (
        <button onClick={onRestart} aria-label="restart" style={{
          width: 48, height: 48, borderRadius: 24, border: `1.5px solid ${DS.warning}`,
          background: 'rgba(245,158,11,0.08)', color: DS.warning,
          cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontFamily: 'inherit',
        }}>↻</button>
      )}
      <style>{`@keyframes mic-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(99,127,241,0.6), 0 16px 32px rgba(99,127,241,0.45); }
        50% { box-shadow: 0 0 0 12px rgba(99,127,241,0), 0 16px 32px rgba(99,127,241,0.45); }
      }`}</style>
    </div>
  );
}

// Hint banner (sketch: "💡 遇到长句…")
function HintBanner({ text, onSkip }) {
  return (
    <div style={{
      margin: '0 14px 10px', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        flex: 1, padding: '9px 12px', borderRadius: DS.radiusMd,
        background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)',
        fontSize: 12, color: DS.fg2, lineHeight: 1.45,
      }}>💡 {text}</div>
      {onSkip && (
        <button onClick={onSkip} style={{
          padding: '8px 14px', borderRadius: DS.radiusMd,
          border: `1px solid ${DS.border}`, background: DS.card, color: DS.fg2,
          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          flexShrink: 0,
        }}>跳过 →</button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SCENARIO CONVERSATION
// Path: /conversation?scenario=询问尺寸与颜色
// CC mode is the immersive overlay with mascot + subtitles.
// ─────────────────────────────────────────────
function ScenarioConversationScreen({ onBack, scenario = '询问尺寸与颜色' }) {
  const [recording, setRecording] = React.useState(false);
  const [taskOpen, setTaskOpen] = React.useState(true);
  const [ccMode, setCcMode] = React.useState(false);
  const [aiSpeaking, setAiSpeaking] = React.useState(false);
  const [mascotMood, setMascotMood] = React.useState('calm');
  const [subtitle, setSubtitle] = React.useState({ text: '', speaker: 'ai', visible: false });
  const msgRef = React.useRef(null);
  const [messages, setMessages] = React.useState([
    { type: 'ai', text: 'いらっしゃいませ！何かお探しですか？このシャツはいかがでしょう。', duration: '4.2s' },
    { type: 'user', duration: '3.1s' },
    { type: 'ai', text: 'はい！では、ご希望のサイズを聞いてみてください。例えば、「Lサイズはありますか？」と聞いてみましょう。', duration: '6.4s' },
  ]);

  const tasks = [
    { id: 0, text: '询问顾客想要的尺寸', example: '何サイズがいいですか？', done: true },
    { id: 1, text: '询问顾客偏好的颜色', example: 'どの色が好きですか？', done: false, current: true },
    { id: 2, text: '确认顾客的选择', example: 'その色とサイズでよろしいですか？', done: false },
  ];
  const completedCount = tasks.filter(t => t.done).length;
  const progressPct = Math.round(completedCount / tasks.length * 100);

  // Auto-scroll messages to bottom
  React.useEffect(() => {
    if (msgRef.current) {
      msgRef.current.scrollTop = msgRef.current.scrollHeight;
    }
  }, [messages, recording]);

  // Subtitle auto-fade
  React.useEffect(() => {
    if (!subtitle.visible) return;
    const t = setTimeout(() => setSubtitle(s => ({ ...s, visible: false })), 2000);
    return () => clearTimeout(t);
  }, [subtitle.text, subtitle.visible]);

  const handleMic = () => {
    if (!recording) { setRecording(true); setMascotMood('calm'); return; }
    setRecording(false);
    const aiReply = '良い質問ですね！では、その色を選んでみますか？';
    setMessages(prev => [
      ...prev,
      { type: 'user', duration: '2.8s' },
      { type: 'ai', text: aiReply, duration: '4.1s' },
    ]);
    setSubtitle({ text: aiReply, speaker: 'ai', visible: true });
    setAiSpeaking(true);
    setMascotMood('happy');
    setTimeout(() => setAiSpeaking(false), 4100);
  };

  const mascotState = aiSpeaking ? 'speaking' : recording ? 'listening' : 'idle';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: DS.bg, position: 'relative' }}>
      {/* Header */}
      <ConvHeader
        onBack={onBack}
        title={scenario}
        dots={null}
        online={true}
      />

      {/* Task tray — collapsible, gradient header + progress bar */}
      <div style={{ background: DS.gradient, color: '#fff', flexShrink: 0 }}>
        <button onClick={() => setTaskOpen(o => !o)} style={{
          width: '100%', padding: '9px 16px', display: 'flex', alignItems: 'center',
          background: 'transparent', border: 'none', cursor: 'pointer', color: '#fff',
          fontFamily: 'inherit',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, flex: 1, textAlign: 'left' }}>
            任务进度 {completedCount}/{tasks.length}
          </span>
          {/* Progress pill */}
          <span style={{
            fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.2)',
            padding: '2px 8px', borderRadius: 9999, marginRight: 8,
          }}>{progressPct}%</span>
          <span style={{ fontSize: 14, transition: 'transform 240ms', transform: taskOpen ? 'rotate(180deg)' : 'rotate(0)' }}>⌃</span>
        </button>
        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.2)', marginBottom: taskOpen ? 0 : 0 }}>
          <div style={{ width: `${progressPct}%`, height: '100%', background: '#fff', transition: 'width 0.5s ease', borderRadius: '0 2px 2px 0' }} />
        </div>
        {taskOpen && (
          <div style={{ padding: '8px 14px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {tasks.map(t => (
              <div key={t.id} style={{
                background: t.current ? 'rgba(255,255,255,0.18)' : 'transparent',
                borderRadius: 9, padding: '7px 10px',
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  background: t.done ? '#fff' : 'transparent',
                  border: '1.5px solid rgba(255,255,255,0.7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: DS.primary, fontSize: 9, fontWeight: 800,
                }}>{t.done ? '✓' : ''}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: t.current ? 700 : 500, lineHeight: 1.4 }}>
                    {t.current && '→ '}{t.text}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
                    例：{t.example}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Messages area */}
      <div ref={msgRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((m, i) =>
          m.type === 'ai'
            ? <AIMessage key={i} text={m.text} duration={m.duration} />
            : <UserVoiceMessage key={i} duration={m.duration} />
        )}
        {recording && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{
              padding: '10px 14px', borderRadius: 14,
              background: 'rgba(226,65,46,0.1)', border: '1px solid rgba(226,65,46,0.2)',
              fontSize: 12, color: DS.error, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: DS.error, animation: 'mic-pulse 1.2s ease-in-out infinite' }} />
              聆听中…
            </div>
          </div>
        )}
      </div>

      {/* CC immersive overlay */}
      {ccMode && (
        <div style={{
          position: 'absolute', inset: '56px 0 80px 0',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: `radial-gradient(ellipse at top, rgba(99,127,241,0.18), transparent 60%), ${DS.bg}`,
          zIndex: 10,
        }}>
          {/* Exit CC button */}
          <button onClick={() => setCcMode(false)} style={{
            position: 'absolute', top: 10, right: 14,
            background: DS.card, border: `1px solid ${DS.border}`,
            borderRadius: 20, padding: '5px 12px', fontSize: 11, fontWeight: 600,
            color: DS.fg3, cursor: 'pointer', fontFamily: 'inherit',
          }}>退出 CC ×</button>
          <Mascot mood={mascotMood} state={mascotState} size={200} />
          {/* Subtitle */}
          <div style={{ minHeight: 60, width: '100%', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {subtitle.visible && (
              <div style={{
                padding: '10px 18px', borderRadius: 14,
                background: subtitle.speaker === 'user' ? 'rgba(99,127,241,0.18)' : 'rgba(0,0,0,0.72)',
                color: subtitle.speaker === 'user' ? DS.fg : '#fff',
                fontSize: 14, lineHeight: 1.5, textAlign: 'center', fontWeight: 500,
                animation: 'subtitle-in 240ms ease-out',
              }}>{subtitle.text}</div>
            )}
          </div>
          <style>{`
            @keyframes subtitle-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
          `}</style>
        </div>
      )}

      {/* Mic bar + CC button */}
      <MicBar
        recording={recording}
        onMic={handleMic}
        onRestart={() => setMessages(messages.slice(0, 1))}
        secondary={
          <button onClick={() => setCcMode(v => !v)} aria-label="CC mode" style={{
            width: 48, height: 48, borderRadius: 24,
            border: `1.5px solid ${ccMode ? DS.primary : DS.border}`,
            background: ccMode ? 'rgba(99,127,241,0.12)' : DS.card,
            color: ccMode ? DS.primary : DS.fg3,
            cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          }}>CC</button>
        }
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// RECALL — 今日复述
// Default: CC (immersive) mode ON — script card sticky at top,
// messages auto-scroll, no CC entry button (it's the default UX).
// Exit button in overlay returns to chat view.
// ─────────────────────────────────────────────
function RecallScreen({ onBack, scenario = '询问尺寸与颜色' }) {
  const [recording, setRecording] = React.useState(false);
  const [ccMode, setCcMode] = React.useState(true); // default CC ON
  const [aiSpeaking, setAiSpeaking] = React.useState(false);
  const [mascotMood, setMascotMood] = React.useState('happy');
  const [subtitle, setSubtitle] = React.useState({ text: 'お客様がどのようなサイズを好まれるか、お伺いしてもよろしいでしょうか。', speaker: 'ai', visible: true });
  const msgRef = React.useRef(null);
  const [messages, setMessages] = React.useState([
    { type: 'ai', text: 'こんにちは！では、まずは1つ目の課題「お客様に希望のサイズを尋ねる」から始めましょう。', duration: '8.2s' },
  ]);

  const scriptLine = 'お客様がどのようなサイズを好まれるか、お伺いしてもよろしいでしょうか。';

  // Auto-scroll messages to bottom
  React.useEffect(() => {
    if (msgRef.current && !ccMode) {
      msgRef.current.scrollTop = msgRef.current.scrollHeight;
    }
  }, [messages, recording, ccMode]);

  // Subtitle auto-fade
  React.useEffect(() => {
    if (!subtitle.visible) return;
    const t = setTimeout(() => setSubtitle(s => ({ ...s, visible: false })), 2400);
    return () => clearTimeout(t);
  }, [subtitle.text, subtitle.visible]);

  const handleMic = () => {
    if (!recording) { setRecording(true); setMascotMood('calm'); return; }
    setRecording(false);
    const aiReply = 'いいですね！もう一度、「お伺いしてもよろしいでしょうか」の部分をゆっくり繰り返してみましょう。';
    setMessages(prev => [
      ...prev,
      { type: 'user', duration: '5.2s' },
      { type: 'ai', text: aiReply, duration: '5.6s' },
    ]);
    setSubtitle({ text: aiReply, speaker: 'ai', visible: true });
    setAiSpeaking(true);
    setMascotMood('happy');
    setTimeout(() => setAiSpeaking(false), 5600);
  };

  const mascotState = aiSpeaking ? 'speaking' : recording ? 'listening' : 'idle';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: DS.bg, position: 'relative' }}>
      {/* Header */}
      <ConvHeader onBack={onBack} title={scenario} dots={null} online={true} />

      {/* Script card — sticky, never scrolls away */}
      <div style={{ padding: '10px 14px 8px', flexShrink: 0 }}>
        <div style={{
          background: DS.card, border: `1.5px solid ${DS.primaryLight}`,
          borderLeft: `4px solid ${DS.primary}`,
          borderRadius: DS.radiusMd, padding: '12px 14px',
          boxShadow: DS.shadowCard,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>📝</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: DS.fg4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>台词卡</div>
              <p style={{ fontSize: 13.5, color: DS.fg, lineHeight: 1.5, margin: 0, fontWeight: 500 }}>{scriptLine}</p>
            </div>
            <button aria-label="play" style={{
              background: DS.primary, border: 'none', borderRadius: '50%',
              width: 28, height: 28, color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, flexShrink: 0,
            }}>▶</button>
          </div>
        </div>
      </div>

      {/* CC immersive overlay — always ON for Recall */}
      {true && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: `radial-gradient(ellipse at top, rgba(99,127,241,0.15), transparent 60%), ${DS.bg}`,
          position: 'relative', overflow: 'hidden',
        }}>
          <Mascot mood={mascotMood} state={mascotState} size={190} />
          {/* Subtitle */}
          <div style={{ minHeight: 64, width: '100%', padding: '0 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', marginTop: 8 }}>
            {subtitle.visible && (
              <div style={{
                padding: '10px 18px', borderRadius: 14,
                background: subtitle.speaker === 'user' ? 'rgba(99,127,241,0.18)' : 'rgba(0,0,0,0.72)',
                color: subtitle.speaker === 'user' ? DS.fg : '#fff',
                fontSize: 13.5, lineHeight: 1.55, textAlign: 'center', fontWeight: 500,
                animation: 'subtitle-in 240ms ease-out',
              }}>{subtitle.text}</div>
            )}
          </div>
          <style>{`@keyframes subtitle-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
      )}

      {/* Mic bar */}
      <MicBar
        recording={recording}
        onMic={handleMic}
        label="点击跟读"
        onRestart={() => setMessages(messages.slice(0, 1))}
      />
    </div>
  );
}
// ── GOAL SETTING SCREEN ──
function GoalSettingScreen({ onBack, onDone }) {
  const [step, setStep] = React.useState(0);
  const [lang, setLang] = React.useState('');
  const [level, setLevel] = React.useState('');

  const langs = [
    { value: 'English', flag: '🇺🇸', label: '英语' },
    { value: 'Japanese', flag: '🇯🇵', label: '日语' },
    { value: 'French', flag: '🇫🇷', label: '法语' },
    { value: 'Spanish', flag: '🇪🇸', label: '西班牙语' },
    { value: 'Korean', flag: '🇰🇷', label: '韩语' },
    { value: 'German', flag: '🇩🇪', label: '德语' },
    { value: 'Portuguese', flag: '🇧🇷', label: '葡萄牙语' },
    { value: 'Italian', flag: '🇮🇹', label: '意大利语' },
    { value: 'Russian', flag: '🇷🇺', label: '俄语' },
    { value: 'Arabic', flag: '🇸🇦', label: '阿拉伯语' },
    { value: 'Thai', flag: '🇹🇭', label: '泰语' },
    { value: 'Vietnamese', flag: '🇻🇳', label: '越南语' },
  ];
  const levels = [
    { value: 'Beginner', emoji: '🌱', label: '初级', desc: '掌握基础，建立开口信心' },
    { value: 'Intermediate', emoji: '🗣️', label: '中级', desc: '流利对话，提升地道表达' },
    { value: 'Advanced', emoji: '🌟', label: '高级', desc: '精益求精，突破语言天花板' },
  ];

  const steps = ['选择语言', '测试水平', '确认目标'];
  const progress = (step + 1) / (steps.length + 1);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: DS.bg }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', background: DS.card, borderBottom: `1px solid ${DS.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: DS.primary, padding: '4px 8px 4px 0', fontSize: 22, fontWeight: 600, lineHeight: 1, flexShrink: 0 }}>←</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: DS.fg }}>设置学习目标</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 9999, background: i <= step ? DS.primary : DS.muted, transition: 'background 0.3s' }} />
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        {step === 0 && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: DS.fg, margin: '0 0 6px' }}>🌍 想学哪门语言？</h2>
            <p style={{ fontSize: 13, color: DS.fg3, margin: '0 0 20px' }}>选择你想练习的目标语言</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {langs.map(l => (
                <button key={l.value} onClick={() => setLang(l.value)} style={{
                  background: lang === l.value ? 'rgba(99,127,241,0.1)' : DS.card,
                  border: `2px solid ${lang === l.value ? DS.primary : DS.border}`,
                  borderRadius: DS.radiusMd, padding: '10px 6px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  cursor: 'pointer', fontFamily: 'Lexend, sans-serif',
                }}>
                  <span style={{ fontSize: 22 }}>{l.flag}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: DS.fg, textAlign: 'center', lineHeight: 1.2 }}>{l.label}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 24 }}>
              <PrimaryBtn onClick={() => lang && setStep(1)} style={{ opacity: lang ? 1 : 0.5 }}>下一步 →</PrimaryBtn>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: DS.fg, margin: '0 0 6px' }}>☕ 遇到外国人随意闲聊，你会？</h2>
            <p style={{ fontSize: 13, color: DS.fg3, margin: '0 0 20px' }}>帮我们了解你目前的水平</p>
            {[
              { label: '沉默或摆手，完全不知道说啥', emoji: '😶' },
              { label: '能应付简单问候，再深入就卡壳', emoji: '😬' },
              { label: '可以聊天气、爱好等轻松话题', emoji: '🙂' },
              { label: '几乎可以自如聊任何话题', emoji: '😎' },
            ].map((opt, i) => (
              <button key={i} onClick={() => setStep(2)} style={{
                width: '100%', textAlign: 'left', background: DS.card, border: `1.5px solid ${DS.border}`,
                borderRadius: DS.radiusMd, padding: '14px 16px', marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                fontFamily: 'Lexend, sans-serif',
              }}>
                <span style={{ fontSize: 22 }}>{opt.emoji}</span>
                <span style={{ fontSize: 13, color: DS.fg2 }}>{opt.label}</span>
              </button>
            ))}
          </>
        )}

        {step === 2 && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: DS.fg, margin: '0 0 6px' }}>🎯 设定你的目标等级</h2>
            <p style={{ fontSize: 13, color: DS.fg3, margin: '0 0 20px' }}>选择你想达到的口语水平</p>
            {levels.map(l => (
              <button key={l.value} onClick={() => setLevel(l.value)} style={{
                width: '100%', textAlign: 'left',
                background: level === l.value ? 'rgba(99,127,241,0.08)' : DS.card,
                border: `2px solid ${level === l.value ? DS.primary : DS.border}`,
                borderRadius: DS.radiusMd, padding: '16px', marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
                fontFamily: 'Lexend, sans-serif',
              }}>
                <span style={{ fontSize: 28 }}>{l.emoji}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: DS.fg, marginBottom: 2 }}>{l.label}</div>
                  <div style={{ fontSize: 12, color: DS.fg3 }}>{l.desc}</div>
                </div>
              </button>
            ))}
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <PrimaryBtn onClick={level ? onDone : undefined} style={{ opacity: level ? 1 : 0.5 }}>🚀 开始我的学习计划</PrimaryBtn>
              <GhostBtn onClick={() => setStep(1)}>← 返回</GhostBtn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── PROFILE SCREEN ──
function ProfileScreen({ onNav }) {
  const days = Array.from({ length: 30 }, (_, i) => ({ day: i + 1, checked: [1, 2, 3, 5, 6, 7, 8, 12, 13, 14, 19, 20, 21].includes(i + 1) }));

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: DS.bg, paddingBottom: 80 }}>
      {/* User Hero */}
      <div style={{ background: DS.card, padding: '20px 16px 16px', borderBottom: `1px solid ${DS.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%', background: DS.gradient,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 24, fontWeight: 700, flexShrink: 0,
          }}>L</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: DS.fg }}>
              学习者 <span style={{ fontSize: 11, background: '#FEF3C7', color: '#92400E', padding: '2px 6px', borderRadius: 9999, fontWeight: 700, verticalAlign: 'middle' }}>Pro</span>
            </div>
            <div style={{ fontSize: 12, color: DS.fg3, marginTop: 2 }}>learner@example.com</div>
          </div>
          <button style={{ marginLeft: 'auto', background: 'none', border: `1px solid ${DS.border}`, borderRadius: 10, padding: '6px 10px', cursor: 'pointer', color: DS.fg3 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[['24', '次对话'], ['7', '天连续'], ['33%', '进度']].map(([v, l]) => (
            <div key={l} style={{ flex: 1, textAlign: 'center', background: DS.bg, borderRadius: DS.radiusMd, padding: '10px 6px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: DS.primary }}>{v}</div>
              <div style={{ fontSize: 11, color: DS.fg4 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px' }}>
        {/* Streak Calendar */}
        <Card style={{ padding: '14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>🔥</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: DS.fg }}>连续学习 7 天</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: DS.fg4 }}>本月</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
            {days.map(d => (
              <div key={d.day} style={{
                width: '100%', aspectRatio: '1', borderRadius: 5,
                background: d.checked ? DS.primary : DS.muted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }} />
            ))}
          </div>
        </Card>

        {/* Settings Rows */}
        {[
          { icon: 'language', label: '母语设置', value: '中文（普通话）' },
          { icon: 'notifications', label: '学习提醒', value: '每天 20:00' },
          { icon: 'workspace_premium', label: '我的订阅', value: 'Pro · 2026-12-31', highlight: true },
          { icon: 'feedback', label: '意见反馈', value: '' },
          { icon: 'logout', label: '退出登录', value: '', danger: true },
        ].map((row, i) => (
          <div key={i} style={{
            background: DS.card, borderRadius: DS.radiusMd, padding: '14px 16px',
            marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            border: `1px solid ${DS.border}`,
          }}>
            <span className="material-symbols-outlined" style={{
              fontSize: 20, color: row.danger ? DS.error : row.highlight ? DS.warning : DS.fg3,
            }}>{row.icon}</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: row.danger ? DS.error : DS.fg }}>{row.label}</span>
            {row.value && <span style={{ fontSize: 12, color: row.highlight ? DS.warning : DS.fg4 }}>{row.value}</span>}
            {!row.danger && <span className="material-symbols-outlined" style={{ fontSize: 18, color: DS.fg4 }}>chevron_right</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { DiscoveryScreen, ConversationScreen, DailyQAScreen, ScenarioConversationScreen, RecallScreen, GoalSettingScreen, ProfileScreen });
