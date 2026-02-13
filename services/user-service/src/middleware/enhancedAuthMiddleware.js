const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/user');
const { promisify } = require('util');

// Enhanced JWT configuration
const JWT_CONFIG = {
  accessTokenExpiry: '15m', // Short-lived access tokens
  refreshTokenExpiry: '7d', // Longer-lived refresh tokens
  algorithm: 'HS256',
  issuer: 'oral-app',
  audience: 'oral-app-users'
};

// Token blacklist (in production, use Redis)
const tokenBlacklist = new Set();

// Generate cryptographically secure tokens
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Generate access token
const generateAccessToken = (userId) => {
  return jwt.sign(
    { 
      id: userId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000)
    },
    process.env.JWT_SECRET,
    {
      expiresIn: JWT_CONFIG.accessTokenExpiry,
      algorithm: JWT_CONFIG.algorithm,
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience
    }
  );
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { 
      id: userId,
      type: 'refresh',
      tokenId: generateSecureToken(16), // Unique token ID for revocation
      iat: Math.floor(Date.now() / 1000)
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: JWT_CONFIG.refreshTokenExpiry,
      algorithm: JWT_CONFIG.algorithm,
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience
    }
  );
};

// Enhanced authentication middleware
const protect = async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  
  // Check for token in cookies as fallback
  if (!token && req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return res.status(401).json({
      code: 401,
      message: 'Not authorized, no token provided',
      data: null
    });
  }

  try {
    // Check if token is blacklisted
    if (tokenBlacklist.has(token)) {
      return res.status(401).json({
        code: 401,
        message: 'Token has been revoked',
        data: null
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: [JWT_CONFIG.algorithm],
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience
    });

    // Ensure it's an access token
    if (decoded.type !== 'access') {
      return res.status(401).json({
        code: 401,
        message: 'Invalid token type',
        data: null
      });
    }

    // Get user from database
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        code: 401,
        message: 'User not found',
        data: null
      });
    }

    // Check if user account is active
    if (user.status === 'suspended' || user.status === 'deleted') {
      return res.status(401).json({
        code: 401,
        message: 'Account is not active',
        data: null
      });
    }

    // Check for password change (if implemented)
    if (user.passwordChangedAt && decoded.iat < Math.floor(new Date(user.passwordChangedAt).getTime() / 1000)) {
      return res.status(401).json({
        code: 401,
        message: 'Password has been changed, please login again',
        data: null
      });
    }

    // Add user to request object
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        code: 401,
        message: 'Token has expired',
        data: null
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        code: 401,
        message: 'Invalid token',
        data: null
      });
    }

    return res.status(401).json({
      code: 401,
      message: 'Not authorized, token verification failed',
      data: null
    });
  }
};

// Refresh token middleware
const refresh = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      code: 400,
      message: 'Refresh token is required',
      data: null
    });
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, {
      algorithms: [JWT_CONFIG.algorithm],
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience
    });

    // Ensure it's a refresh token
    if (decoded.type !== 'refresh') {
      return res.status(400).json({
        code: 400,
        message: 'Invalid token type',
        data: null
      });
    }

    // Get user from database
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(400).json({
        code: 400,
        message: 'User not found',
        data: null
      });
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);

    // Blacklist old refresh token (optional, for enhanced security)
    // tokenBlacklist.add(refreshToken);

    res.json({
      code: 200,
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    
    return res.status(400).json({
      code: 400,
      message: 'Invalid or expired refresh token',
      data: null
    });
  }
};

// Logout middleware (token revocation)
const logout = async (req, res) => {
  const token = req.token;
  
  if (token) {
    // Add token to blacklist
    tokenBlacklist.add(token);
  }

  res.json({
    code: 200,
    message: 'Logged out successfully',
    data: null
  });
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        code: 401,
        message: 'Authentication required',
        data: null
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        code: 403,
        message: 'Insufficient permissions',
        data: null
      });
    }

    next();
  };
};

// Session validation middleware
const validateSession = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      code: 401,
      message: 'Session validation failed',
      data: null
    });
  }

  // Check for concurrent sessions (optional)
  // This would require storing session information in database/Redis
  
  next();
};

// Enhanced password hashing
const hashPassword = async (password) => {
  const saltRounds = 12; // Increased from default 10
  return await bcrypt.hash(password, saltRounds);
};

// Password validation
const validatePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// Clean up expired tokens from blacklist (for memory management)
const cleanupExpiredTokens = () => {
  const now = Math.floor(Date.now() / 1000);
  
  for (const token of tokenBlacklist) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        tokenBlacklist.delete(token);
      }
    }
  }
};

// Run cleanup every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

module.exports = {
  protect,
  refresh,
  logout,
  authorize,
  validateSession,
  hashPassword,
  validatePassword,
  generateAccessToken,
  generateRefreshToken,
  JWT_CONFIG
};