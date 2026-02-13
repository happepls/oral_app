// audio-stream-manager.js - Advanced audio streaming with adaptive bitrate and network optimization
class AudioStreamManager {
  constructor(options = {}) {
    this.options = {
      // Audio parameters
      sampleRate: options.sampleRate || 16000,
      channelCount: options.channelCount || 1,
      bitDepth: options.bitDepth || 16,
      
      // Network parameters
      maxChunkSize: options.maxChunkSize || 1024, // Maximum bytes per chunk
      minChunkSize: options.minChunkSize || 256,  // Minimum bytes per chunk
      adaptiveBitrate: options.adaptiveBitrate !== false,
      networkOptimization: options.networkOptimization !== false,
      
      // Buffer management
      bufferDuration: options.bufferDuration || 200, // Target buffer in ms
      maxBufferDuration: options.maxBufferDuration || 500, // Maximum buffer in ms
      
      // Compression
      enableCompression: options.enableCompression !== false,
      compressionLevel: options.compressionLevel || 6, // 1-9, higher = better compression
      
      // Performance monitoring
      enableMetrics: options.enableMetrics !== false,
      metricsInterval: options.metricsInterval || 1000 // ms
    };
    
    // Network state tracking
    this.networkState = {
      rtt: 50, // Round trip time in ms
      packetLoss: 0, // Packet loss percentage
      bandwidth: 1000000, // Estimated bandwidth in bits per second
      congestion: false, // Network congestion flag
      lastUpdate: Date.now()
    };
    
    // Audio buffer management
    this.audioBuffer = new ArrayBuffer(0);
    this.bufferQueue = [];
    this.isStreaming = false;
    this.streamStartTime = 0;
    
    // Adaptive streaming state
    this.currentBitrate = this.options.sampleRate * this.options.bitDepth / 8;
    this.targetBitrate = this.currentBitrate;
    this.bitrateHistory = [];
    
    // Performance metrics
    this.metrics = {
      chunksSent: 0,
      chunksReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      averageLatency: 0,
      jitter: 0,
      lastChunkTime: 0
    };
    
    // Compression utilities
    this.compressionWorker = null;
    this.initCompression();
    
    // Start metrics collection
    if (this.options.enableMetrics) {
      this.startMetricsCollection();
    }
  }
  
  initCompression() {
    if (!this.options.enableCompression) return;
    
    // Simple RLE compression for audio data
    this.compressData = (data) => {
      const compressed = [];
      let count = 1;
      let current = data[0];
      
      for (let i = 1; i < data.length; i++) {
        if (data[i] === current && count < 255) {
          count++;
        } else {
          compressed.push(count, current);
          current = data[i];
          count = 1;
        }
      }
      compressed.push(count, current);
      
      return new Uint8Array(compressed);
    };
    
    this.decompressData = (compressed) => {
      const decompressed = [];
      for (let i = 0; i < compressed.length; i += 2) {
        const count = compressed[i];
        const value = compressed[i + 1];
        for (let j = 0; j < count; j++) {
          decompressed.push(value);
        }
      }
      return new Uint8Array(decompressed);
    };
  }
  
  // Adaptive bitrate algorithm
  updateTargetBitrate(networkConditions) {
    const { rtt, packetLoss, bandwidth, congestion } = networkConditions;
    
    // Base bitrate calculation
    let newBitrate = this.options.sampleRate * this.options.bitDepth / 8;
    
    // Adjust based on RTT
    if (rtt > 200) {
      newBitrate *= 0.7; // Reduce bitrate for high latency
    } else if (rtt > 100) {
      newBitrate *= 0.85;
    }
    
    // Adjust based on packet loss
    if (packetLoss > 5) {
      newBitrate *= 0.6;
    } else if (packetLoss > 2) {
      newBitrate *= 0.8;
    }
    
    // Adjust based on bandwidth
    const bandwidthBytes = bandwidth / 8;
    newBitrate = Math.min(newBitrate, bandwidthBytes * 0.8); // Use 80% of available bandwidth
    
    // Adjust based on congestion
    if (congestion) {
      newBitrate *= 0.5;
    }
    
    // Apply smoothing to prevent abrupt changes
    const smoothingFactor = 0.3;
    this.targetBitrate = this.currentBitrate * (1 - smoothingFactor) + newBitrate * smoothingFactor;
    
    // Store history for analysis
    this.bitrateHistory.push({
      timestamp: Date.now(),
      targetBitrate: this.targetBitrate,
      networkConditions: { ...networkConditions }
    });
    
    // Keep only recent history
    if (this.bitrateHistory.length > 100) {
      this.bitrateHistory.shift();
    }
  }
  
  // Network condition monitoring
  updateNetworkConditions(rtt, packetLoss, bandwidth) {
    this.networkState.rtt = rtt;
    this.networkState.packetLoss = packetLoss;
    this.networkState.bandwidth = bandwidth;
    this.networkState.lastUpdate = Date.now();
    
    // Detect congestion
    const recentRtt = this.bitrateHistory.slice(-10).map(h => h.networkConditions.rtt);
    const avgRtt = recentRtt.reduce((a, b) => a + b, 0) / recentRtt.length;
    this.networkState.congestion = rtt > avgRtt * 1.5;
    
    // Update target bitrate
    if (this.options.adaptiveBitrate) {
      this.updateTargetBitrate(this.networkState);
    }
  }
  
  // Chunk audio data for optimal transmission
  chunkAudioData(audioData) {
    const chunks = [];
    const sampleSize = this.options.bitDepth / 8;
    const bytesPerMs = (this.options.sampleRate * sampleSize) / 1000;
    const targetChunkDuration = Math.min(
      this.options.bufferDuration / 4, // Target 1/4 of buffer duration
      50 // Maximum 50ms chunks
    );
    const targetChunkSize = Math.floor(targetChunkDuration * bytesPerMs);
    
    // Adjust chunk size based on network conditions
    let adjustedChunkSize = targetChunkSize;
    if (this.networkState.rtt > 150) {
      adjustedChunkSize = Math.min(targetChunkSize, this.options.maxChunkSize / 2);
    }
    if (this.networkState.packetLoss > 3) {
      adjustedChunkSize = Math.max(targetChunkSize / 2, this.options.minChunkSize);
    }
    
    // Create chunks
    for (let i = 0; i < audioData.length; i += adjustedChunkSize) {
      const chunk = audioData.slice(i, Math.min(i + adjustedChunkSize, audioData.length));
      chunks.push(chunk);
    }
    
    return chunks;
  }
  
  // Send audio data with optimization
  async sendAudioData(audioData, sendFunction) {
    if (!this.isStreaming) {
      this.isStreaming = true;
      this.streamStartTime = Date.now();
    }
    
    // Apply compression if enabled
    let processedData = audioData;
    if (this.options.enableCompression) {
      const compressed = this.compressData(new Uint8Array(audioData));
      if (compressed.length < audioData.length * 0.8) { // Only use if compression is effective
        processedData = compressed;
      }
    }
    
    // Chunk the data
    const chunks = this.chunkAudioData(processedData);
    
    // Send chunks with timing optimization
    const chunkInterval = Math.max(
      10, // Minimum 10ms between chunks
      this.networkState.rtt / 10 // Adjust based on RTT
    );
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const timestamp = Date.now();
      
      // Create optimized packet
      const packet = {
        type: 'audio_chunk',
        sequence: this.metrics.chunksSent,
        timestamp: timestamp,
        data: chunk,
        compressed: this.options.enableCompression && chunk !== audioData,
        metrics: this.options.enableMetrics ? {
          bitrate: this.currentBitrate,
          bufferLevel: this.getBufferLevel()
        } : null
      };
      
      // Send the packet
      await sendFunction(packet);
      
      // Update metrics
      this.metrics.chunksSent++;
      this.metrics.bytesSent += chunk.byteLength;
      this.metrics.lastChunkTime = timestamp;
      
      // Adaptive timing
      if (i < chunks.length - 1) {
        await this.delay(chunkInterval);
      }
    }
  }
  
  // Receive and process audio data
  async receiveAudioData(packet) {
    this.metrics.chunksReceived++;
    this.metrics.bytesReceived += packet.data.byteLength;
    
    let audioData = packet.data;
    
    // Decompress if needed
    if (packet.compressed && this.options.enableCompression) {
      audioData = this.decompressData(new Uint8Array(packet.data));
    }
    
    // Add to buffer
    this.bufferQueue.push({
      sequence: packet.sequence,
      timestamp: packet.timestamp,
      data: audioData
    });
    
    // Sort by sequence to handle out-of-order packets
    this.bufferQueue.sort((a, b) => a.sequence - b.sequence);
    
    // Update network conditions from packet metrics
    if (packet.metrics) {
      this.updateNetworkConditions(
        packet.metrics.rtt || this.networkState.rtt,
        packet.metrics.packetLoss || this.networkState.packetLoss,
        packet.metrics.bandwidth || this.networkState.bandwidth
      );
    }
    
    return audioData;
  }
  
  // Get current buffer level
  getBufferLevel() {
    const totalBytes = this.bufferQueue.reduce((sum, chunk) => sum + chunk.data.byteLength, 0);
    const bytesPerMs = (this.options.sampleRate * this.options.bitDepth / 8) / 1000;
    return totalBytes / bytesPerMs; // Buffer duration in ms
  }
  
  // Get next audio chunk for playback
  getNextChunk() {
    if (this.bufferQueue.length === 0) return null;
    
    const chunk = this.bufferQueue.shift();
    return chunk.data;
  }
  
  // Performance metrics collection
  startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastChunk = now - this.metrics.lastChunkTime;
      
      // Calculate jitter
      if (this.metrics.chunksReceived > 1) {
        const jitter = Math.abs(timeSinceLastChunk - (this.metricsInterval || 1000));
        this.metrics.jitter = this.metrics.jitter * 0.9 + jitter * 0.1; // Exponential smoothing
      }
      
      // Calculate average latency
      if (this.metrics.chunksReceived > 0) {
        this.metrics.averageLatency = timeSinceLastChunk;
      }
      
      // Log performance metrics
      if (this.options.enableMetrics) {
        console.log('Audio Stream Metrics:', {
          chunksSent: this.metrics.chunksSent,
          chunksReceived: this.metrics.chunksReceived,
          bytesSent: this.metrics.bytesSent,
          bytesReceived: this.metrics.bytesReceived,
          averageLatency: this.metrics.averageLatency,
          jitter: this.metrics.jitter,
          bufferLevel: this.getBufferLevel(),
          currentBitrate: this.currentBitrate,
          networkConditions: this.networkState
        });
      }
    }, this.options.metricsInterval);
  }
  
  // Utility delay function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Cleanup
  destroy() {
    this.isStreaming = false;
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.compressionWorker) {
      this.compressionWorker.terminate();
    }
  }
  
  // Get performance report
  getPerformanceReport() {
    return {
      metrics: { ...this.metrics },
      networkState: { ...this.networkState },
      bitrateHistory: [...this.bitrateHistory],
      averageBitrate: this.bitrateHistory.reduce((sum, h) => sum + h.targetBitrate, 0) / this.bitrateHistory.length || 0,
      streamingDuration: this.isStreaming ? Date.now() - this.streamStartTime : 0
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioStreamManager;
} else if (typeof window !== 'undefined') {
  window.AudioStreamManager = AudioStreamManager;
}