import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRive, RuntimeLoader, Layout, Fit, Alignment } from '@rive-app/react-webgl2';
import riveWasmUrl from '@rive-app/webgl2/rive.wasm';
import feedbackAnimation from '../assets/score-feedback.riv';
import './ScoreFeedback.css';

// Bundle the matching runtime locally; no CDN dependency on the scoring path.
RuntimeLoader.setWasmUrl(riveWasmUrl);
RuntimeLoader.setWasmFallbackUrl(null);

function StaticAccent() {
  return <span className="score-feedback__static"><Sparkles size={28} /></span>;
}

class AccentBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <StaticAccent /> : this.props.children; }
}

function RiveAccent() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const { rive, RiveComponent } = useRive({
    src: feedbackAnimation,
    stateMachine: 'Feedback',
    autoplay: true,
    enableRiveAssetCDN: false,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    onRiveReady: () => setReady(true),
    onLoadError: () => setFailed(true),
  });
  useEffect(() => {
    if (!rive) return;
    // Freeze the settled frame, rather than keeping every historical card ticking.
    const timer = setTimeout(() => rive.pause(), 1700);
    return () => clearTimeout(timer);
  }, [rive]);
  return (
    <span className="score-feedback__animation" data-rive-state={failed ? 'fallback' : ready ? 'ready' : 'loading'}>
      {(!ready || failed) && <StaticAccent />}
      {!failed && <RiveComponent className={ready ? 'score-feedback__canvas' : 'score-feedback__canvas score-feedback__canvas--loading'} />}
    </span>
  );
}

export default function ScoreFeedback({ delta, total, reason }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  return (
    <AnimatePresence>
      {visible && (
        <motion.section
          data-testid="score-feedback"
          aria-label={t('score_feedback_title')}
          className="score-feedback"
          initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reducedMotion ? 0 : -12, scale: reducedMotion ? 1 : 0.98 }}
          transition={{ duration: reducedMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <div aria-hidden="true" className="score-feedback__accent">
            {reducedMotion ? <StaticAccent /> : <AccentBoundary><RiveAccent /></AccentBoundary>}
          </div>
          <div className="score-feedback__body" role="status" aria-live="polite" aria-atomic="true">
            <p className="score-feedback__label">{t('score_feedback_title')}</p>
            <div className="score-feedback__numbers">
              <strong>{t('score_feedback_gain', { delta })}</strong>
              <span>{t('score_feedback_total', { total })}</span>
            </div>
            {reason && <p className="score-feedback__reason">{reason}</p>}
          </div>
          <button type="button" className="score-feedback__dismiss" onClick={() => setVisible(false)}
            aria-label={t('score_feedback_hide')} title={t('score_feedback_hide')}>
            <X size={18} aria-hidden="true" />
          </button>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
