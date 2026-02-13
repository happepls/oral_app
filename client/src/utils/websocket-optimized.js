// websocket-optimized.js - Optimized WebSocket connection with reconnection logic
class OptimizedWebSocket {
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      // Reconnection settings
      reconnectInterval: options.reconnectInterval || 1000,
      maxReconnectAttempts: options.maxReconnectAttempts || 5,
      reconnectBackoffMultiplier: options.reconnectBackoffMultiplier || 1.5,
      maxReconnectDelay: options.maxReconnectDelay || 30000,
      
      // Connection settings
      connectionTimeout: options.connectionTimeout || 10000,
      heartbeatInterval: options.heartbeatInterval || 30000,
      messageQueueSize: options.messageQueueSize || 100,
      
      // Performance settings
      binaryType: options.binaryType || 'arraybuffer',
      compression: options.compression !== false,
      
      // Logging
      enableLogging: options.enableLogging !== false,
      logLevel: options.logLevel || 'info'
    };
    
    // Connection state
    this.ws = null;
    this.readyState = WebSocket.CONNECTING;
    this.reconnectAttempts = 0;
    this.reconnectDelay = this.options.reconnectInterval;
    this.lastMessageTime = 0;
    this.connectionStartTime = 0;
    
    // Message queueing
    this.messageQueue = [];
    this.isProcessingQueue = false;
    
    // Heartbeat
    this.heartbeatInterval = null;
    this.lastPingTime = 0;
    this.pingTimeout = null;
    
    // Performance metrics
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      connectionTime: 0,
      reconnectionCount: 0,
      averageLatency: 0,
      messageQueueSize: 0
    };
    
    // Event handlers
    this.eventHandlers = {
      open: [],
      message: [],
      close: [],
      error: [],
      reconnect: [],
      ping: [],
      pong: []
    };
    
    // Connection promise
    this.connectionPromise = null;
    this.connectionResolve = null;
    this.connectionReject = null;
    
    this.log('info', 'OptimizedWebSocket initialized', { url: url });
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
        console.error(`[WebSocket] ${message}`, logData);
      } else if (level === 'warn') {
        console.warn(`[WebSocket] ${message}`, logData);
      } else {
        console.log(`[WebSocket] ${message}`, logData);
      }
    }
  }
  
  // Connect to WebSocket
  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    
    this.connectionPromise = new Promise((resolve, reject) => {
      this.connectionResolve = resolve;
      this.connectionReject = reject;
      
      this._connect();
    });
    
    return this.connectionPromise;
  }
  
  // Internal connection method
  _connect() {
    try {
      this.log('info', 'Connecting to WebSocket', { 
        url: this.url, 
        attempt: this.reconnectAttempts + 1 
      });
      
      this.readyState = WebSocket.CONNECTING;
      this.connectionStartTime = Date.now();
      
      // Create WebSocket connection
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = this.options.binaryType;
      
      // Set up event handlers
      this.ws.onopen = (event) => this._handleOpen(event);
      this.ws.onmessage = (event) => this._handleMessage(event);
      this.ws.onclose = (event) => this._handleClose(event);
      this.ws.onerror = (event) => this._handleError(event);
      
      // Set connection timeout
      this._setConnectionTimeout();
      
    } catch (error) {
      this.log('error', 'Failed to create WebSocket', error);
      this._handleConnectionFailure(error);
    }
  }
  
  // Handle connection open
  _handleOpen(event) {
    this.log('info', 'WebSocket connected');
    this.readyState = WebSocket.OPEN;
    this.reconnectAttempts = 0;
    this.reconnectDelay = this.options.reconnectInterval;
    this.lastMessageTime = Date.now();
    
    // Update metrics
    this.metrics.connectionTime = Date.now() - this.connectionStartTime;
    
    // Start heartbeat
    this._startHeartbeat();
    
    // Process queued messages
    this._processMessageQueue();
    
    // Resolve connection promise
    if (this.connectionResolve) {
      this.connectionResolve(this);
    }
    
    // Emit open event
    this._emit('open', event);
  }
  
  // Handle incoming message
  _handleMessage(event) {
    this.lastMessageTime = Date.now();
    this.metrics.messagesReceived++;
    
    if (event.data instanceof ArrayBuffer) {
      this.metrics.bytesReceived += event.data.byteLength;
    } else if (typeof event.data === 'string') {
      this.metrics.bytesReceived += event.data.length;
    } else if (event.data instanceof Blob) {
      // Handle blob data
      this._handleBlobMessage(event.data);
      return;
    }
    
    // Handle ping/pong messages
    if (this._handlePingPong(event.data)) {
      return;
    }
    
    // Emit message event
    this._emit('message', event);
  }
  
  // Handle blob messages
  async _handleBlobMessage(blob) {
    try {
      // Convert blob to appropriate format
      if (this.options.binaryType === 'arraybuffer') {
        const arrayBuffer = await blob.arrayBuffer();
        this.metrics.bytesReceived += arrayBuffer.byteLength;
        
        // Create synthetic message event
        const syntheticEvent = {
          data: arrayBuffer,
          origin: this.url,
          timeStamp: Date.now()
        };
        
        this._emit('message', syntheticEvent);
      } else {
        const text = await blob.text();
        this.metrics.bytesReceived += text.length;
        
        const syntheticEvent = {
          data: text,
          origin: this.url,
          timeStamp: Date.now()
        };
        
        this._emit('message', syntheticEvent);
      }
    } catch (error) {
      this.log('error', 'Failed to handle blob message', error);
    }
  }
  
  // Handle ping/pong messages
  _handlePingPong(data) {
    try {
      if (typeof data === 'string') {
        const message = JSON.parse(data);
        
        if (message.type === 'ping') {
          this._handlePing(message);
          return true;
        } else if (message.type === 'pong') {
          this._handlePong(message);
          return true;
        }
      }
    } catch (error) {
      // Not a JSON message, continue normal processing
    }
    
    return false;
  }
  
  // Handle ping message
  _handlePing(message) {
    this.log('debug', 'Ping received', message);
    
    // Send pong response
    const pongMessage = {
      type: 'pong',
      timestamp: message.timestamp,
      sequence: message.sequence
    };
    
    this.send(JSON.stringify(pongMessage));
    this._emit('ping', message);
  }
  
  // Handle pong message
  _handlePong(message) {
    const now = Date.now();
    const latency = now - message.timestamp;
    
    this.log('debug', 'Pong received', { latency, sequence: message.sequence });
    
    // Update metrics
    this.metrics.averageLatency = this.metrics.averageLatency * 0.9 + latency * 0.1;
    
    // Clear ping timeout
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
    
    this._emit('pong', { latency, sequence: message.sequence });
  }
  
  // Handle connection close
  _handleClose(event) {
    this.log('info', 'WebSocket closed', { 
      code: event.code, 
      reason: event.reason,
      wasClean: event.wasClean 
    });
    
    this.readyState = WebSocket.CLOSED;
    this._stopHeartbeat();
    
    // Emit close event
    this._emit('close', event);
    
    // Attempt reconnection if not a clean close
    if (!event.wasClean && this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this._scheduleReconnect();
    } else if (this.connectionReject) {
      this.connectionReject(new Error('WebSocket connection failed'));
    }
  }
  
  // Handle connection error
  _handleError(event) {
    this.log('error', 'WebSocket error', event);
    this._emit('error', event);
    
    // Handle connection failure
    if (this.readyState === WebSocket.CONNECTING) {
      this._handleConnectionFailure(event);
    }
  }
  
  // Handle connection failure
  _handleConnectionFailure(error) {
    this.log('error', 'Connection failed', error);
    
    if (this.connectionReject) {
      this.connectionReject(error);
    }
    
    // Attempt reconnection
    if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this._scheduleReconnect();
    }
  }
  
  // Schedule reconnection
  _scheduleReconnect() {
    this.reconnectAttempts++;
    this.metrics.reconnectionCount++;
    
    this.log('info', 'Scheduling reconnection', {
      attempt: this.reconnectAttempts,
      delay: this.reconnectDelay
    });
    
    setTimeout(() => {
      this.log('info', 'Attempting reconnection', { attempt: this.reconnectAttempts });
      this._emit('reconnect', { attempt: this.reconnectAttempts });
      this._connect();
    }, this.reconnectDelay);
    
    // Exponential backoff
    this.reconnectDelay = Math.min(
      this.reconnectDelay * this.options.reconnectBackoffMultiplier,
      this.options.maxReconnectDelay
    );
  }
  
  // Set connection timeout
  _setConnectionTimeout() {
    setTimeout(() => {
      if (this.readyState === WebSocket.CONNECTING) {
        this.log('error', 'Connection timeout');
        this._handleConnectionFailure(new Error('Connection timeout'));
      }
    }, this.options.connectionTimeout);
  }
  
  // Start heartbeat
  _startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(() => {
      this._sendHeartbeat();
    }, this.options.heartbeatInterval);
  }
  
  // Stop heartbeat
  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
  }
  
  // Send heartbeat
  _sendHeartbeat() {
    if (this.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const now = Date.now();
    
    // Check if connection is stale
    const timeSinceLastMessage = now - this.lastMessageTime;
    if (timeSinceLastMessage > this.options.heartbeatInterval * 3) {
      this.log('warn', 'Connection appears stale, closing', { 
        timeSinceLastMessage,
        heartbeatInterval: this.options.heartbeatInterval 
      });
      this.close();
      return;
    }
    
    // Send ping
    this.lastPingTime = now;
    const pingMessage = {
      type: 'ping',
      timestamp: now,
      sequence: this.metrics.messagesSent
    };
    
    this.send(JSON.stringify(pingMessage));
    
    // Set ping timeout
    this.pingTimeout = setTimeout(() => {
      this.log('warn', 'Ping timeout, closing connection');
      this.close();
    }, 5000);
  }
  
  // Send message
  send(data) {
    if (this.readyState !== WebSocket.OPEN) {
      this.log('warn', 'WebSocket not open, queuing message');
      this._queueMessage(data);
      return false;
    }
    
    try {
      this.ws.send(data);
      this.metrics.messagesSent++;
      
      if (data instanceof ArrayBuffer) {
        this.metrics.bytesSent += data.byteLength;
      } else if (typeof data === 'string') {
        this.metrics.bytesSent += data.length;
      }
      
      return true;
    } catch (error) {
      this.log('error', 'Failed to send message', error);
      this._queueMessage(data);
      return false;
    }
  }
  
  // Queue message for later sending
  _queueMessage(data) {
    if (this.messageQueue.length >= this.options.messageQueueSize) {
      this.log('warn', 'Message queue full, dropping oldest message');
      this.messageQueue.shift();
    }
    
    this.messageQueue.push(data);
    this.metrics.messageQueueSize = this.messageQueue.length;
  }
  
  // Process queued messages
  async _processMessageQueue() {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.messageQueue.length > 0 && this.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      
      if (!this.send(message)) {
        // Put message back if send failed
        this.messageQueue.unshift(message);
        break;
      }
      
      // Small delay to prevent overwhelming the connection
      await this._delay(10);
    }
    
    this.isProcessingQueue = false;
    this.metrics.messageQueueSize = this.messageQueue.length;
  }
  
  // Add event listener
  addEventListener(event, handler) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].push(handler);
    }
  }
  
  // Remove event listener
  removeEventListener(event, handler) {
    if (this.eventHandlers[event]) {
      const index = this.eventHandlers[event].indexOf(handler);
      if (index !== -1) {
        this.eventHandlers[event].splice(index, 1);
      }
    }
  }
  
  // Emit event
  _emit(event, data) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          this.log('error', 'Event handler error', error);
        }
      });
    }
  }
  
  // Close connection
  close(code = 1000, reason = '') {
    this.log('info', 'Closing WebSocket', { code, reason });
    
    this._stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(code, reason);
    }
    
    this.readyState = WebSocket.CLOSED;
  }
  
  // Utility delay function
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Get connection state
  getReadyState() {
    return this.readyState;
  }
  
  // Get performance metrics
  getMetrics() {
    return {
      ...this.metrics,
      readyState: this.readyState,
      reconnectAttempts: this.reconnectAttempts,
      uptime: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0
    };
  }
  
  // Get connection statistics
  getStatistics() {
    const now = Date.now();
    const uptime = this.connectionStartTime ? now - this.connectionStartTime : 0;
    
    return {
      connection: {
        url: this.url,
        readyState: this.readyState,
        uptime: uptime,
        reconnectAttempts: this.reconnectAttempts,
        lastMessageTime: this.lastMessageTime
      },
      traffic: {
        messagesSent: this.metrics.messagesSent,
        messagesReceived: this.metrics.messagesReceived,
        bytesSent: this.metrics.bytesSent,
        bytesReceived: this.metrics.bytesReceived
      },
      performance: {
        averageLatency: this.metrics.averageLatency,
        messageQueueSize: this.metrics.messageQueueSize
      }
    };
  }
  
  // Destroy connection
  destroy() {
    this.log('info', 'Destroying WebSocket connection');
    
    this.close();
    this.eventHandlers = {};
    this.messageQueue = [];
    this.connectionPromise = null;
    this.connectionResolve = null;
    this.connectionReject = null;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OptimizedWebSocket;
} else if (typeof window !== 'undefined') {
  window.OptimizedWebSocket = OptimizedWebSocket;
}