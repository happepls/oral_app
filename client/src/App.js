import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { TourProvider } from './contexts/TourContext';
import Welcome from './pages/Welcome';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Conversation from './pages/Conversation';
import Recall from './pages/Recall';
import Discovery from './pages/Discovery';
import Profile from './pages/Profile';
import Onboarding from './pages/Onboarding';
import GoalSetting from './pages/GoalSetting';
import Checkin from './pages/Checkin';
import Goals from './pages/Goals';
import Subscription from './pages/Subscription';
import Achievements from './pages/Achievements';
import History from './pages/History';
import DeveloperAuthorization from './pages/DeveloperAuthorization';
import SplashScreen from './components/SplashScreen';
import SupportChat from './components/SupportChat';
import './App.css';

const RequireAuth = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[100dvh] items-center justify-center bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-200">
        <span className="sr-only">{t('qa_ui.loading')}</span>
        <span aria-hidden="true" className="h-9 w-9 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
};

const PageMetadata = () => {
  const location = useLocation();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const isPublicHomepage = location.pathname === '/';
    const robots = document.querySelector('meta[name="robots"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const schema = document.getElementById('homepage-structured-data');

    if (robots) robots.setAttribute('content', isPublicHomepage ? 'index,follow' : 'noindex,nofollow');
    if (canonical) {
      if (isPublicHomepage) canonical.setAttribute('href', 'https://guajiguaji.top/');
      else canonical.removeAttribute('href');
    }
    if (schema) schema.setAttribute('type', isPublicHomepage ? 'application/ld+json' : 'application/json');

    document.documentElement.lang = i18n.language === 'zh' ? 'zh-CN' : i18n.language;
    document.title = isPublicHomepage ? t('landing_meta_title') : 'GuaJi AI';
    const description = document.querySelector('meta[name="description"]');
    if (description && isPublicHomepage) description.setAttribute('content', t('landing_meta_description'));
  }, [i18n.language, location.pathname, t]);

  return null;
};

// Separate Layout component for Routes to keep main App clean
const AppRoutes = () => {
    return (
        <div className="App">
          <PageMetadata />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/goal-setting" element={<GoalSetting />} />
            <Route path="/conversation" element={<Conversation />} />
            <Route path="/recall" element={<Recall />} />
            <Route path="/discovery" element={<Discovery />} />
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="/checkin" element={<RequireAuth><Checkin /></RequireAuth>} />
            <Route path="/goals" element={<RequireAuth><Goals /></RequireAuth>} />
            <Route path="/achievements" element={<RequireAuth><Achievements /></RequireAuth>} />
            <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
            <Route path="/history/:sessionId" element={<RequireAuth><History /></RequireAuth>} />
            <Route path="/subscription" element={<RequireAuth><Subscription /></RequireAuth>} />
            <Route path="/subscription/success" element={<RequireAuth><Subscription /></RequireAuth>} />
            <Route path="/subscription/cancel" element={<RequireAuth><Subscription /></RequireAuth>} />
            <Route path="/developer/authorize" element={<DeveloperAuthorization />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
    );
};

function App() {
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    // Check if splash has been shown in this session
    const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');
    const isRoot = window.location.pathname === '/';

    if (!hasSeenSplash && isRoot) {
      setShowSplash(true);
      sessionStorage.setItem('hasSeenSplash', 'true');
    }
  }, []);

  return (
    <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID || ''}>
      <AuthProvider>
        <NotificationProvider>
          <Router>
            {showSplash ? (
              <SplashScreen onComplete={() => setShowSplash(false)} />
            ) : (
              <TourProvider>
                <div className="app-viewport bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                  <SupportChat />
                  <AppRoutes />
                </div>
              </TourProvider>
            )}
          </Router>
        </NotificationProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
