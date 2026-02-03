import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Welcome from './pages/Welcome';
import Login from './pages/Login';
import Register from './pages/Register';
import Conversation from './pages/Conversation';
import Discovery from './pages/Discovery';
import Profile from './pages/Profile';
import History from './pages/History';
import Onboarding from './pages/Onboarding';
import GoalSetting from './pages/GoalSetting';
import Checkin from './pages/Checkin';
import Goals from './pages/Goals';
import SplashScreen from './components/SplashScreen';
import './App.css';

// Separate Layout component for Routes to keep main App clean
const AppRoutes = () => {
    return (
        <div className="App">
          <Routes>
            <Route path="/" element={<Welcome />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/goal-setting" element={<GoalSetting />} />
            <Route path="/conversation" element={<Conversation />} />
            <Route path="/discovery" element={<Discovery />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/history" element={<History />} />
            <Route path="/checkin" element={<Checkin />} />
            <Route path="/goals" element={<Goals />} />
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
    <AuthProvider>
      <Router>
        {showSplash ? (
          <SplashScreen onComplete={() => setShowSplash(false)} />
        ) : (
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
            <AppRoutes />
          </div>
        )}
      </Router>
    </AuthProvider>
  );
}

export default App;