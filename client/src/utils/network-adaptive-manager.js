// network-adaptive-manager.js - Network condition monitoring and adaptive streaming
class NetworkAdaptiveManager {
  constructor(options = {}) {
    this.options = {
      // Monitoring parameters
      pingInterval: options.pingInterval || 1000, // ms
      sampleWindow: options.sampleWindow || 10, // number of samples
      
      // Adaptive thresholds
      rttThresholds: options.rttThresholds || {
        excellent: 50,   // < 50ms
        good: 100,       // 50-100ms
        fair: 200,       // 100-200ms
        poor: 300        // > 200ms
      },
      
      packetLossThresholds: options.packetLossThresholds || {
        excellent: 0.5,  // < 0.5%
        good: 1.0,       // 0.5-1%
        fair: 3.0,       // 1-3%
        poor: 5.0        // > 3%
      },
      
      bandwidthEstimation: options.bandwidthEstimation !== false,
      adaptiveQuality: options.adaptiveQuality !== false,
      
      // Logging
      enableLogging: options.enableLogging !== false,
      logLevel: options.logLevel || 'info' // debug, info, warn, error
    };
    
    // Network state
    this.networkState = {
      rtt: 50,
      packetLoss: 0,
      bandwidth: 1000000, // bits per second
      jitter: 0,
      quality: 'excellent',
      stability: 1.0, // 0-1, higher is more stable
      lastUpdate: Date.now()
    };
    
    // Statistics
    this.statistics = {
      rttHistory: [],
      packetLossHistory: [],
      bandwidthHistory: [],
      qualityHistory: [],
      startTime: Date.now()
    };
    
    // Adaptive streaming state
    this.streamingState = {
      currentQuality: 'high',
      targetQuality: 'high',
      qualityHistory: [],
      adaptationCount: 0,
      lastAdaptation: 0
    };
    
    // Monitoring
    this.monitoring = false;
    this.pingInterval = null;
    this.lastPingTime = 0;
    
    // Callbacks
    this.callbacks = {
      onNetworkChange: options.onNetworkChange || null,
      onQualityChange: options.onQualityChange || null,
      onAdaptation: options.onAdaptation || null
    };
    
    this.log('info', 'NetworkAdaptiveManager initialized');
  }
  
  // Logging utility
  log(level, message, data = null) {
    if (!this.options.enableLogging) return;
    
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.options.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    if (messageLevelIndex >= currentLevelIndex) {
      const timestamp = new Date().toISOString();
      const logData = data ? { ...data, timestamp } : { timestamp };
      
      if (level === 'error') {
        console.error(`[NetworkManager] ${message}`, logData);
      } else if (level === 'warn') {
        console.warn(`[NetworkManager] ${message}`, logData);
      } else {
        console.log(`[NetworkManager] ${message}`, logData);
      }
    }
  }
  
  // Start network monitoring
  startMonitoring() {
    if (this.monitoring) return;
    
    this.monitoring = true;
    this.startTime = Date.now();
    
    // Start ping monitoring
    this.startPingMonitoring();
    
    // Start bandwidth estimation
    if (this.options.bandwidthEstimation) {
      this.startBandwidthEstimation();
    }
    
    this.log('info', 'Network monitoring started');
  }
  
  // Stop network monitoring
  stopMonitoring() {
    this.monitoring = false;
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    this.log('info', 'Network monitoring stopped');
  }
  
  // Ping monitoring using WebSocket
  startPingMonitoring() {
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, this.options.pingInterval);
  }
  
  // Send ping message
  sendPing() {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    
    this.lastPingTime = Date.now();
    const pingMessage = {
      type: 'ping',
      timestamp: this.lastPingTime,
      sequence: this.statistics.rttHistory.length
    };
    
    try {
      this.webSocket.send(JSON.stringify(pingMessage));
      this.log('debug', 'Ping sent', pingMessage);
    } catch (error) {
      this.log('error', 'Failed to send ping', error);
    }
  }
  
  // Handle pong response
  handlePong(data) {
    const now = Date.now();
    const rtt = now - data.timestamp;
    
    this.updateRTT(rtt);
    this.log('debug', 'Pong received', { rtt, sequence: data.sequence });
  }
  
  // Update RTT statistics
  updateRTT(rtt) {
    this.statistics.rttHistory.push(rtt);
    
    // Keep only recent history
    if (this.statistics.rttHistory.length > this.options.sampleWindow) {
      this.statistics.rttHistory.shift();
    }
    
    // Calculate statistics
    const avgRtt = this.statistics.rttHistory.reduce((a, b) => a + b, 0) / this.statistics.rttHistory.length;
    const minRtt = Math.min(...this.statistics.rttHistory);
    const maxRtt = Math.max(...this.statistics.rttHistory);
    const variance = this.statistics.rttHistory.reduce((sum, rtt) => sum + Math.pow(rtt - avgRtt, 2), 0) / this.statistics.rttHistory.length;
    const jitter = Math.sqrt(variance);
    
    // Update network state
    const oldRtt = this.networkState.rtt;
    this.networkState.rtt = Math.round(avgRtt);
    this.networkState.jitter = Math.round(jitter);
    this.networkState.lastUpdate = Date.now();
    
    // Calculate stability (inverse of jitter relative to RTT)
    this.networkState.stability = Math.max(0, Math.min(1, 1 - (jitter / Math.max(avgRtt, 1))));
    
    this.log('debug', 'RTT updated', {
      rtt: this.networkState.rtt,
      jitter: this.networkState.jitter,
      stability: this.networkState.stability,
      min: minRtt,
      max: maxRtt
    });
    
    // Check for significant network change
    if (Math.abs(rtt - oldRtt) > 20) { // 20ms threshold
      this.handleNetworkChange();
    }
    
    // Update quality assessment
    this.updateQualityAssessment();
  }
  
  // Update packet loss statistics
  updatePacketLoss(lossRate) {
    this.statistics.packetLossHistory.push(lossRate);
    
    // Keep only recent history
    if (this.statistics.packetLossHistory.length > this.options.sampleWindow) {
      this.statistics.packetLossHistory.shift();
    }
    
    // Calculate average packet loss
    const avgPacketLoss = this.statistics.packetLossHistory.reduce((a, b) => a + b, 0) / this.statistics.packetLossHistory.length;
    
    const oldPacketLoss = this.networkState.packetLoss;
    this.networkState.packetLoss = Math.round(avgPacketLoss * 100) / 100; // Round to 2 decimal places
    this.networkState.lastUpdate = Date.now();
    
    this.log('debug', 'Packet loss updated', {
      packetLoss: this.networkState.packetLoss,
      recentLosses: this.statistics.packetLossHistory.slice(-5)
    });
    
    // Check for significant packet loss change
    if (Math.abs(lossRate - oldPacketLoss) > 1) { // 1% threshold
      this.handleNetworkChange();
    }
    
    // Update quality assessment
    this.updateQualityAssessment();
  }
  
  // Start bandwidth estimation
  startBandwidthEstimation() {
    // This would typically involve sending test packets
    // For now, we'll use a simple estimation based on RTT and packet loss
    this.estimateBandwidth();
  }
  
  // Estimate available bandwidth
  estimateBandwidth() {
    const baseBandwidth = 1000000; // 1 Mbps base
    const rttFactor = Math.max(0.1, Math.min(1, 100 / Math.max(this.networkState.rtt, 10)));
    const lossFactor = Math.max(0.1, Math.min(1, 1 - (this.networkState.packetLoss / 10)));
    const stabilityFactor = this.networkState.stability;
    
    const estimatedBandwidth = baseBandwidth * rttFactor * lossFactor * stabilityFactor;
    
    this.statistics.bandwidthHistory.push(estimatedBandwidth);
    
    // Keep only recent history
    if (this.statistics.bandwidthHistory.length > this.options.sampleWindow) {
      this.statistics.bandwidthHistory.shift();
    }
    
    // Calculate average bandwidth
    const avgBandwidth = this.statistics.bandwidthHistory.reduce((a, b) => a + b, 0) / this.statistics.bandwidthHistory.length;
    
    this.networkState.bandwidth = Math.round(avgBandwidth);
    this.networkState.lastUpdate = Date.now();
    
    this.log('debug', 'Bandwidth estimated', {
      bandwidth: this.networkState.bandwidth,
      rttFactor: rttFactor,
      lossFactor: lossFactor,
      stabilityFactor: stabilityFactor
    });
  }
  
  // Update quality assessment
  updateQualityAssessment() {
    const { rtt, packetLoss, stability } = this.networkState;
    
    // Determine quality based on RTT
    let rttQuality = 'poor';
    if (rtt < this.options.rttThresholds.excellent) {
      rttQuality = 'excellent';
    } else if (rtt < this.options.rttThresholds.good) {
      rttQuality = 'good';
    } else if (rtt < this.options.rttThresholds.fair) {
      rttQuality = 'fair';
    }
    
    // Determine quality based on packet loss
    let lossQuality = 'poor';
    if (packetLoss < this.options.packetLossThresholds.excellent) {
      lossQuality = 'excellent';
    } else if (packetLoss < this.options.packetLossThresholds.good) {
      lossQuality = 'good';
    } else if (packetLoss < this.options.packetLossThresholds.fair) {
      lossQuality = 'fair';
    }
    
    // Combined quality assessment (worst of both)
    const qualities = ['excellent', 'good', 'fair', 'poor'];
    const rttIndex = qualities.indexOf(rttQuality);
    const lossIndex = qualities.indexOf(lossQuality);
    const combinedIndex = Math.max(rttIndex, lossIndex);
    const newQuality = qualities[combinedIndex];
    
    const oldQuality = this.networkState.quality;
    this.networkState.quality = newQuality;
    
    this.log('info', 'Quality assessment updated', {
      quality: newQuality,
      rttQuality: rttQuality,
      lossQuality: lossQuality,
      rtt: rtt,
      packetLoss: packetLoss,
      stability: stability
    });
    
    // Trigger quality change callback
    if (newQuality !== oldQuality) {
      this.handleQualityChange(newQuality, oldQuality);
    }
    
    // Store quality history
    this.statistics.qualityHistory.push({
      timestamp: Date.now(),
      quality: newQuality,
      rtt: rtt,
      packetLoss: packetLoss,
      stability: stability
    });
    
    // Keep only recent history
    if (this.statistics.qualityHistory.length > this.options.sampleWindow) {
      this.statistics.qualityHistory.shift();
    }
  }
  
  // Handle network condition changes
  handleNetworkChange() {
    this.log('info', 'Network conditions changed', this.networkState);
    
    // Trigger callback
    if (this.callbacks.onNetworkChange) {
      this.callbacks.onNetworkChange(this.networkState);
    }
    
    // Update bandwidth estimation
    if (this.options.bandwidthEstimation) {
      this.estimateBandwidth();
    }
    
    // Trigger adaptive streaming if enabled
    if (this.options.adaptiveQuality) {
      this.triggerAdaptiveStreaming();
    }
  }
  
  // Handle quality changes
  handleQualityChange(newQuality, oldQuality) {
    this.log('info', 'Network quality changed', { old: oldQuality, new: newQuality });
    
    // Trigger callback
    if (this.callbacks.onQualityChange) {
      this.callbacks.onQualityChange(newQuality, oldQuality);
    }
    
    // Trigger adaptive streaming
    if (this.options.adaptiveQuality) {
      this.adaptToQuality(newQuality);
    }
  }
  
  // Trigger adaptive streaming based on network conditions
  triggerAdaptiveStreaming() {
    const now = Date.now();
    const timeSinceLastAdaptation = now - this.streamingState.lastAdaptation;
    
    // Prevent too frequent adaptations (minimum 5 seconds)
    if (timeSinceLastAdaptation < 5000) {
      return;
    }
    
    const currentQuality = this.streamingState.currentQuality;
    const networkQuality = this.networkState.quality;
    
    // Determine target quality based on network conditions
    let targetQuality = currentQuality;
    
    if (networkQuality === 'excellent' && currentQuality !== 'ultra') {
      targetQuality = 'ultra';
    } else if (networkQuality === 'good' && ['medium', 'low'].includes(currentQuality)) {
      targetQuality = 'high';
    } else if (networkQuality === 'fair' && ['ultra', 'high'].includes(currentQuality)) {
      targetQuality = 'medium';
    } else if (networkQuality === 'poor' && currentQuality !== 'low') {
      targetQuality = 'low';
    }
    
    // Apply quality change
    if (targetQuality !== currentQuality) {
      this.streamingState.targetQuality = targetQuality;
      this.adaptToQuality(targetQuality);
    }
  }
  
  // Adapt streaming quality
  adaptToQuality(quality) {
    const oldQuality = this.streamingState.currentQuality;
    this.streamingState.currentQuality = quality;
    this.streamingState.lastAdaptation = Date.now();
    this.streamingState.adaptationCount++;
    
    this.log('info', 'Adapting streaming quality', {
      old: oldQuality,
      new: quality,
      networkQuality: this.networkState.quality,
      adaptationCount: this.streamingState.adaptationCount
    });
    
    // Store quality history
    this.streamingState.qualityHistory.push({
      timestamp: Date.now(),
      oldQuality: oldQuality,
      newQuality: quality,
      networkQuality: this.networkState.quality
    });
    
    // Trigger adaptation callback
    if (this.callbacks.onAdaptation) {
      this.callbacks.onAdaptation(quality, oldQuality, this.networkState);
    }
  }
  
  // Set WebSocket connection
  setWebSocket(webSocket) {
    this.webSocket = webSocket;
    
    // Set up message handlers
    webSocket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong') {
          this.handlePong(data);
        }
      } catch (error) {
        // Not a JSON message, ignore
      }
    });
    
    this.log('info', 'WebSocket connection set for network monitoring');
  }
  
  // Get current network state
  getNetworkState() {
    return { ...this.networkState };
  }
  
  // Get network statistics
  getStatistics() {
    return {
      ...this.statistics,
      monitoringDuration: Date.now() - this.statistics.startTime,
      currentQuality: this.networkState.quality,
      qualityDistribution: this.getQualityDistribution(),
      averageRTT: this.getAverageRTT(),
      averagePacketLoss: this.getAveragePacketLoss()
    };
  }
  
  // Get quality distribution
  getQualityDistribution() {
    const distribution = { excellent: 0, good: 0, fair: 0, poor: 0 };
    this.statistics.qualityHistory.forEach(entry => {
      distribution[entry.quality] = (distribution[entry.quality] || 0) + 1;
    });
    
    const total = this.statistics.qualityHistory.length;
    if (total === 0) return distribution;
    
    // Convert to percentages
    Object.keys(distribution).forEach(quality => {
      distribution[quality] = Math.round((distribution[quality] / total) * 100);
    });
    
    return distribution;
  }
  
  // Get average RTT
  getAverageRTT() {
    if (this.statistics.rttHistory.length === 0) return 0;
    return Math.round(this.statistics.rttHistory.reduce((a, b) => a + b, 0) / this.statistics.rttHistory.length);
  }
  
  // Get average packet loss
  getAveragePacketLoss() {
    if (this.statistics.packetLossHistory.length === 0) return 0;
    const avg = this.statistics.packetLossHistory.reduce((a, b) => a + b, 0) / this.statistics.packetLossHistory.length;
    return Math.round(avg * 100) / 100; // Round to 2 decimal places
  }
  
  // Get streaming quality history
  getStreamingQualityHistory() {
    return [...this.streamingState.qualityHistory];
  }
  
  // Get recommendations for current network conditions
  getRecommendations() {
    const recommendations = [];
    const { rtt, packetLoss, quality, stability } = this.networkState;
    
    if (quality === 'poor') {
      recommendations.push({
        type: 'quality',
        priority: 'high',
        message: 'Network quality is poor. Consider reducing audio quality or switching to a more stable connection.'
      });
    }
    
    if (rtt > 200) {
      recommendations.push({
        type: 'latency',
        priority: 'medium',
        message: 'High latency detected. Audio responses may be delayed.'
      });
    }
    
    if (packetLoss > 3) {
      recommendations.push({
        type: 'packet_loss',
        priority: 'high',
        message: 'Significant packet loss detected. Audio quality may be degraded.'
      });
    }
    
    if (stability < 0.7) {
      recommendations.push({
        type: 'stability',
        priority: 'medium',
        message: 'Network stability is low. Connection may be intermittent.'
      });
    }
    
    return recommendations;
  }
  
  // Destroy manager
  destroy() {
    this.stopMonitoring();
    this.callbacks = {};
    this.webSocket = null;
    
    this.log('info', 'NetworkAdaptiveManager destroyed');
  }
}

// Export for use in other modules
export default NetworkAdaptiveManager;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NetworkAdaptiveManager;
} else if (typeof window !== 'undefined') {
  window.NetworkAdaptiveManager = NetworkAdaptiveManager;
}