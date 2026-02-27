#!/usr/bin/env node

/**
 * WebSocket Connection Diagnostic Tool
 * Tests the entire WebSocket connection chain: Client -> Comms Service -> AI Service
 */

const WebSocket = require('ws');
const http = require('http');

// Configuration
const COMMS_SERVICE_URL = 'ws://localhost:8080/api/ws/';
const AI_SERVICE_HEALTH_URL = 'http://localhost:8082/health';
const COMMS_SERVICE_HEALTH_URL = 'http://localhost:3001/health';

// Test configuration
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjFjYWIxYWVjLTA1YjEtNGVlZS04ODcxLTRmZGUwODdmYzZkZCIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3NzIxMTQyMjgsImV4cCI6MTc3MjIwMDYyOCwiYXVkIjoib3JhbC1hcHAtdXNlcnMiLCJpc3MiOiJvcmFsLWFwcCJ9.ZOgLiN7q5A0onB-z9JfDmqnywCAhNhlRNRIj67uxxhE';
const TEST_SESSION_ID = 'diagnostic-session-' + Date.now();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = data ? `[${timestamp}] [${level}] ${message}:` : `[${timestamp}] [${level}] ${message}`;
  
  switch (level) {
    case 'ERROR':
      console.log(colors.red + prefix + colors.reset);
      break;
    case 'SUCCESS':
      console.log(colors.green + prefix + colors.reset);
      break;
    case 'WARN':
      console.log(colors.yellow + prefix + colors.reset);
      break;
    case 'INFO':
      console.log(colors.blue + prefix + colors.reset);
      break;
    default:
      console.log(prefix);
  }
  
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Health check functions
async function checkHealth(url, serviceName) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          log('SUCCESS', `${serviceName} health check passed`);
          resolve(true);
        } else {
          log('ERROR', `${serviceName} health check failed`, { status: res.statusCode, response: data });
          resolve(false);
        }
      });
    }).on('error', (err) => {
      log('ERROR', `${serviceName} health check failed`, { error: err.message });
      resolve(false);
    });
  });
}

// WebSocket connection test
function testWebSocketConnection() {
  return new Promise((resolve) => {
    log('INFO', 'Starting WebSocket connection test...');
    
    const wsUrl = `${COMMS_SERVICE_URL}?token=${TEST_TOKEN}&sessionId=${TEST_SESSION_ID}&voice=Serena`;
    log('INFO', `Connecting to: ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl);
    const startTime = Date.now();
    let connectionEstablished = false;
    let messagesReceived = [];
    
    ws.on('open', () => {
      connectionEstablished = true;
      const connectTime = Date.now() - startTime;
      log('SUCCESS', `WebSocket connected successfully in ${connectTime}ms`);
      
      // Send session start message
      ws.send(JSON.stringify({
        type: 'session_start',
        userId: 'test-user',
        sessionId: TEST_SESSION_ID
      }));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messagesReceived.push(message);
        log('INFO', 'Received message', message);
        
        // Check for connection established message
        if (message.type === 'connection_established') {
          log('SUCCESS', 'AI service connection established successfully');
        }
        
        // Auto-close after receiving a few messages or timeout
        if (messagesReceived.length >= 3) {
          log('INFO', 'Received enough messages, closing connection');
          ws.close(1000, 'Test completed');
        }
      } catch (err) {
        log('WARN', 'Received non-JSON message', data.toString());
      }
    });
    
    ws.on('error', (error) => {
      log('ERROR', 'WebSocket error', { error: error.message });
      resolve({ success: false, error: error.message, messagesReceived });
    });
    
    ws.on('close', (code, reason) => {
      const duration = Date.now() - startTime;
      log('INFO', `WebSocket closed. Code: ${code}, Reason: ${reason}, Duration: ${duration}ms`);
      
      resolve({
        success: connectionEstablished && messagesReceived.length > 0,
        connectionEstablished,
        messagesReceived: messagesReceived.length,
        closeCode: code,
        closeReason: reason,
        duration
      });
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        log('WARN', 'Test timeout reached, closing connection');
        ws.close(1000, 'Test timeout');
      }
    }, 30000);
  });
}

// Main diagnostic function
async function runDiagnostics() {
  log('INFO', '=== WebSocket Connection Diagnostic Tool ===');
  log('INFO', 'Testing connection chain: Client -> Comms Service -> AI Service');
  
  // Step 1: Health checks
  log('INFO', '\n--- Step 1: Health Checks ---');
  const aiServiceHealthy = await checkHealth(AI_SERVICE_HEALTH_URL, 'AI Service');
  const commsServiceHealthy = await checkHealth(COMMS_SERVICE_HEALTH_URL, 'Comms Service');
  
  if (!aiServiceHealthy || !commsServiceHealthy) {
    log('ERROR', 'Health checks failed, aborting WebSocket test');
    return;
  }
  
  // Step 2: WebSocket connection test
  log('INFO', '\n--- Step 2: WebSocket Connection Test ---');
  const wsResult = await testWebSocketConnection();
  
  // Step 3: Analysis
  log('INFO', '\n--- Step 3: Analysis ---');
  
  if (wsResult.success) {
    log('SUCCESS', 'WebSocket connection test PASSED');
    log('INFO', `Connection established: ${wsResult.connectionEstablished}`);
    log('INFO', `Messages received: ${wsResult.messagesReceived}`);
    log('INFO', `Test duration: ${wsResult.duration}ms`);
  } else {
    log('ERROR', 'WebSocket connection test FAILED');
    if (wsResult.error) {
      log('ERROR', `Error: ${wsResult.error}`);
    }
    log('WARN', `Connection established: ${wsResult.connectionEstablished}`);
    log('WARN', `Messages received: ${wsResult.messagesReceived}`);
    log('WARN', `Close code: ${wsResult.closeCode}`);
    log('WARN', `Close reason: ${wsResult.closeReason}`);
  }
  
  // Step 4: Recommendations
  log('INFO', '\n--- Step 4: Recommendations ---');
  
  if (!wsResult.connectionEstablished) {
    log('WARN', 'Connection not established. Check:');
    log('WARN', '1. Network connectivity between services');
    log('WARN', '2. Service configurations and environment variables');
    log('WARN', '3. Authentication token validity');
    log('WARN', '4. Service logs for detailed error messages');
  } else if (wsResult.messagesReceived === 0) {
    log('WARN', 'Connection established but no messages received. Check:');
    log('WARN', '1. AI service backend connectivity (DashScope API)');
    log('WARN', '2. Service-to-service communication');
    log('WARN', '3. Message routing and forwarding logic');
  } else if (wsResult.closeCode !== 1000) {
    log('WARN', 'Connection closed unexpectedly. Check:');
    log('WARN', '1. Connection timeout settings');
    log('WARN', '2. Heartbeat/keepalive mechanisms');
    log('WARN', '3. Service stability and resource usage');
  } else {
    log('SUCCESS', 'All checks passed! WebSocket connection is working correctly.');
  }
  
  log('INFO', '\n=== Diagnostic Complete ===');
}

// Run diagnostics
runDiagnostics().catch(err => {
  log('ERROR', 'Diagnostic tool error', { error: err.message });
  process.exit(1);
});