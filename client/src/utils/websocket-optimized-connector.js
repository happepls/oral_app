  // --- WebSocket Logic ---
  const connectWebSocket = useCallback(() => {
    if (!token || !sessionId) return;

    // Close existing if any
    if (socketRef.current) {
        socketRef.current.close();
    }

    // Initialize network adaptive manager
    if (!window.networkAdaptiveManager) {
      window.networkAdaptiveManager = new NetworkAdaptiveManager({
        enableLogging: true,
        onNetworkChange: (networkState) => {
          console.log('Network conditions changed:', networkState);
          // Update UI or streaming quality based on network conditions
        },
        onQualityChange: (newQuality, oldQuality) => {
          console.log('Network quality changed:', { old: oldQuality, new: newQuality });
          // Adapt streaming quality based on network quality
        }
      });
    }

    // Determine WebSocket URL based on environment
    let wsUrl;
    
    if (window.location.hostname === 'localhost' && (window.location.port === '5001' || window.location.port === '')) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const searchParams = new URLSearchParams(window.location.search);
      const scenario = searchParams.get('scenario');
      const topic = searchParams.get('topic');
      const voice = localStorage.getItem('ai_voice') || 'Serena';
      wsUrl = `${protocol}//localhost:8080/api/ws/?token=${token}&sessionId=${sessionId}${scenario ? `&scenario=${scenario}` : ''}${topic ? `&topic=${topic}` : ''}&voice=${voice}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/api/ws/?token=${token}&sessionId=${sessionId}&voice=${localStorage.getItem('ai_voice') || 'Serena'}`;
      
      const searchParams = new URLSearchParams(window.location.search);
      const scenario = searchParams.get('scenario');
      const topic = searchParams.get('topic');
      if (scenario) wsUrl += `&scenario=${scenario}`;
      if (topic) wsUrl += `&topic=${topic}`;
    }

    // Create optimized WebSocket connection
    socketRef.current = new OptimizedWebSocket(wsUrl, {
      reconnectInterval: 1000,
      maxReconnectAttempts: 5,
      connectionTimeout: 10000,
      heartbeatInterval: 30000,
      enableLogging: true,
      enableCompression: true
    });

    // Set up network adaptive manager with WebSocket
    if (window.networkAdaptiveManager) {
      window.networkAdaptiveManager.setWebSocket(socketRef.current);
    }

    socketRef.current.addEventListener('open', () => {
      console.log('WS Open (Optimized)');
      setIsConnected(true);
      
      // Only show connection success message if we don't have conversation history
      setMessages(prev => {
        const hasConversationHistory = prev.some(msg =>
          msg.type === 'user' ||
          (msg.type === 'ai' && !msg.content.includes('连接AI导师') && !msg.content.includes('新会话开始'))
        );

        if (!hasConversationHistory) {
          return [...prev, { type: 'system', content: '连接成功！请按住麦克风开始说话。' }];
        }
        return prev;
      });
      setWebSocketError(null);

      // Send session_start handshake
      const searchParams = new URLSearchParams(window.location.search);
      const payload = {
          type: 'session_start',
          userId: user.id,
          sessionId: sessionId,
          token: token,
          scenario: searchParams.get('scenario'),
          topic: searchParams.get('topic'),
          isRestoration: true,
          clientInfo: {
            optimized: true,
            version: '2.0',
            features: ['adaptive_streaming', 'compression', 'low_latency']
          }
      };
      socketRef.current.send(JSON.stringify(payload));
    });

    socketRef.current.addEventListener('message', async (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Handle binary audio data
        playAudioChunk(event.data);
      } else if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          handleJsonMessage(data);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      } else if (event.data instanceof Blob) {
        // Handle blob data
        try {
          const arrayBuffer = await event.data.arrayBuffer();
          playAudioChunk(arrayBuffer);
        } catch (e) {
          console.error('Failed to handle blob:', e);
        }
      }
    });

    socketRef.current.addEventListener('error', (error) => {
        console.error('WebSocket Error (Optimized):', error);
        setWebSocketError('连接异常');
        setIsConnected(false);
    });

    socketRef.current.addEventListener('close', async (event) => {
        console.log('WebSocket Closed (Optimized):', event.code, event.reason);
        setIsConnected(false);

        // Save conversation history when connection closes
        await saveConversationHistory();

        // Only show error if it wasn't a clean close
        if (event.code !== 1000) {
            setWebSocketError('连接已关闭');
        }
        
        // Stop network monitoring
        if (window.networkAdaptiveManager) {
          window.networkAdaptiveManager.stopMonitoring();
        }
    });

    socketRef.current.addEventListener('pong', (data) => {
      console.log('Pong received:', data);
      // Update network metrics
      if (window.networkAdaptiveManager) {
        window.networkAdaptiveManager.handlePong(data);
      }
    });

    socketRef.current.addEventListener('reconnect', (data) => {
      console.log('WebSocket reconnecting:', data);
      setWebSocketError('重新连接中...');
    });

    // Start network monitoring
    if (window.networkAdaptiveManager) {
      window.networkAdaptiveManager.startMonitoring();
    }

  }, [token, sessionId, playAudioChunk, handleJsonMessage, user]);