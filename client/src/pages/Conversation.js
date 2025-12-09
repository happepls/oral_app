import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { aiAPI, conversationAPI } from '../services/api';
import RealTimeRecorder from '../components/RealTimeRecorder';
import { useAuth } from '../contexts/AuthContext'; // Import useAuth to get userId

function Conversation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth(); // Get user from AuthContext
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
      speaker: 'AI助手',
      content: 'Hello! I\'m here to help you practice your English. What would you like to talk about today?',
      timestamp: new Date()
    }
  ]);
  const [liveTranscription, setLiveTranscription] = useState('');
  const [webSocketError, setWebSocketError] = useState(null);
  const [sessionId, setSessionId] = useState(null); // New state for sessionId

  const messagesEndRef = useRef(null);
  const textInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, liveTranscription]);

  // Effect to start a conversation session on component mount
  useEffect(() => {
    const startNewSession = async () => {
      if (!user || !user.id) {
        setWebSocketError('用户未登录，无法开始会话');
        return;
      }
      try {
        const response = await conversationAPI.startSession({ userId: user.id }); // Pass userId
        if (response.success) {
          setSessionId(response.data.sessionId);
          setWebSocketError(null); // Clear any previous errors
        } else {
          setWebSocketError(response.message || '无法启动会话');
        }
      } catch (error) {
        console.error('Error starting conversation session:', error);
        setWebSocketError('会话服务连接失败');
      }
    };

    startNewSession();

  }, [user]); // Re-run if user changes
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

    try {
      const chatMessages = messages
        .filter(m => m.type === 'user' || m.type === 'ai')
        .map(m => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          content: m.content
        }));

      chatMessages.push({
        role: 'user',
        content: content.trim()
      });

      const result = await aiAPI.chat(chatMessages, scenario?.title);

      if (result.success) {
        const aiMessage = {
          type: 'ai',
          speaker: 'AI助手',
          content: result.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        type: 'system',
        content: '抱歉，AI暂时无法响应，请稍后重试',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleTranscriptionUpdate = useCallback((text) => {
    setLiveTranscription(text);
    // When transcription is final, we can add it to messages
    // This logic needs to be refined based on how the ASR service sends final results.
    // For now, we'll just display it live.
  }, []);

  const handleAiResponse = useCallback((text) => {
    // Once we have a final transcription, we can clear the live one
    // and add the user's message to the chat history.
    if (liveTranscription) {
       setMessages(prev => [...prev, {type: 'user', content: liveTranscription, timestamp: new Date()}]);
       setLiveTranscription('');
    }

    const aiMessage = {
      type: 'ai',
      speaker: 'AI助手',
      content: text,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, aiMessage]);
    setIsLoading(false);
  }, [liveTranscription]);
  
  const handleWebSocketError = useCallback((errorMessage) => {
    setWebSocketError(errorMessage);
  }, []);

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-background-light dark:bg-background-dark">
      {/* Top App Bar */}
      <header className="flex items-center p-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <button 
          onClick={() => navigate('/discovery')}
          className="p-2 -ml-2 text-gray-600 dark:text-gray-400">
          <span className="material-symbols-outlined">close</span>
        </button>
        <div className="flex flex-col items-center flex-1">
          <h1 className="text-lg font-bold leading-tight tracking-tight text-gray-900 dark:text-white">点咖啡练习</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">与 Kai 对话，您的AI导师</p>
        </div>
        <div className="flex items-center gap-1 px-3 py-1 text-sm font-medium border border-gray-300 rounded-full dark:border-gray-700 dark:text-gray-300">
          <span>初级</span>
          <span className="material-symbols-outlined text-base">expand_more</span>
        </div>
      </header>

      {/* Chat/Transcript Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg, index) => {
          if (msg.type === 'system') {
            return (
              <div key={index} className="flex justify-center">
                <div className="px-3 py-1 text-xs text-gray-500 bg-gray-200 rounded-full dark:bg-gray-800 dark:text-gray-400">
                  {msg.content}
                </div>
              </div>
            );
          }
          
          if (msg.type === 'ai') {
            return (
              <div key={index} className="flex items-end gap-3">
                <div className="w-8 h-8 rounded-full shrink-0 bg-gradient-to-br from-blue-400 to-purple-500"></div>
                <div className="flex flex-col items-start flex-1 gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-600 dark:text-gray-400">{msg.speaker}</p>
                    <button className="text-gray-500 dark:text-gray-400">
                      <span className="material-symbols-outlined text-lg">volume_up</span>
                    </button>
                  </div>
                  <div className="flex max-w-xs p-3 rounded-lg rounded-bl-none bg-primary/20 dark:bg-gray-800">
                    <p className="text-base font-normal leading-normal text-gray-900 dark:text-gray-200">{msg.content}</p>
                  </div>
                </div>
              </div>
            );
          }

          if (msg.type === 'user') {
            return (
              <div key={index} className="flex items-end justify-end gap-3">
                <div className="flex flex-col items-end flex-1 gap-2">
                  <div className="flex max-w-xs p-3 rounded-lg rounded-br-none bg-primary text-white">
                    <p className="text-base font-normal leading-normal">{msg.content}</p>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full shrink-0 bg-gradient-to-br from-green-400 to-blue-500"></div>
              </div>
            );
          }

          return null;
        })}
        {liveTranscription && (
          <div className="flex items-end justify-end gap-3">
            <div className="flex flex-col items-end flex-1 gap-2">
              <div className="flex max-w-xs p-3 rounded-lg rounded-br-none bg-primary/70 text-white">
                <p className="text-base font-normal leading-normal italic">{liveTranscription}</p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full shrink-0 bg-gradient-to-br from-green-400 to-blue-500"></div>
          </div>
        )}
        {isLoading && (
          <div className="flex items-end gap-3">
            <div className="w-8 h-8 rounded-full shrink-0 bg-gradient-to-br from-blue-400 to-purple-500"></div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/20 dark:bg-gray-800">
              <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Bottom Bar */}
      <footer className="p-4 pt-2 shrink-0">
        {/* Text Input Area */}
        <div className="mb-3">
          <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg dark:bg-gray-800">
            <input
              ref={textInputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(inputText);
                }
              }}
              placeholder="输入文字消息..."
              disabled={isLoading}
              className="flex-1 bg-transparent outline-none text-gray-900 dark:text-white placeholder-gray-500 disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(inputText)}
              disabled={isLoading || !inputText.trim()}
              className="p-2 text-primary rounded-lg hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined">send</span>
            </button>
          </div>
        </div>

        {/* Feedback & Hints Toolbar */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <button 
            onClick={() => sendMessage("Can you give me a hint?")}
            disabled={isLoading}
            className="flex flex-col items-center gap-1.5 py-2 text-gray-600 rounded-lg dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
            <span className="material-symbols-outlined">help</span>
            <p className="text-xs font-medium">提示</p>
          </button>
          <button 
            onClick={() => sendMessage("Please correct my last message if there were any mistakes.")}
            disabled={isLoading}
            className="flex flex-col items-center gap-1.5 py-2 text-gray-600 rounded-lg dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
            <span className="material-symbols-outlined">task_alt</span>
            <p className="text-xs font-medium">纠正我</p>
          </button>
          <button 
            onClick={() => sendMessage("Please translate my last message to Chinese.")}
            disabled={isLoading}
            className="flex flex-col items-center gap-1.5 py-2 text-gray-600 rounded-lg dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
            <span className="material-symbols-outlined">translate</span>
            <p className="text-xs font-medium">翻译</p>
          </button>
        </div>

        {/* Microphone Control Button */}
        <RealTimeRecorder 
          onTranscriptionUpdate={handleTranscriptionUpdate}
          onAiResponse={handleAiResponse}
          onError={handleWebSocketError}
          sessionId={sessionId}
        />
        {webSocketError && <p className="mt-2 text-xs text-center text-red-500">{webSocketError}</p>}
      </footer>
    </div>
  );
}

export default Conversation;