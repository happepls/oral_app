import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { useAnchorRect } from '../hooks/useAnchorRect';

// Decide where the bubble sits relative to the highlighted rect. Prefer the
// requested side; flip when it would overflow the viewport.
// (Replicated in tour-logic.test.js — keep in sync.)
function computePlacement(rect, viewport, prefer = 'bottom') {
  const BUBBLE_H = 160;
  const GAP = 12;
  const spaceBelow = viewport.height - rect.bottom;
  const spaceAbove = rect.top;

  if (prefer === 'bottom') {
    if (spaceBelow >= BUBBLE_H + GAP) return 'bottom';
    if (spaceAbove >= BUBBLE_H + GAP) return 'top';
    return spaceBelow >= spaceAbove ? 'bottom' : 'top';
  }
  if (spaceAbove >= BUBBLE_H + GAP) return 'top';
  if (spaceBelow >= BUBBLE_H + GAP) return 'bottom';
  return spaceAbove >= spaceBelow ? 'top' : 'bottom';
}

const PADDING = 8; // breathing room around the highlighted element

/**
 * Full-screen spotlight overlay for one tour step.
 *
 * Renders a dimmed SVG mask with a rounded hole punched over the anchor rect,
 * plus an instruction bubble positioned above/below the hole. The backdrop
 * intercepts all clicks; only the bubble's own buttons are interactive.
 *
 * If the anchor never resolves within the timeout, auto-advances (onNext).
 */
export default function Spotlight({
  anchor,
  title,
  body,
  stepIndex,
  total,
  isLast,
  isFirst,
  prefer = 'bottom',
  onNext,
  onPrev,
  onSkip,
  nextLabel = 'Next',
  doneLabel = 'Done',
  skipLabel = 'Skip',
  prevLabel = 'Back',
}) {
  const { rect, timedOut } = useAnchorRect(anchor);

  // Graceful degradation: anchor missing → skip this step.
  useEffect(() => {
    if (timedOut) onNext();
  }, [timedOut, onNext]);

  if (!rect) return null; // wait for measurement (or timeout effect fires)

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const holeX = Math.max(0, rect.left - PADDING);
  const holeY = Math.max(0, rect.top - PADDING);
  const holeW = rect.width + PADDING * 2;
  const holeH = rect.height + PADDING * 2;

  const placement = computePlacement(rect, { width: vw, height: vh }, prefer);

  // Bubble anchored horizontally to the hole center, clamped to viewport.
  const BUBBLE_W = Math.min(320, vw - 24);
  let bubbleLeft = rect.left + rect.width / 2 - BUBBLE_W / 2;
  bubbleLeft = Math.max(12, Math.min(bubbleLeft, vw - BUBBLE_W - 12));

  const bubbleStyle =
    placement === 'bottom'
      ? { top: holeY + holeH + 12, left: bubbleLeft, width: BUBBLE_W }
      : { bottom: vh - holeY + 12, left: bubbleLeft, width: BUBBLE_W };

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
    >
      {/* Dimmed mask with punched hole — intercepts background clicks. */}
      <svg
        width={vw}
        height={vh}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width={vw} height={vh} fill="white" />
            <rect
              x={holeX}
              y={holeY}
              width={holeW}
              height={holeH}
              rx="14"
              ry="14"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width={vw}
          height={vh}
          fill="rgba(15, 23, 42, 0.72)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* Highlight ring around the hole. */}
      <div
        style={{
          position: 'absolute',
          left: holeX,
          top: holeY,
          width: holeW,
          height: holeH,
          borderRadius: 14,
          boxShadow: '0 0 0 2px rgba(99, 127, 241, 0.9)',
          pointerEvents: 'none',
        }}
      />

      {/* Instruction bubble. */}
      <motion.div
        initial={{ opacity: 0, y: placement === 'bottom' ? -8 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          position: 'absolute',
          ...bubbleStyle,
          background: '#fff',
          borderRadius: 16,
          padding: 16,
          boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
          pointerEvents: 'auto',
        }}
      >
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
          {title}
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: '#475569' }}>
          {body}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: i === stepIndex ? '#637FF1' : '#CBD5E1',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={onSkip}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {skipLabel}
            </button>
            <button
              onClick={isFirst ? undefined : onPrev}
              disabled={isFirst}
              style={{
                background: 'transparent',
                border: '1px solid #E2E8F0',
                color: isFirst ? '#CBD5E1' : '#64748b',
                fontSize: 13,
                padding: '6px 12px',
                borderRadius: 10,
                cursor: isFirst ? 'not-allowed' : 'pointer',
              }}
            >
              {prevLabel}
            </button>
            <button
              onClick={onNext}
              style={{
                background: 'linear-gradient(135deg, #637FF1, #a47af6)',
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                padding: '7px 16px',
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              {isLast ? doneLabel : nextLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(overlay, document.body);
}
