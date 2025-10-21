// public/audio-processor.js

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._totalSamples = 0;
    this._samplesSinceLastUpdate = 0;
    // Send an update to the main thread roughly every half second.
    this._updateIntervalInSamples = sampleRate / 2; 
    this._sendDataPacket = false;

    this.port.onmessage = (event) => {
      if (event.data === 'init') {
        this._sendDataPacket = true; // Flag to send the first data packet for verification
        console.log(`[AudioProcessor] Initialized. Sample rate: ${sampleRate}`);
      }
    };
    console.log('[AudioProcessor] Processor created.');
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const sampleCount = input.length > 0 ? input[0].length : 0;

    if (sampleCount > 0) {
      // Send the very first packet of audio data for verification.
      if (this._sendDataPacket) {
        const pcmData = input[0].slice();
        this.port.postMessage({ type: 'data', payload: pcmData });
        this._sendDataPacket = false;
      }

      // Update sample counts
      this._totalSamples += sampleCount;
      this._samplesSinceLastUpdate += sampleCount;

      // If the update interval has been reached, send the new duration
      if (this._samplesSinceLastUpdate >= this._updateIntervalInSamples) {
        const durationInSeconds = this._totalSamples / sampleRate;
        this.port.postMessage({ type: 'duration', payload: durationInSeconds });
        this._samplesSinceLastUpdate = 0;
      }
    }

    // Pass the audio through to the output to keep the graph running.
    if (input.length > 0) {
      for (let channel = 0; channel < output.length; ++channel) {
        if (input[channel]) {
          output[channel].set(input[channel]);
        }
      }
    }
    
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
