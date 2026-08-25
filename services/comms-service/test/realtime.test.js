const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const jwt = require('jsonwebtoken');
const { WebSocket, WebSocketServer } = require('ws');

const secret = 'comms-realtime-test-secret';

function once(emitter, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    emitter.once(event, (...args) => { clearTimeout(timer); resolve(args); });
    emitter.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startComms(aiUrl) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.resolve(__dirname, '../src/index.js')], {
    env: { ...process.env, PORT: String(port), JWT_SECRET: secret, AI_SERVICE_WS_URL: aiUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Comms did not start: ${output}`)), 5000);
    const read = (chunk) => {
      output += chunk.toString();
      if (output.includes('HTTP and WebSocket server listening')) { clearTimeout(timer); resolve(); }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.once('exit', (code) => reject(new Error(`Comms exited early (${code}): ${output}`)));
  });
  await ready;
  return { port, child, stop: () => { child.kill('SIGTERM'); } };
}

function ticket(type = 'realtime_ticket') {
  return jwt.sign({ id: 'quality-user', type }, secret, { algorithm: 'HS256', expiresIn: '60s' });
}

test('realtime ticket handshake, event forwarding, binary audio, invalid mode, and reconnect', async () => {
  const aiHttp = http.createServer();
  const aiWss = new WebSocketServer({ server: aiHttp });
  aiHttp.listen(0, '127.0.0.1');
  await once(aiHttp, 'listening');
  const aiConnections = [];
  const aiMessages = [];
  aiWss.on('connection', (socket, request) => {
    aiConnections.push({ socket, request });
    socket.on('message', (message) => aiMessages.push(JSON.parse(message.toString())));
    socket.send(JSON.stringify({ type: 'connection_established', payload: { sessionId: 'session-1' } }));
  });
  const comms = await startComms(`ws://127.0.0.1:${aiHttp.address().port}/stream`);
  try {
    const connect = () => new WebSocket(`ws://127.0.0.1:${comms.port}/api/v1/realtime?ticket=${encodeURIComponent(ticket())}&sessionId=session-1&mode=invalid&voice=Tina`);
    const client = connect();
    await once(client, 'open');
    const [event] = await once(client, 'message');
    assert.deepEqual(JSON.parse(event.toString()), { type: 'connection_established', payload: { sessionId: 'session-1' } });
    assert.equal(new URL(aiConnections[0].request.url, 'ws://localhost').searchParams.has('mode'), false);
    const forwardedToken = aiConnections[0].request.headers.authorization.slice('Bearer '.length);
    assert.notEqual(forwardedToken, ticket());
    assert.deepEqual(jwt.verify(forwardedToken, secret, {
      algorithms: ['HS256'],
      issuer: 'oral-app',
      audience: 'oral-app-users',
    }).type, 'access');
    client.send(JSON.stringify({ type: 'session_start', userId: 'attacker', token: 'leak-me' }));
    while (!aiMessages.length) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(aiMessages[0].userId, 'quality-user');
    assert.equal('token' in aiMessages[0], false);
    client.send(Buffer.from([1, 2, 3]));
    while (aiMessages.length < 2) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(aiMessages[1].type, 'audio_stream');
    assert.equal(aiMessages[1].payload.audio, Buffer.from([1, 2, 3]).toString('base64'));
    aiConnections[0].socket.send(JSON.stringify({ type: 'audio_response', payload: Buffer.from([4, 5]).toString('base64') }));
    const [audio, isBinary] = await once(client, 'message');
    assert.equal(isBinary, true);
    assert.deepEqual(Buffer.from(audio), Buffer.from([4, 5]));
    client.close();
    await once(client, 'close');

    const reconnected = connect();
    await once(reconnected, 'open');
    const [reconnectEvent] = await once(reconnected, 'message');
    assert.equal(JSON.parse(reconnectEvent.toString()).type, 'connection_established');
    reconnected.close();
  } finally {
    comms.stop();
    await new Promise((resolve) => aiWss.close(() => aiHttp.close(resolve)));
  }
});

test('realtime endpoint rejects a non-realtime token', async () => {
  const aiHttp = http.createServer();
  const aiWss = new WebSocketServer({ server: aiHttp });
  aiHttp.listen(0, '127.0.0.1');
  await once(aiHttp, 'listening');
  const comms = await startComms(`ws://127.0.0.1:${aiHttp.address().port}/stream`);
  try {
    const client = new WebSocket(`ws://127.0.0.1:${comms.port}/api/v1/realtime?ticket=${encodeURIComponent(ticket('access'))}&sessionId=session-2`);
    const [code] = await once(client, 'close');
    assert.equal(code, 1008);
  } finally {
    comms.stop();
    await new Promise((resolve) => aiWss.close(() => aiHttp.close(resolve)));
  }
});

test('new socket replaces the old user session and heartbeat gets one local pong', async () => {
  const aiHttp = http.createServer();
  const aiWss = new WebSocketServer({ server: aiHttp });
  aiHttp.listen(0, '127.0.0.1');
  await once(aiHttp, 'listening');
  const aiMessages = [];
  aiWss.on('connection', (socket) => {
    socket.on('message', (message) => aiMessages.push(JSON.parse(message.toString())));
    socket.send(JSON.stringify({ type: 'connection_established' }));
  });
  const comms = await startComms(`ws://127.0.0.1:${aiHttp.address().port}/stream`);
  try {
    const url = `ws://127.0.0.1:${comms.port}/api/v1/realtime?ticket=${encodeURIComponent(ticket())}&sessionId=single-session`;
    const first = new WebSocket(url);
    await once(first, 'open');
    await once(first, 'message');

    const firstClosed = once(first, 'close');
    const second = new WebSocket(url);
    await once(second, 'open');
    await once(second, 'message');
    const [closeCode] = await firstClosed;
    assert.equal(closeCode, 4001);

    const beforeHeartbeat = aiMessages.length;
    second.send(JSON.stringify({ type: 'ping', timestamp: 1234, sequence: 9 }));
    const [pong] = await once(second, 'message');
    assert.deepEqual(JSON.parse(pong.toString()), { type: 'pong', timestamp: 1234, sequence: 9 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(aiMessages.length, beforeHeartbeat);
    second.close();
  } finally {
    comms.stop();
    await new Promise((resolve) => aiWss.close(() => aiHttp.close(resolve)));
  }
});
