import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPage, retryAnalyticsEnds } from '../utils/productAnalytics';
import { useAuth } from '../contexts/AuthContext';

export default function ProductAnalytics() {
  const { pathname, search } = useLocation();
  const isTour = new URLSearchParams(search).get('mode') === 'tour';
  const { user } = useAuth();
  const previous = useRef(null);
  useEffect(() => {
    if (isTour || previous.current === pathname) return;
    previous.current = pathname;
    trackPage(pathname);
  }, [pathname, isTour]);
  useEffect(() => {
    if (isTour) return undefined;
    const retry = () => retryAnalyticsEnds(user?.id);
    retry();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [user?.id, pathname, isTour]);
  return null;
}
