import { shouldUseProgressiveAudio } from '../pages/audioPlaybackLogic';

describe('shouldUseProgressiveAudio', () => {
  test('user replay (autoQueue=false) always uses progressive playback', () => {
    expect(shouldUseProgressiveAudio(false, 0, 0)).toBe(true);
    // Even with a pending Web Audio queue, an explicit replay is progressive.
    expect(shouldUseProgressiveAudio(false, 100, 10)).toBe(true);
  });

  test('auto-play with no pending queue uses progressive playback', () => {
    expect(shouldUseProgressiveAudio(true, 0, 0)).toBe(true);
    // nextStartTime already in the past → nothing scheduled ahead.
    expect(shouldUseProgressiveAudio(true, 5, 10)).toBe(true);
  });

  test('auto-play with audio still scheduled ahead keeps Web Audio scheduling', () => {
    // nextStartTime is meaningfully beyond the context clock → queue in flight.
    expect(shouldUseProgressiveAudio(true, 12, 10)).toBe(false);
  });

  test('near-equal times within the 50ms epsilon are treated as no pending queue', () => {
    expect(shouldUseProgressiveAudio(true, 10.02, 10)).toBe(true);
  });

  test('tolerates undefined/null time inputs', () => {
    expect(shouldUseProgressiveAudio(true, undefined, undefined)).toBe(true);
    expect(shouldUseProgressiveAudio(false, null, null)).toBe(true);
  });
});
