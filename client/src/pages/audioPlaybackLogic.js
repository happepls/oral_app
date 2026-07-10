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
