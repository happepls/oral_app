import { useId, useState } from 'react';
import { DiffBadge } from './DiffBadge';
import { useTranslation } from 'react-i18next';

export function ScenarioCard({
  title,
  description = '',
  emoji = '📚',
  imageUrl = '',
  difficulty = 'intermediate',
  progress = 0,
  state = 'default',
  unlockReason = '',
  onUnlock,
  onStart,
}) {
  const { t } = useTranslation();
  const unlockReasonId = `${useId()}-unlock-reason`;
  const isLocked = state === 'locked';
  const isCompleted = progress === 100;
  // State-driven image fallback: on load error, mount the emoji instead of just
  // hiding the <img> (DOM mutation left the header blank — emoji never showed).
  const [imageError, setImageError] = useState(false);
  const showImage = imageUrl && !imageError;

  return (
    <article
      onClick={!isLocked ? onStart : undefined}
      data-state={state}
      style={{
        background: 'var(--card)', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        border: '1.5px solid var(--border-solid)', boxShadow: 'var(--shadow-card)',
        cursor: isLocked ? 'default' : 'pointer', opacity: isLocked ? 0.6 : 1,
        position: 'relative',
      }}
    >
      <div style={{
        height: 100, background: 'var(--gradient-scenario)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        {showImage ? (
          <img
            src={imageUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setImageError(true)}
          />
        ) : (
          <span aria-hidden="true" style={{ fontSize: 36 }}>{emoji}</span>
        )}
        <div style={{
          position: 'absolute', top: 10, left: 10, width: 32, height: 32,
          borderRadius: '50%', background: 'var(--primary)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12,
        }} aria-hidden="true">▶</div>
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <DiffBadge diff={difficulty} />
        </div>
      </div>

      <div style={{ padding: 12 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4,
          lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{title}</div>

        {description && (
          <p style={{
            minHeight: '36px', fontSize: 12, lineHeight: 1.5,
            color: 'var(--foreground-muted)', marginBottom: 10,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{description}</p>
        )}

        {progress > 0 && progress < 100 && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--foreground-subtle)', marginBottom: 4 }}>
              <span>{t('qa_ui.scenario_progress')}</span><span>{progress}%</span>
            </div>
            <div
              role="progressbar"
              aria-label={t('qa_ui.scenario_progress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              style={{ height: 4, background: 'var(--muted)', borderRadius: 3, overflow: 'hidden' }}
            >
              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', borderRadius: 3 }} />
            </div>
          </div>
        )}

        <button
          disabled={isLocked && !onUnlock}
          aria-describedby={isLocked && unlockReason ? unlockReasonId : undefined}
          onClick={(event) => {
            event.stopPropagation();
            if (isLocked) onUnlock?.();
            else onStart?.();
          }}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 10, border: 'none',
            background: isLocked ? '#475569' : isCompleted ? 'var(--success)' : 'var(--primary)',
            color: '#fff', fontSize: 12, fontWeight: 600,
            cursor: isLocked && !onUnlock ? 'not-allowed' : 'pointer',
            fontFamily: 'Lexend, sans-serif',
          }}
        >
          {isLocked
            ? onUnlock ? t('qa_ui.scenario_unlock_options') : t('qa_ui.scenario_locked')
            : isCompleted
              ? t('qa_ui.scenario_done')
              : progress > 0
                ? t('qa_ui.scenario_continue', { progress })
                : t('qa_ui.scenario_start')}
        </button>

        {isLocked && unlockReason && (
          <p
            id={unlockReasonId}
            style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45, color: 'var(--foreground-secondary)' }}
          >
            {unlockReason}
          </p>
        )}
      </div>

      {isLocked && (
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 'var(--radius-lg)', pointerEvents: 'none',
        }}>
          <div style={{
            width: 32, height: 32, background: '#fff', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>🔒</div>
        </div>
      )}
    </article>
  );
}
