import React, { useState, useEffect } from 'react';
import { useRive, RuntimeLoader, Fit, Layout } from '@rive-app/react-webgl2';
import wasm from '@rive-app/webgl2/rive.wasm';
import animation from '../assets/guaji-transition.riv';
RuntimeLoader.setWasmUrl(wasm);
RuntimeLoader.setWasmFallbackUrl(null);
class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <span>✨</span> : this.props.children; }
}
function Accent() {
  const [failed, setFailed] = useState(false);
  const { rive, RiveComponent } = useRive({ src: animation, autoplay: false, enableRiveAssetCDN: false,
    layout: new Layout({ fit: Fit.Contain }), onLoadError: () => setFailed(true) });
  useEffect(() => {
    if (!rive) return;
    const start = performance.now();
    let frame;
    const draw = now => {
      const elapsed = Math.min(400, now - start);
      rive.scrub('Fade in and out', elapsed / 100);
      if (elapsed < 400) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [rive]);
  return <div data-rive-state={failed ? 'fallback' : rive ? 'ready' : 'loading'} className="relative h-full w-full">{(!rive || failed) && <span className="absolute inset-0 flex items-center justify-center text-3xl">✨</span>}{!failed && <RiveComponent className="h-full w-full" />}</div>;
}
export default function PracticeTransitionAccent() { return <Boundary><Accent /></Boundary>; }
