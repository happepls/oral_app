import { useState } from 'react';
import { DiffBadge } from './DiffBadge';

export function ScenarioCard({
  title,
  emoji = '📚',
  imageUrl = '',
  difficulty = 'intermediate',
  progress = 0,
  state = 'default',
  onStart,
}) {
  const isLocked = state === 'locked';
  const isCompleted = progress === 100;
  // State-driven image fallback: on load error, mount the emoji instead of just
  // hiding the <img> (DOM mutation left the header blank — emoji never showed).
  const [imageError, setImageError] = useState(false);
  const showImage = imageUrl && !imageError;

  return (
    <div
      onClick={!isLocked ? onStart : undefined}
      style={{
        background: 'var(--card)', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        border: '1.5px solid var(--border-solid)', boxShadow: 'var(--shadow-card)',
        cursor: isLocked ? 'default' : 'pointer', opacity: isLocked ? 0.6 : 1,
        position: 'relative',
      }}
    >
      <div style={{
        height: 80, background: 'var(--gradient-scenario)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        {showImage ? (
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setImageError(true)}
          />
        ) : (
          <span style={{ fontSize: 30 }}>{emoji}</span>
        )}
        <div style={{
          position: 'absolute', top: 8, left: 8, width: 26, height: 26,
          borderRadius: '50%', background: 'var(--primary)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10,
        }}>▶</div>
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <DiffBadge diff={difficulty} />
        </div>
      </div>

      <div style={{ padding: '10px 10px 12px' }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{title}</div>

        {progress > 0 && progress < 100 && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--foreground-subtle)', marginBottom: 3 }}>
              <span>进度</span><span>{progress}%</span>
            </div>
            <div style={{ height: 3, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', borderRadius: 3 }} />
            </div>
          </div>
        )}

        <button
          disabled={isLocked}
          style={{
            width: '100%', padding: '6px 0', borderRadius: 9, border: 'none',
            background: isLocked ? '#D1D5DB' : isCompleted ? 'var(--success)' : 'var(--primary)',
            color: '#fff', fontSize: 11, fontWeight: 600,
            cursor: isLocked ? 'not-allowed' : 'pointer',
            fontFamily: 'Lexend, sans-serif',
          }}
        >
          {isLocked ? '已锁定' : isCompleted ? '已完成 ✅' : '开始练习'}
        </button>
      </div>

      {isLocked && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{
            width: 32, height: 32, background: '#fff', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>🔒</div>
        </div>
      )}
    </div>
  );
}
