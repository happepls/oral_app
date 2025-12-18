import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Welcome from './pages/Welcome';
import Login from './pages/Login';
import Register from './pages/Register';
import Conversation from './pages/Conversation';
import Discovery from './pages/Discovery';
import Profile from './pages/Profile';
import History from './pages/History';
import Onboarding from './pages/Onboarding'; // Import new component
import GoalSetting from './pages/GoalSetting'; // Import new component
import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="App">
          <Routes>
            <Route path="/" element={<Welcome />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/onboarding" element={<Onboarding />} /> {/* New Route */}
            <Route path="/goal-setting" element={<GoalSetting />} /> {/* New Route */}
            <Route path="/conversation" element={<Conversation />} />
            <Route path="/discovery" element={<Discovery />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/history" element={<History />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;