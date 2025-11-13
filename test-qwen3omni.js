const WebSocket = require('ws');

// Connect to the Qwen3-Omni service
const ws = new WebSocket('ws://localhost:8082');

ws.on('open', function open() {
    console.log('Connected to Qwen3-Omni service');
    
    // Send a mock audio data packet (16-bit PCM, 16kHz, mono)
    // In a real scenario, this would be actual audio data
    const mockAudioData = new Float32Array(16000); // 1 second of silence
    for (let i = 0; i < mockAudioData.length; i++) {
        mockAudioData[i] = Math.sin(2 * Math.PI * 440 * i / 16000); // 440Hz sine wave
    }
    
    // Convert Float32Array to ArrayBuffer
    const buffer = new ArrayBuffer(mockAudioData.length * 4);
    const view = new DataView(buffer);
    for (let i = 0; i < mockAudioData.length; i++) {
        view.setFloat32(i * 4, mockAudioData[i], true);
    }
    
    console.log('Sending mock audio data...');
    ws.send(buffer);
});

ws.on('message', function incoming(data) {
    console.log('Received:', data.toString());
});

ws.on('close', function close() {
    console.log('Disconnected from Qwen3-Omni service');
});

ws.on('error', function error(err) {
    console.error('WebSocket error:', err);
});