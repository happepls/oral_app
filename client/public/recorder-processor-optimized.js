// recorder-processor-optimized.js - Low-latency audio processing
class RecorderProcessorOptimized extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Ultra-low latency configuration
    // 800 samples = 50ms at 16kHz for near real-time response
    this._bufferSize = 800;
    this._buffer = new Int16Array(this._bufferSize);
    this._bufferIndex = 0;
    
    // Voice Activity Detection (VAD) parameters
    this._energyThreshold = 0.02; // Energy threshold for speech detection
    this._silenceFrames = 0;
    this._speechFrames = 0;
    this._isSpeech = false;
    this._frameSize = 160; // 10ms frames for VAD
    this._frameEnergy = 0;
    
    // Adaptive resampling for better quality at lower latency
    this._lastSampleIndex = 0;
    this._accumulator = 0;
    
    // Performance monitoring
    this._frameCount = 0;
    this._startTime = currentTime;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const inputChannel = input[0];

    if (inputChannel) {
      const targetSampleRate = 16000;
      const sourceSampleRate = sampleRate;
      const ratio = sourceSampleRate / targetSampleRate;
      
      // Optimized resampling with linear interpolation
      for (let i = 0; i < inputChannel.length; i++) {
        this._accumulator += ratio;
        
        if (this._accumulator >= 1.0) {
          this._accumulator -= 1.0;
          
          // Linear interpolation for better quality
          const index = Math.floor(i);
          const fraction = this._accumulator;
          let sample;
          
          if (index + 1 < inputChannel.length) {
            // Linear interpolation between two samples
            sample = inputChannel[index] * (1 - fraction) + inputChannel[index + 1] * fraction;
          } else {
            // Use current sample if next is not available
            sample = inputChannel[index];
          }
          
          // Clamp and convert to Int16
          sample = Math.max(-1, Math.min(1, sample));
          const int16Sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          
          // Voice Activity Detection
          this._frameEnergy += sample * sample;
          
          this._buffer[this._bufferIndex++] = int16Sample;
          
          // Check for VAD every frame (10ms)
          if (this._bufferIndex % this._frameSize === 0) {
            const frameEnergy = this._frameEnergy / this._frameSize;
            this._frameEnergy = 0;
            
            if (frameEnergy > this._energyThreshold) {
              this._speechFrames++;
              this._silenceFrames = 0;
              if (this._speechFrames >= 3 && !this._isSpeech) { // 30ms of speech
                this._isSpeech = true;
                // Send immediate notification for speech start
                this.port.postMessage({ type: 'speech_start', energy: frameEnergy });
              }
            } else {
              this._silenceFrames++;
              this._speechFrames = 0;
              if (this._silenceFrames >= 10 && this._isSpeech) { // 100ms of silence
                this._isSpeech = false;
                // Send notification for speech end
                this.port.postMessage({ type: 'speech_end', energy: frameEnergy });
              }
            }
          }
          
          if (this._bufferIndex === this._bufferSize) {
            // Send audio data with performance metrics
            this.port.postMessage({
              type: 'audio_data',
              buffer: this._buffer.slice(0, this._bufferSize),
              isSpeech: this._isSpeech,
              timestamp: currentTime
            });
            this._bufferIndex = 0;
          }
        }
      }
    }
    
    return true;
  }
  
  static get parameterDescriptors() {
    return [
      {
        name: 'bufferSize',
        defaultValue: 800,
        minValue: 400,
        maxValue: 1600
      },
      {
        name: 'energyThreshold',
        defaultValue: 0.02,
        minValue: 0.001,
        maxValue: 0.1
      }
    ];
  }
}

registerProcessor('recorder-processor-optimized', RecorderProcessorOptimized);