import { createPcmStreamScheduler, unpackPcmAudioPacket } from './pcmStreamScheduler';

function pcm16(...samples) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, index) => view.setInt16(index * 2, sample, true));
  return bytes;
}

function deferred() {
  let resolve;
  const promise = new Promise(value => { resolve = value; });
  return { promise, resolve };
}

function fakeAudioContext() {
  const buffers = [];
  const sources = [];
  const context = {
    currentTime: 10,
    destination: {},
    decodeAudioData: jest.fn(),
    createBuffer: jest.fn((channels, length, sampleRate) => {
      const data = new Float32Array(length);
      const buffer = {
        duration: length / sampleRate,
        getChannelData: jest.fn(() => data),
        data,
      };
      buffers.push(buffer);
      return buffer;
    }),
    createBufferSource: jest.fn(() => {
      const source = {
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        onended: null,
      };
      sources.push(source);
      return source;
    }),
  };
  return { context, buffers, sources };
}

describe('PcmStreamScheduler', () => {
  test('unpacks response identity while accepting legacy raw PCM', () => {
    const id = Uint8Array.from('response-1', character => character.charCodeAt(0));
    const packet = new Uint8Array(4 + id.length + 2);
    packet.set([0x47, 0x4a, 0x01, id.length]);
    packet.set(id, 4);
    packet.set([4, 5], 4 + id.length);
    expect(unpackPcmAudioPacket(packet)).toEqual({
      responseId: 'response-1',
      pcm: new Uint8Array([4, 5]),
    });
    expect(unpackPcmAudioPacket(new Uint8Array([6, 7]))).toEqual({
      responseId: null,
      pcm: new Uint8Array([6, 7]),
    });
  });
  test('converts known PCM16 directly and preserves asynchronous invocation order', async () => {
    const { context, buffers, sources } = fakeAudioContext();
    const scheduler = createPcmStreamScheduler(context, { primingMs: 0 });
    const first = deferred();

    const firstQueued = scheduler.enqueue(first.promise);
    const secondQueued = scheduler.enqueue(pcm16(2000, -2000));
    await Promise.resolve();
    expect(sources).toHaveLength(0);

    first.resolve(pcm16(1000, -1000));
    await Promise.all([firstQueued, secondQueued]);

    expect(context.decodeAudioData).not.toHaveBeenCalled();
    expect(buffers[0].data[0]).toBeCloseTo(1000 / 32768);
    expect(buffers[1].data[0]).toBeCloseTo(2000 / 32768);
    expect(sources[0].start).toHaveBeenCalledWith(10.02);
    expect(sources[1].start.mock.calls[0][0]).toBeGreaterThan(10.02);
  });

  test('carries an odd trailing byte into the next chunk', async () => {
    const { context, buffers } = fakeAudioContext();
    const scheduler = createPcmStreamScheduler(context, { primingMs: 0 });

    await scheduler.enqueue(new Uint8Array([0x34]));
    expect(buffers).toHaveLength(0);
    await scheduler.enqueue(new Uint8Array([0x12, 0xfe]));
    await scheduler.enqueue(new Uint8Array([0xff]));

    expect(buffers).toHaveLength(2);
    expect(buffers[0].data[0]).toBeCloseTo(0x1234 / 32768);
    expect(buffers[1].data[0]).toBeCloseTo(-2 / 32768);
  });

  test('primes between 120 and 200ms before scheduling', async () => {
    const { context, sources } = fakeAudioContext();
    const scheduler = createPcmStreamScheduler(context, { primingMs: 160 });

    await scheduler.enqueue(pcm16(...new Array(2400).fill(1))); // 100ms
    expect(scheduler.bufferedDurationMs).toBe(100);
    expect(sources).toHaveLength(0);

    await scheduler.enqueue(pcm16(...new Array(1440).fill(2))); // +60ms
    expect(sources).toHaveLength(2);
    expect(scheduler.hasScheduledAudio).toBe(true);
    expect(sources[1].start.mock.calls[0][0]).toBeCloseTo(
      sources[0].start.mock.calls[0][0] + 0.1,
    );
  });

  test('flush schedules a final response shorter than the priming threshold', async () => {
    const { context, sources } = fakeAudioContext();
    const scheduler = createPcmStreamScheduler(context, { primingMs: 160 });

    await scheduler.enqueue(pcm16(...new Array(1200).fill(3))); // 50ms
    expect(sources).toHaveLength(0);
    await scheduler.flush();
    expect(sources).toHaveLength(1);
  });

  test('re-primes after an underrun instead of playing an isolated chunk', async () => {
    const { context, sources } = fakeAudioContext();
    const scheduler = createPcmStreamScheduler(context, { primingMs: 160 });

    await scheduler.enqueue(pcm16(...new Array(3840).fill(1))); // 160ms
    expect(sources).toHaveLength(1);
    sources[0].onended();

    await scheduler.enqueue(pcm16(...new Array(2400).fill(2))); // only 100ms
    expect(sources).toHaveLength(1);
    await scheduler.enqueue(pcm16(...new Array(1440).fill(3))); // reaches 160ms
    expect(sources).toHaveLength(3);
  });

  test('stop invalidates late asynchronous chunks and permits a new generation', async () => {
    const { context, sources } = fakeAudioContext();
    const scheduler = createPcmStreamScheduler(context, { primingMs: 0 });
    const oldGeneration = scheduler.generation;
    const late = deferred();
    const lateQueued = scheduler.enqueue(late.promise, oldGeneration);

    const newGeneration = scheduler.stop();
    late.resolve(pcm16(100));
    await lateQueued;
    expect(sources).toHaveLength(0);

    await scheduler.enqueue(pcm16(200), newGeneration);
    expect(sources).toHaveLength(1);
    scheduler.stop();
    expect(sources[0].stop).toHaveBeenCalledTimes(1);
  });
});
