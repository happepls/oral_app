import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { conversationAPI } from '../services/api';
import RealTimeRecorder from '../components/RealTimeRecorder';
import { useAuth } from '../contexts/AuthContext';

function Conversation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [scenario, setScenario] = useState(location.state?.scenario || null);
  const [messages, setMessages] = useState([
    {
      type: 'system',
      content: '开始你的口语练习吧！'
    },
    {
      type: 'ai',
      speaker: 'AI口语导师',
      content: 'Hello! I\'m here to help you practice your English. What would you like to talk about today?',
      timestamp: new Date()
    }
  ]);
  const [liveTranscription, setLiveTranscription] = useState('');
  const [webSocketError, setWebSocketError] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textInputRef = useRef(null);
  const audioContextRef = useRef(null);
  const nextStartTimeRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, liveTranscription]);

  // Audio Playback Logic
  const playAudioChunk = useCallback(async (audioData) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    try {
      const arrayBuffer = await audioData.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      const start = Math.max(currentTime, nextStartTimeRef.current);
      
      source.start(start);
      nextStartTimeRef.current = start + audioBuffer.duration;
      
    } catch (error) {
      console.error('Error decoding/playing audio chunk:', error);
    }
  }, []);

  // WebSocket Connection Logic
  const connectWebSocket = useCallback(() => {
    if (!token || !sessionId) return;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // Updated URL to /api/ws/ as per Nginx config
    const wsUrl = `${protocol}//${host}/api/ws/?token=${token}&sessionId=${sessionId}`;
    
    console.log(`Connecting to WebSocket: ${wsUrl}`);
    
    socketRef.current = new WebSocket(wsUrl);

    socketRef.current.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setWebSocketError(null);
      nextStartTimeRef.current = 0;
    };

    socketRef.current.onmessage = (event) => {
      if (event.data instanceof Blob) {
        playAudioChunk(event.data);
      } else {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ai_response' || data.type === 'text_response') {
            const content = data.text || data.payload; // Handle both formats
            if (content) {
                setMessages(prev => [...prev, {
                    type: 'ai',
                    speaker: 'AI口语导师',
                    content: content,
                    timestamp: new Date()
                }]);
                setIsLoading(false);
            }
          } else if (data.type === 'transcription') {
            setLiveTranscription(data.text);
          } else if (data.type === 'info') {
             console.log('System info:', data.message);
          } else if (data.type === 'error') {
             console.error('Server error:', data.payload);
             setWebSocketError(data.payload);
          }
        } catch (error) {
          console.error('Message parse error:', error);
        }
      }
    };

    socketRef.current.onerror = (err) => {
      console.error('WebSocket error:', err);
      setWebSocketError('连接断开，请刷新重试');
      setIsConnected(false);
    };

    socketRef.current.onclose = () => {
      console.log('WebSocket closed');
      setIsConnected(false);
    };

  }, [token, sessionId, playAudioChunk]);

  // Initialize Session & Connection
  useEffect(() => {
    const initSession = async () => {
      if (!user?.id) return;
      try {
        const res = await conversationAPI.startSession({ userId: user.id });
        if (res.success) {
          setSessionId(res.data.sessionId);
        } else {
          setWebSocketError(res.message);
        }
      } catch (e) {
        setWebSocketError('无法启动会话');
      }
    };
    initSession();
  }, [user]);

  useEffect(() => {
    if (sessionId) {
      connectWebSocket();
    }
    return () => {
      socketRef.current?.close();
    };
  }, [sessionId, connectWebSocket]);

  const sendMessage = async (content) => {
    if (!content.trim()) return;

    const userMessage = {
      type: 'user',
      content: content.trim(),
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'text_message',
        payload: { text: content.trim() }
      }));
    } else {
      setWebSocketError('连接未就绪');
      setIsLoading(false);
    }
  };

  const handleAudioData = useCallback((audioBuffer) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(audioBuffer);
    }
  }, []);

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-background-light dark:bg-background-dark">
      {/* Header */}
      <header className="flex items-center p-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <button 
          onClick={() => navigate('/discovery')}
          className="p-2 -ml-2 text-gray-600 dark:text-gray-400">
          <span className="material-symbols-outlined">close</span>
        </button>
        <div className="flex flex-col items-center flex-1">
          <h1 className="text-lg font-bold leading-tight tracking-tight text-gray-900 dark:text-white">点咖啡练习</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isConnected ? '与 Kai 对话中' : '连接中...'}
          </p>
        </div>
        <div className="flex items-center gap-1 px-3 py-1 text-sm font-medium border border-gray-300 rounded-full dark:border-gray-700 dark:text-gray-300">
          <span>初级</span>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg, index) => {
          if (msg.type === 'system') return <div key={index} className="flex justify-center"><span className="text-xs text-gray-500 bg-gray-200 rounded-full px-2 py-1">{msg.content}</span></div>;
          
          const isAI = msg.type === 'ai';
          return (
            <div key={index} className={`flex items-end gap-3 ${isAI ? '' : 'justify-end'}`}>
              {isAI && <div className="w-8 h-8 rounded-full bg-blue-500 shrink-0"></div>}
              <div className={`flex flex-col max-w-xs p-3 rounded-lg ${isAI ? 'bg-gray-100 rounded-bl-none' : 'bg-primary text-white rounded-br-none'}`}>
                 <p>{msg.content}</p>
              </div>
              {!isAI && <div className="w-8 h-8 rounded-full bg-green-500 shrink-0"></div>}
            </div>
          );
        })}
        {isLoading && <div className="text-center text-gray-400 text-sm">AI正在思考...</div>}
        <div ref={messagesEndRef} />
      </main>

      {/* Footer */}
      <footer className="p-4 pt-2 shrink-0">
        <div className="flex items-center gap-2 mb-3 bg-gray-100 p-2 rounded-lg">
            <input
              ref={textInputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage(inputText)}
              placeholder={isConnected ? "输入文字..." : "连接中..."}
              disabled={!isConnected || isLoading}
              className="flex-1 bg-transparent outline-none"
            />
            <button onClick={() => sendMessage(inputText)} disabled={!isConnected || isLoading}>
              <span className="material-symbols-outlined text-primary">send</span>
            </button>
        </div>

        <RealTimeRecorder 
          onAudioData={handleAudioData}
          isConnected={isConnected}
        />
        {webSocketError && <p className="text-xs text-red-500 text-center mt-2">{webSocketError}</p>}
      </footer>
    </div>
  );
}

export default Conversation;