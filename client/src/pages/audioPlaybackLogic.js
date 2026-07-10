// Pure playback-path decision for cross-origin (COS) replay audio.
//
// Progressive HTMLAudioElement playback (edge-download-and-play, first byte out)
// is preferred because on the production path the old "fetch whole WAV, then
// decodeAudioData, then play" added ~3s of silence before first sound.
//
// It is used only when there is no active Web Audio queue that needs
// sample-accurate scheduling:
//  - autoQueue=false (user replay): always progressive.
//  - autoQueue=true (auto-play chaining): keep Web Audio scheduling if there's
//    still queued audio in the future (nextStartTime beyond the context clock);
//    otherwise progressive is fine.
export function shouldUseProgressiveAudio(autoQueue, nextStartTime, ctxCurrentTime) {
  if (!autoQueue) return true;
  const hasPendingQueue = (nextStartTime || 0) > (ctxCurrentTime || 0) + 0.05;
  return !hasPendingQueue;
}

// The media proxy (`/api/media/proxy?url=`) exists to add CORS headers for the
// `fetch()`→`decodeAudioData` Web Audio path. But on the production route
// (CN browser → Cloudflare → Bangkok Nginx → COS Shanghai) the proxy adds a
// 2-3s handshake and throttles to ~10KB/s, so a 68KB clip takes 5-8s.
// A plain HTMLAudioElement doesn't need CORS, so progressive replay can point
// straight at the cross-origin COS URL (~200ms from CN, and COS supports Range
// so seeking works). We keep the proxy as a one-shot fallback on error.
export function proxyUrlFor(rawUrl) {
  return `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`;
}

// Resolve the <audio> src for a given attempt.
//   attempt 'direct' → the raw COS URL (no proxy).
//   attempt 'proxy'  → the media-proxy URL (CORS/allowlist path).
export function progressiveAudioSrc(rawUrl, attempt) {
  return attempt === 'proxy' ? proxyUrlFor(rawUrl) : rawUrl;
}

// State transition on a progressive-playback `error` event. Direct play tries
// the proxy once; a proxy failure is terminal (no further retry — prevents a
// direct↔proxy loop). Returns the next attempt or null when exhausted.
export function nextProgressiveAttempt(attempt) {
  return attempt === 'direct' ? 'proxy' : null;
}
