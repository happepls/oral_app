import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

const SSE_EVENT_TYPES = [
  'proficiency_update',
  'task_completed',
  'daily_qa_completed',
  'task_score_updated'
];

const SSE_RECONNECT_BASE_DELAY_MS = 1000;
const SSE_RECONNECT_MAX_DELAY_MS = 30000;

export const getSSEReconnectDelay = (attempt) => Math.min(
  SSE_RECONNECT_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1)),
  SSE_RECONNECT_MAX_DELAY_MS,
);

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const eventSourceRef = useRef(null);
  const listenersRef = useRef(new Map());
  const [subscriberCount, setSubscriberCount] = useState(0);

  const subscribe = useCallback((eventType, callback) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType).add(callback);
    setSubscriberCount(count => count + 1);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      listenersRef.current.get(eventType)?.delete(callback);
      setSubscriberCount(count => Math.max(0, count - 1));
    };
  }, []);

  useEffect(() => {
    // Keep the long-lived stream demand-driven. Authenticated pages such as
    // /recall have no notification listeners and should not open an unused
    // Cloudflare HTTP/2 connection.
    if (!user || subscriberCount === 0) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    let disposed = false;
    let reconnectTimer = null;
    let reconnectAttempt = 0;
    let outageReported = false;

    const markConnected = () => {
      reconnectAttempt = 0;
      outageReported = false;
    };

    const connect = () => {
      if (disposed || eventSourceRef.current) return;

      const es = new EventSource('/api/users/sse', { withCredentials: true });
      eventSourceRef.current = es;
      es.onopen = markConnected;
      es.addEventListener('connected', markConnected);

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
        es.close();
        if (eventSourceRef.current === es) eventSourceRef.current = null;
        if (disposed) return;

        reconnectAttempt += 1;
        if (!outageReported) {
          console.warn('[SSE] Connection unavailable; retrying in background');
          outageReported = true;
        }
        reconnectTimer = window.setTimeout(connect, getSSEReconnectDelay(reconnectAttempt));
      };
    };

    const reconnectNow = () => {
      if (disposed || eventSourceRef.current) return;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      reconnectAttempt = 0;
      connect();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') reconnectNow();
    };

    window.addEventListener('online', reconnectNow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.removeEventListener('online', reconnectNow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [user, subscriberCount]);

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
