// ─────────────────────────────────────────────
// Guaji AI — Additional Screens (Landing, Paywall)
// ─────────────────────────────────────────────

function LandingScreen({ onGetStarted, onSignIn }) {
  return (
    <div style={{
      height: '100%', overflowY: 'auto', background: DS.bg,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top nav */}
      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MascotAvatar size={28} mood="calm" />
          <span style={{ fontSize: 16, fontWeight: 700, color: DS.fg }}>GuaJi AI</span>
        </div>
        <button onClick={onSignIn} style={{
          background: 'none', border: 'none', color: DS.primary, fontSize: 13,
          fontWeight: 600, cursor: 'pointer', fontFamily: 'Lexend, sans-serif',
        }}>登录</button>
      </div>

      {/* Hero */}
      <div style={{ padding: '20px 20px 28px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
          background: 'rgba(99,127,241,0.1)', borderRadius: 9999,
          fontSize: 11, fontWeight: 600, color: DS.primary, marginBottom: 16,
        }}>
          <span>✨</span><span>A new way to learn languages</span>
        </div>
        <h1 style={{
          fontSize: 30, fontWeight: 700, color: DS.fg, margin: '0 0 10px',
          lineHeight: 1.15, letterSpacing: '-0.02em',
        }}>说得出口，<br/>比说得完美更重要</h1>
        <p style={{ fontSize: 13.5, color: DS.fg3, lineHeight: 1.55, margin: '0 0 20px', padding: '0 8px' }}>
          24/7 AI 口语陪练，从任何水平开始，<br/>每天 10 分钟，开口说自然。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px' }}>
          <PrimaryBtn onClick={onGetStarted}>免费开始练习 →</PrimaryBtn>
          <button onClick={onSignIn} style={{
            background: 'transparent', color: DS.fg3, border: 'none',
            fontSize: 12, fontFamily: 'Lexend, sans-serif', cursor: 'pointer',
          }}>已有账号？登录</button>
        </div>
      </div>

      {/* Philosophy quote card */}
      <div style={{ padding: '0 16px 20px' }}>
        <div style={{
          background: DS.card, borderRadius: DS.radiusXl, padding: '24px 22px 20px',
          boxShadow: DS.shadowBrand || DS.shadow,
          border: `1px solid ${DS.border}`,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Decorative quote mark */}
          <div style={{
            position: 'absolute', top: -8, left: 14,
            fontSize: 96, fontWeight: 900, lineHeight: 1,
            color: DS.primary, opacity: 0.07, fontFamily: 'Georgia, serif',
            userSelect: 'none', pointerEvents: 'none',
          }}>“</div>
          {/* Language icons row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {['🇺🇸','🇯🇵','🇫🇷','🇪🇸','🇰🇷','🇩🇪'].map((f,i) => (
              <span key={i} style={{ fontSize: 18, lineHeight: 1 }}>{f}</span>
            ))}
          </div>
          <p style={{
            fontSize: 15, fontWeight: 600, color: DS.fg, lineHeight: 1.6,
            margin: '0 0 12px', fontStyle: 'italic',
          }}>“一种语言，一个世界。开口的勇气，比语法的完美更重要。”</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: DS.gradient, flexShrink: 0, overflow: 'hidden',
            }}>
              <img src="../../assets/logo-app-icon.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.05)' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: DS.fg2 }}>GuaJi AI</div>
              <div style={{ fontSize: 10, color: DS.fg4 }}>AI口语练习伙伴</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: DS.primary, opacity: 0.4,
                  animation: 'pulse 1.4s infinite', animationDelay: `${i*220}ms`,
                }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { emoji: '🎙️', title: '真实场景对话', desc: '商务、旅行、医疗 50+ 真实场景' },
          { emoji: '⚡', title: '实时语音反馈', desc: '流利度、语法、发音多维度评分' },
          { emoji: '🔥', title: '每日打卡养习惯', desc: '连续学习徽章、目标计划追踪' },
        ].map(f => (
          <div key={f.title} style={{
            background: DS.card, borderRadius: DS.radiusMd, padding: 14,
            display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${DS.border}`,
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(99,127,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{f.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: DS.fg }}>{f.title}</div>
              <div style={{ fontSize: 11, color: DS.fg3, marginTop: 2 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Social proof */}
      <div style={{ padding: '0 16px 32px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 14 }}>⭐⭐⭐⭐⭐</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: DS.fg }}>4.9</span>
        </div>
        <div style={{ fontSize: 11, color: DS.fg4 }}>10,000+ 学习者每天在使用</div>
      </div>
    </div>
  );
}

function PaywallScreen({ onBack, onSubscribe }) {
  const [tier, setTier] = React.useState('annual');
  const tiers = [
    { id: 'free', label: '免费', price: '¥0', period: '永久', best: false, features: ['每天 1 次对话', '基础场景', '无评分'] },
    { id: 'weekly', label: '周卡', price: '¥19', period: '/ 周', best: false, features: ['无限对话', '所有场景解锁', 'AI 评分反馈'] },
    { id: 'annual', label: '年卡', price: '¥299', period: '/ 年', best: true, badge: '省 60%', features: ['周卡所有功能', '专属学习计划', '无限使用次数', '导出学习报告'] },
  ];

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: DS.bg, paddingBottom: 24 }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: DS.card, borderBottom: `1px solid ${DS.border}` }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: DS.primary, fontSize: 22, cursor: 'pointer', fontWeight: 600, padding: '4px 8px 4px 0', lineHeight: 1 }}>←</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: DS.fg }}>升级 Pro</span>
      </div>

      {/* Hero */}
      <div style={{
        background: DS.gradient, padding: '26px 20px', color: '#fff',
        textAlign: 'center', borderBottomLeftRadius: DS.radiusXl, borderBottomRightRadius: DS.radiusXl,
      }}>
        <div style={{ fontSize: 36, marginBottom: 6 }}>👑</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>解锁全部 Guaji AI</h2>
        <p style={{ fontSize: 12, opacity: 0.9, margin: 0 }}>无限对话 · 全部场景 · AI 评分</p>
      </div>

      {/* Plans */}
      <div style={{ padding: '20px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tiers.map(t => (
          <button key={t.id} onClick={() => setTier(t.id)} style={{
            background: DS.card, borderRadius: DS.radiusLg, padding: 16,
            border: `2px solid ${tier === t.id ? DS.primary : DS.border}`,
            display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            position: 'relative', textAlign: 'left',
            boxShadow: tier === t.id ? DS.shadow : 'none',
            fontFamily: 'Lexend, sans-serif',
          }}>
            {t.best && (
              <div style={{
                position: 'absolute', top: -10, right: 14,
                background: DS.gradientWarm, color: '#fff', fontSize: 10, fontWeight: 700,
                padding: '3px 10px', borderRadius: 9999,
              }}>🔥 最划算</div>
            )}
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              border: `2px solid ${tier === t.id ? DS.primary : DS.border}`,
              background: tier === t.id ? DS.primary : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>{tier === t.id && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: DS.fg }}>{t.label}</span>
                {t.badge && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '1px 6px', borderRadius: 9999 }}>{t.badge}</span>}
              </div>
              <div style={{ fontSize: 11, color: DS.fg3 }}>{t.features.join(' · ')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: DS.fg }}>{t.price}</div>
              <div style={{ fontSize: 10, color: DS.fg4 }}>{t.period}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Plan comparison table */}
      <div style={{ padding: '8px 14px 18px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 6px', color: DS.fg4, fontWeight: 600, width: '40%' }}>功能</th>
              {[{ id: 'free', label: '免费' }, { id: 'weekly', label: '周卡' }, { id: 'annual', label: '年卡' }].map(p => (
                <th key={p.id} style={{
                  padding: '8px 6px', textAlign: 'center', fontWeight: 700,
                  color: p.id === 'annual' ? DS.primary : DS.fg,
                  borderBottom: p.id === tier ? `2px solid ${DS.primary}` : `2px solid ${DS.border}`,
                }}>{p.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'AI 对话次数', free: '1次/天', weekly: '无限', annual: '无限' },
              { label: '场景解锁', free: '3个', weekly: '全部', annual: '全部' },
              { label: '多维度评分', free: '—', weekly: '✓', annual: '✓' },
              { label: '专属学习计划', free: '—', weekly: '—', annual: '✓' },
              { label: '学习报告导出', free: '—', weekly: '—', annual: '✓' },
              { label: '专属学习计划', free: '—', weekly: '—', annual: '✓' },
            ].map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? DS.bg : 'transparent' }}>
                <td style={{ padding: '9px 6px', color: DS.fg2, fontWeight: 500 }}>{row.label}</td>
                {['free', 'weekly', 'annual'].map(p => (
                  <td key={p} style={{
                    padding: '9px 6px', textAlign: 'center',
                    color: row[p] === '✓' ? DS.success : row[p] === '—' ? DS.fg4 : DS.fg,
                    fontWeight: row[p] === '✓' ? 700 : 400,
                  }}>{row[p]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CTA */}
      <div style={{ padding: '0 14px' }}>
        <PrimaryBtn onClick={onSubscribe}>
          {tier === 'free' ? '继续使用免费版' : `立即订阅 · ${tiers.find(t => t.id === tier).price}${tiers.find(t => t.id === tier).period}`}
        </PrimaryBtn>
        <p style={{ fontSize: 10, color: DS.fg4, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>订阅可随时取消 · 7 天无理由退款</p>
      </div>
    </div>
  );
}

Object.assign(window, { LandingScreen, PaywallScreen });
