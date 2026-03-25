import React, { createContext, useState, useContext, useEffect, useMemo } from 'react';
import { authAPI, userAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('authToken') || localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    const clearAuth = () => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    };

    const migrateToken = async (oldToken) => {
      try {
        const response = await fetch('/api/users/token-migrate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${oldToken}`
          },
          credentials: 'include'
        });

        if (response.ok) {
          console.log('Token migrated successfully to httpOnly cookie');
          // Remove old token from localStorage after successful migration
          clearAuth();
          // Try to restore user from API response if provided
          const data = await response.json();
          if (data.data?.user) {
            localStorage.setItem('user', JSON.stringify(data.data.user));
            setUser(data.data.user);
          }
        } else {
          console.error('Token migration failed');
          clearAuth();
        }
      } catch (err) {
        console.error('Token migration error:', err);
        clearAuth();
      }
      setLoading(false);
    };

    if (savedToken) {
      // Migrate old JWT token to httpOnly cookie
      migrateToken(savedToken);
    } else if (savedUser) {
      // No old token, just restore user from localStorage
      try {
        setUser(JSON.parse(savedUser));
      } catch (err) {
        console.error('Failed to parse user data:', err);
        clearAuth();
      }
      setLoading(false);
    } else {
      // No saved data
      setLoading(false);
    }
  }, []);

  const login = async (credentials) => {
    try {
      setError(null);
      setLoading(true);

      const response = await authAPI.login(credentials);

      // Cookie-based auth: token is now in httpOnly cookie
      // Only save non-sensitive user info to localStorage
      const { user: userData } = response;
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      // Cookie is automatically handled by browser; no need to store token
      setToken(null); // Keep token state null in cookie mode
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

      // Cookie-based auth: token is now in httpOnly cookie
      // Only save non-sensitive user info to localStorage
      const { user: newUser } = response;
      localStorage.setItem('user', JSON.stringify(newUser));
      setUser(newUser);
      // Cookie is automatically handled by browser; no need to store token
      setToken(null); // Keep token state null in cookie mode
      return { success: true };
    } catch (err) {
      const errorMessage = err.message || '注册失败，请稍后重试';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async (googleToken) => {
    try {
      setError(null);
      setLoading(true);
      const response = await authAPI.googleSignIn(googleToken);

      // Cookie-based auth: token is now in httpOnly cookie
      // Only save non-sensitive user info to localStorage
      const { user: userData } = response;
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      // Cookie is automatically handled by browser; no need to store token
      setToken(null); // Keep token state null in cookie mode
      return { success: true };
    } catch (err) {
      const errorMessage = err.message || 'Google 登录失败，请稍后重试';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates) => {
    try {
      setLoading(true);
      const response = await userAPI.updateProfile(updates);
      const updatedUser = response.user;
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      return { success: true };
    } catch (err) {
      console.error('Failed to update profile:', err);
      return { success: false, message: err.message };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Call backend to clear httpOnly cookie
      await fetch('/api/users/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
    } catch (err) {
      console.error('Logout API call failed:', err);
      // Continue with local cleanup even if API call fails
    }

    // Clear local state
    localStorage.removeItem('user');
    setUser(null);
    setToken(null);
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

  const checkTokenExpiry = () => {
    // Cookie-based auth: token validity is handled by server/httpOnly cookie
    // No client-side token expiry check needed
    // Backend will respond with 401 if cookie is invalid
    return true;
  };

  const refreshToken = async () => {
    // Cookie-based auth: no manual refresh needed
    // If 401 is received, API handler will redirect to login
    return true;
  };

  const value = useMemo(() => ({
    user,
    token,
    loading,
    error,
    login,
    loginWithGoogle,
    register,
    logout,
    updateProfile,
    refreshProfile,
    checkTokenExpiry,
    refreshToken,
    isAuthenticated: !!user
  }), [user, token, loading, error, login, loginWithGoogle, register, logout, updateProfile, refreshProfile, checkTokenExpiry, refreshToken]);

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