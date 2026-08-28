const PCM16_BYTES_PER_SAMPLE = 2;
const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_PRIMING_MS = 160;
const DEFAULT_SCHEDULE_AHEAD_MS = 20;

function asUint8Array(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('PCM chunk must be an ArrayBuffer or typed array');
}

export function unpackPcmAudioPacket(value) {
  const bytes = asUint8Array(value);
  if (
    bytes.byteLength >= 4
    && bytes[0] === 0x47
    && bytes[1] === 0x4a
    && bytes[2] === 0x01
    && bytes.byteLength >= 4 + bytes[3]
  ) {
    const idLength = bytes[3];
    // Realtime response IDs are ASCII-safe identifiers. Avoid TextDecoder so
    // older Android WebViews and Jest/jsdom follow the same code path.
    const responseId = String.fromCharCode(...bytes.subarray(4, 4 + idLength));
    return { responseId: responseId || null, pcm: bytes.slice(4 + idLength) };
  }
  return { responseId: null, pcm: bytes };
}

/**
 * Ordered PCM16LE mono playback scheduler for the 24 kHz Omni realtime stream.
 *
 * `enqueue()` accepts either bytes or a promise for bytes. Calls are consumed in
 * invocation order, even if those promises resolve out of order. Capture
 * `scheduler.generation` before asynchronous Blob conversion and pass it back to
 * `enqueue`; `stop()` invalidates that generation so late chunks are discarded.
 * Call `flush()` on response.audio.done to play a final buffer shorter than the
 * priming threshold.
 */
export class PcmStreamScheduler {
  constructor(audioContext, options = {}) {
    if (!audioContext) throw new TypeError('audioContext is required');

    this.audioContext = audioContext;
    this.sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.primingMs = options.primingMs ?? DEFAULT_PRIMING_MS;
    this.scheduleAheadMs = options.scheduleAheadMs ?? DEFAULT_SCHEDULE_AHEAD_MS;
    this.onPlaybackStart = options.onPlaybackStart || null;
    this.onPlaybackIdle = options.onPlaybackIdle || null;

    this._generation = 1;
    this._serial = Promise.resolve();
    this._carryByte = null;
    this._pending = [];
    this._pendingSamples = 0;
    this._primed = false;
    this._nextStartTime = 0;
    this._sources = new Set();
    this._hasScheduledAudio = false;
  }

  get generation() {
    return this._generation;
  }

  get hasScheduledAudio() {
    return this._hasScheduledAudio;
  }

  get nextStartTime() {
    return this._nextStartTime;
  }

  get bufferedDurationMs() {
    return (this._pendingSamples / this.sampleRate) * 1000;
  }

  enqueue(chunkOrPromise, generation = this._generation) {
    const prior = this._serial;
    const operation = prior.then(async () => {
      const chunk = await chunkOrPromise;
      if (generation !== this._generation) return false;
      this._consume(asUint8Array(chunk), generation);
      return true;
    });
    // A rejected conversion must not permanently poison later queue entries.
    this._serial = operation.catch(() => undefined);
    return operation;
  }

  flush(generation = this._generation) {
    const prior = this._serial;
    const operation = prior.then(() => {
      if (generation !== this._generation) return false;
      this._primed = true;
      this._schedulePending(generation);
      return true;
    });
    this._serial = operation.catch(() => undefined);
    return operation;
  }

  stop() {
    this._generation += 1;
    this._serial = Promise.resolve();
    this._carryByte = null;
    this._pending = [];
    this._pendingSamples = 0;
    this._primed = false;
    this._nextStartTime = 0;
    this._hasScheduledAudio = false;
    this._sources.forEach(source => {
      try { source.stop(); } catch { /* already stopped */ }
    });
    this._sources.clear();
    return this._generation;
  }

  _consume(bytes, generation) {
    if (generation !== this._generation || bytes.byteLength === 0) return;

    let input = bytes;
    if (this._carryByte !== null) {
      const joined = new Uint8Array(bytes.byteLength + 1);
      joined[0] = this._carryByte;
      joined.set(bytes, 1);
      input = joined;
      this._carryByte = null;
    }

    const completeByteLength = input.byteLength - (input.byteLength % PCM16_BYTES_PER_SAMPLE);
    if (completeByteLength < input.byteLength) {
      this._carryByte = input[input.byteLength - 1];
    }
    if (completeByteLength === 0) return;

    const samples = new Float32Array(completeByteLength / PCM16_BYTES_PER_SAMPLE);
    const view = new DataView(input.buffer, input.byteOffset, completeByteLength);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = view.getInt16(index * PCM16_BYTES_PER_SAMPLE, true) / 32768;
    }

    this._pending.push(samples);
    this._pendingSamples += samples.length;
    if (!this._primed && this.bufferedDurationMs >= this.primingMs) {
      this._primed = true;
    }
    if (this._primed) this._schedulePending(generation);
  }

  _schedulePending(generation) {
    if (generation !== this._generation) return;

    while (this._pending.length > 0 && generation === this._generation) {
      const samples = this._pending.shift();
      this._pendingSamples -= samples.length;

      const buffer = this.audioContext.createBuffer(1, samples.length, this.sampleRate);
      buffer.getChannelData(0).set(samples);
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);

      const minimumStart = this.audioContext.currentTime + (this.scheduleAheadMs / 1000);
      const startTime = Math.max(minimumStart, this._nextStartTime);
      this._nextStartTime = startTime + buffer.duration;
      this._sources.add(source);
      source.onended = () => {
        this._sources.delete(source);
        if (generation !== this._generation) return;
        if (this._sources.size === 0 && this._pending.length === 0) {
          // A real underrun ended the scheduled timeline. Re-prime instead of
          // playing the next isolated network chunk immediately; this trades a
          // short controlled pause for continuous speech on jittery Android
          // devices.
          this._primed = false;
          this._hasScheduledAudio = false;
          this._nextStartTime = 0;
          this.onPlaybackIdle?.();
        }
      };
      source.start(startTime);

      if (!this._hasScheduledAudio) {
        this._hasScheduledAudio = true;
        this.onPlaybackStart?.();
      }
    }
  }
}

export function createPcmStreamScheduler(audioContext, options) {
  return new PcmStreamScheduler(audioContext, options);
}
