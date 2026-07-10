import {
  shouldUseProgressiveAudio,
  proxyUrlFor,
  progressiveAudioSrc,
  nextProgressiveAttempt,
} from '../pages/audioPlaybackLogic';

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

describe('progressive replay: direct COS → proxy fallback', () => {
  const cos = 'https://bucket.cos.ap-shanghai.myqcloud.com/a/clip.mp3';

  test('proxyUrlFor wraps + encodes the raw URL', () => {
    expect(proxyUrlFor(cos)).toBe(
      `/api/media/proxy?url=${encodeURIComponent(cos)}`
    );
  });

  test('direct attempt uses the raw COS URL (no proxy)', () => {
    expect(progressiveAudioSrc(cos, 'direct')).toBe(cos);
  });

  test('proxy attempt uses the media-proxy URL', () => {
    expect(progressiveAudioSrc(cos, 'proxy')).toBe(proxyUrlFor(cos));
  });

  test('unknown/omitted attempt defaults to direct', () => {
    expect(progressiveAudioSrc(cos, undefined)).toBe(cos);
  });

  test('error on direct → next attempt is proxy', () => {
    expect(nextProgressiveAttempt('direct')).toBe('proxy');
  });

  test('error on proxy → no further attempt (terminal, no loop)', () => {
    expect(nextProgressiveAttempt('proxy')).toBeNull();
  });

  test('full transition: direct fails → proxy src, proxy fails → stop', () => {
    let attempt = 'direct';
    expect(progressiveAudioSrc(cos, attempt)).toBe(cos);
    attempt = nextProgressiveAttempt(attempt);
    expect(attempt).toBe('proxy');
    expect(progressiveAudioSrc(cos, attempt)).toBe(proxyUrlFor(cos));
    attempt = nextProgressiveAttempt(attempt);
    expect(attempt).toBeNull();
  });
});
