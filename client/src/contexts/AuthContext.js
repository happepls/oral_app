import React, { createContext, useState, useContext, useEffect } from 'react';
import { authAPI, userAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (err) {
        console.error('Failed to parse user data:', err);
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
      }
    }
    
    setLoading(false);
  }, []);

  const login = async (credentials) => {
    try {
      setError(null);
      setLoading(true);
      
      const response = await authAPI.login(credentials);
      
      // The API response is now standardized with success/data format
      // handleResponse in api.js extracts the data part for successful responses
      const { user: userData, token } = response;
      localStorage.setItem('authToken', token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      return { success: true };
    } catch (err) {
      const errorMessage = err.message || '登录失败，请稍后重试';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    try {
      setError(null);
      setLoading(true);
      
      const response = await authAPI.register(userData);
      
      // The API response is now standardized with success/data format
      // handleResponse in api.js extracts the data part for successful responses
      const { user: newUser, token } = response;
      localStorage.setItem('authToken', token);
      localStorage.setItem('user', JSON.stringify(newUser));
      setUser(newUser);
      return { success: true };
    } catch (err) {
      const errorMessage = err.message || '注册失败，请稍后重试';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    setUser(null);
    setError(null);
  };

  const refreshProfile = async () => {
    try {
      const response = await userAPI.getProfile();
      // The API response is now standardized with success/data format
      // handleResponse in api.js extracts the data part for successful responses
      const userData = response.user;
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
    } catch (err) {
      console.error('Failed to refresh profile:', err);
    }
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    refreshProfile,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;