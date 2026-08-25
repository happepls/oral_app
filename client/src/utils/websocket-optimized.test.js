import OptimizedWebSocket from './websocket-optimized';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.send = jest.fn();
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  close(code = 1000, reason = '') {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }
}

describe('OptimizedWebSocket timer ownership', () => {
  const RealWebSocket = global.WebSocket;

  beforeEach(() => {
    jest.useFakeTimers();
    FakeWebSocket.instances = [];
    global.WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.WebSocket = RealWebSocket;
  });

  test('owns one heartbeat and clears every timer when destroyed', async () => {
    const socket = new OptimizedWebSocket('ws://example.test', {
      heartbeatInterval: 1000,
      connectionTimeout: 5000,
      enableLogging: false,
    });
    const connected = socket.connect();
    FakeWebSocket.instances[0].open();
    await connected;

    const firstHeartbeat = socket.heartbeatInterval;
    socket._startHeartbeat();
    expect(socket.heartbeatInterval).not.toBe(firstHeartbeat);

    jest.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances[0].send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(FakeWebSocket.instances[0].send.mock.calls[0][0]).type).toBe('ping');

    socket.destroy();
    expect(socket.heartbeatInterval).toBeNull();
    expect(socket.pingTimeout).toBeNull();
    expect(socket.connectionTimeoutTimer).toBeNull();
    expect(socket.reconnectTimer).toBeNull();
  });
});
