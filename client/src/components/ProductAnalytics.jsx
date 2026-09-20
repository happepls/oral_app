import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPage, retryAnalyticsEnds } from '../utils/productAnalytics';
import { useAuth } from '../contexts/AuthContext';

export default function ProductAnalytics() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const previous = useRef(null);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    trackPage(pathname);
  }, [pathname]);
  useEffect(() => {
    const retry = () => retryAnalyticsEnds(user?.id);
    retry();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [user?.id, pathname]);
  return null;
}
