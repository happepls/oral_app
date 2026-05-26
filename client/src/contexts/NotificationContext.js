import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

const SSE_EVENT_TYPES = [
  'proficiency_update',
  'task_completed',
  'daily_qa_completed',
  'task_score_updated'
];

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const eventSourceRef = useRef(null);
  const listenersRef = useRef(new Map());

  const subscribe = useCallback((eventType, callback) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType).add(callback);
    return () => {
      listenersRef.current.get(eventType)?.delete(callback);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const es = new EventSource('/api/users/sse', { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener('connected', (e) => {
      console.log('[SSE] Connected:', JSON.parse(e.data));
    });

    SSE_EVENT_TYPES.forEach(eventType => {
      es.addEventListener(eventType, (e) => {
        try {
          const data = JSON.parse(e.data);
          listenersRef.current.get(eventType)?.forEach(cb => cb(data));
        } catch (err) {
          console.error(`[SSE] Failed to parse ${eventType}:`, err);
        }
      });
    });

    es.onerror = () => {
      console.warn('[SSE] Connection error, will auto-reconnect');
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [user]);

  return (
    <NotificationContext.Provider value={{ subscribe }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
