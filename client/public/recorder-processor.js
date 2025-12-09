// recorder-processor.js
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // We will send data back to the main thread every 1600 samples.
    // With a sample rate of 16000, this is every 100ms.
    this._bufferSize = 1600;
    this._buffer = new Float32Array(this._bufferSize);
    this._bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const inputChannel = input[0];

    if (inputChannel) {
       // Resample the audio to 16kHz, which is what most ASR models expect.
       // This is a simple downsampling, not a high-quality one.
       const targetSampleRate = 16000;
       const sourceSampleRate = sampleRate;
       const ratio = sourceSampleRate / targetSampleRate;

       for (let i = 0; i < inputChannel.length; i+=ratio) {
           const index = Math.floor(i);
           this._buffer[this._bufferIndex++] = inputChannel[index];

           if (this._bufferIndex === this._bufferSize) {
               this.port.postMessage(this._buffer);
               this._bufferIndex = 0;
           }
       }
    }
    
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
