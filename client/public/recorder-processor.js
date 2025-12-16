// recorder-processor.js
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // We will send data back to the main thread every 1600 samples.
    // With a sample rate of 16000, this is every 100ms.
    this._bufferSize = 1600;
    this._buffer = new Int16Array(this._bufferSize);
    this._bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const inputChannel = input[0];

    if (inputChannel) {
       // Resample the audio to 16kHz
       const targetSampleRate = 16000;
       const sourceSampleRate = sampleRate;
       const ratio = sourceSampleRate / targetSampleRate;

       for (let i = 0; i < inputChannel.length; i += ratio) {
           const index = Math.floor(i);
           let sample = inputChannel[index];
           
           // Clamp the sample to [-1, 1]
           sample = Math.max(-1, Math.min(1, sample));
           
           // Convert Float32 to Int16
           const int16Sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
           
           this._buffer[this._bufferIndex++] = int16Sample;

           if (this._bufferIndex === this._bufferSize) {
               this.port.postMessage(this._buffer.slice(0, this._bufferSize));
               this._bufferIndex = 0;
           }
       }
    }
    
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
