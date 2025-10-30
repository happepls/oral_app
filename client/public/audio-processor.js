// public/audio-processor.js

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._totalSamples = 0;
    this._samplesSinceLastUpdate = 0;
    this._updateIntervalInSamples = 0;
    this._targetSampleRate = 16000;
    this._sourceSampleRate = 0;

    // Buffer for accumulating audio data before sending
    this._bufferSize = 1600; // Corresponds to 100ms of audio at 16kHz
    this._buffer = new Int16Array(this._bufferSize);
    this._bufferIndex = 0;
    this._isStopped = false;

    this.port.onmessage = (event) => {
      if (event.data === 'init') {
        this._sourceSampleRate = sampleRate;
        this._updateIntervalInSamples = this._sourceSampleRate / 2;
        console.log(`[AudioProcessor] Initialized. Source SR: ${this._sourceSampleRate}, Target SR: ${this._targetSampleRate}. Buffer size: ${this._bufferSize} samples.`);
      } else if (event.data === 'stop') {
        console.log('[AudioProcessor] Stop command received. Flushing buffer and terminating.');
        this.flushBuffer();
        this._isStopped = true;
      }
    };
    console.log('[AudioProcessor] Processor created.');
  }

  /**
   * Flushes the remaining data in the buffer.
   */
  flushBuffer() {
    if (this._bufferIndex > 0) {
      const dataToSend = this._buffer.slice(0, this._bufferIndex);
      this.port.postMessage({ type: 'data', payload: dataToSend }, [dataToSend.buffer]);
      this._bufferIndex = 0;
    }
  }

  /**
   * Resamples the audio buffer.
   */
  resample(audioBuffer, fromSampleRate, toSampleRate) {
    if (fromSampleRate === toSampleRate) {
      return audioBuffer;
    }
    const ratio = fromSampleRate / toSampleRate;
    const newLength = Math.round(audioBuffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < audioBuffer.length; i++) {
        accum += audioBuffer[i];
        count++;
      }
      result[offsetResult] = accum / count;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  /**
   * Converts Float32Array to Int16Array.
   */
  floatTo16BitPCM(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  process(inputs, outputs, parameters) {
    if (this._isStopped) {
      return false; // Terminate the processor
    }

    const input = inputs[0];
    if (!input || input.length === 0 || !input[0] || this._sourceSampleRate === 0) {
      return true;
    }
    
    const pcmData = input[0];
    const sampleCount = pcmData.length;

    if (sampleCount > 0) {
      const resampledData = this.resample(pcmData, this._sourceSampleRate, this._targetSampleRate);
      const pcm16Data = this.floatTo16BitPCM(resampledData);

      // Accumulate data into the buffer
      for (let i = 0; i < pcm16Data.length; i++) {
        this._buffer[this._bufferIndex++] = pcm16Data[i];
        if (this._bufferIndex === this._bufferSize) {
          this.flushBuffer();
        }
      }

      this._totalSamples += sampleCount;
      this._samplesSinceLastUpdate += sampleCount;

      if (this._samplesSinceLastUpdate >= this._updateIntervalInSamples) {
        const durationInSeconds = this._totalSamples / this._sourceSampleRate;
        this.port.postMessage({ type: 'duration', payload: durationInSeconds });
        this._samplesSinceLastUpdate = 0;
      }
    }
    
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
