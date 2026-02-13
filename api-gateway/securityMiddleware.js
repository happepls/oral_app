const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const jwt = require('jsonwebtoken');

// API Gateway Security Configuration
const SECURITY_CONFIG = {
  // Rate limiting
  rateLimits: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequestsPerIP: 1000,
    maxRequestsPerUser: 100,
    maxAuthAttempts: 5,
    maxApiKeyRequests: 5000
  },
  
  // JWT configuration
  jwt: {
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    algorithm: 'HS256',
    issuer: 'oral-app-gateway',
    audience: 'oral-app-users'
  },
  
  // CORS configuration
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:5001',
      'https://localhost:3000',
      'https://localhost:5001'
    ],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Request-ID',
      'X-Forwarded-For'
    ],
    credentials: true,
    maxAge: 86400 // 24 hours
  },
  
  // Security headers
  securityHeaders: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:", "https://api.openai.com"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'same-origin' }
  }
};

// Rate limiters for different endpoints
const createRateLimiter = (options) => {
  return rateLimit({
    windowMs: options.windowMs || SECURITY_CONFIG.rateLimits.windowMs,
    max: options.max,
    message: {
      code: 429,
      message: options.message || 'Too many requests',
      data: null
    },
    standardHeaders: true,
    legacyHeaders: true,
    handler: (req, res) => {
      res.status(429).json({
        code: 429,
        message: options.message || 'Too many requests',
        data: null,
        retryAfter: Math.round(options.windowMs / 1000)
      });
    },
    // Custom key generator
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP address
      return req.user?.id || req.ip;
    },
    // Skip successful requests for certain endpoints
    skip: (req) => {
      return req.method === 'OPTIONS' || req.path === '/health';
    }
  });
};

// API Gateway rate limiters
const gatewayRateLimiter = createRateLimiter({
  max: SECURITY_CONFIG.rateLimits.maxRequestsPerIP,
  message: 'API Gateway rate limit exceeded'
});

const authRateLimiter = createRateLimiter({
  max: SECURITY_CONFIG.rateLimits.maxAuthAttempts,
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many authentication attempts'
});

const apiKeyRateLimiter = createRateLimiter({
  max: SECURITY_CONFIG.rateLimits.maxApiKeyRequests,
  message: 'API key rate limit exceeded'
});

// JWT validation middleware for API Gateway
const validateJWT = async (req, res, next) => {
  let token;

  // Extract token from Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  
  // Extract token from cookies
  if (!token && req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return res.status(401).json({
      code: 401,
      message: 'No token provided',
      data: null
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: [SECURITY_CONFIG.jwt.algorithm],
      issuer: SECURITY_CONFIG.jwt.issuer,
      audience: SECURITY_CONFIG.jwt.audience
    });

    // Add user info to request
    req.user = {
      id: decoded.id,
      type: decoded.type
    };

    next();
  } catch (error) {
    console.error('JWT validation error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        code: 401,
        message: 'Token has expired',
        data: null
      });
    }
    
    return res.status(401).json({
      code: 401,
      message: 'Invalid token',
      data: null
    });
  }
};

// API Key validation middleware
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      code: 401,
      message: 'API key is required',
      data: null
    });
  }

  // Basic API key format validation
  if (!/^[a-zA-Z0-9_-]{32,64}$/.test(apiKey)) {
    return res.status(401).json({
      code: 401,
      message: 'Invalid API key format',
      data: null
    });
  }

  // In production, validate against database
  // For now, we'll pass through with basic validation
  req.apiKey = apiKey;
  next();
};

// Request ID middleware for tracking
const requestIdMiddleware = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || 
                   req.headers['x-amzn-trace-id'] ||
                   generateRequestId();
  
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  next();
};

// Generate unique request ID
const generateRequestId = () => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// IP whitelist/blacklist middleware
const ipFilter = (whitelist = [], blacklist = []) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // Check blacklist first
    if (blacklist.length > 0 && blacklist.includes(clientIP)) {
      return res.status(403).json({
        code: 403,
        message: 'Access denied',
        data: null
      });
    }
    
    // Check whitelist if provided
    if (whitelist.length > 0 && !whitelist.includes(clientIP)) {
      return res.status(403).json({
        code: 403,
        message: 'Access denied',
        data: null
      });
    }
    
    next();
  };
};

// CORS configuration
const corsConfig = (req, callback) => {
  const origin = req.header('Origin');
  const allowedOrigins = SECURITY_CONFIG.cors.allowedOrigins;
  
  let corsOptions = {
    origin: false,
    methods: SECURITY_CONFIG.cors.allowedMethods,
    allowedHeaders: SECURITY_CONFIG.cors.allowedHeaders,
    credentials: SECURITY_CONFIG.cors.credentials,
    maxAge: SECURITY_CONFIG.cors.maxAge,
    optionsSuccessStatus: 200
  };
  
  // Allow requests with no origin (mobile apps, curl, etc.)
  if (!origin) {
    corsOptions.origin = true;
  } else if (allowedOrigins.includes(origin)) {
    corsOptions.origin = true;
  } else if (process.env.NODE_ENV === 'development') {
    // Allow all origins in development
    corsOptions.origin = true;
  }
  
  callback(null, corsOptions);
};

// Security headers middleware
const securityHeaders = helmet(SECURITY_CONFIG.securityHeaders);

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  
  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    sanitizeObject(req.query);
  }
  
  next();
};

// Helper function to sanitize objects
const sanitizeObject = (obj) => {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      // Remove potential XSS payloads
      obj[key] = obj[key].replace(/<script[^>]*>.*?<\/script>/gi, '');
      obj[key] = obj[key].replace(/javascript:/gi, '');
      obj[key] = obj[key].replace(/on\w+\s*=/gi, '');
    } else if (typeof obj[key] === 'object') {
      sanitizeObject(obj[key]);
    }
  }
};

// Request logging middleware (for security monitoring)
const securityLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log security-relevant information
  const securityInfo = {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
    userId: req.user?.id || null,
    apiKey: req.headers['x-api-key'] ? '[REDACTED]' : null
  };
  
  // Override res.end to capture response info
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    res.end = originalEnd;
    
    const duration = Date.now() - startTime;
    securityInfo.statusCode = res.statusCode;
    securityInfo.duration = duration;
    
    // Log security events
    if (res.statusCode >= 400) {
      console.warn('Security event:', securityInfo);
    } else {
      console.log('Request completed:', securityInfo);
    }
    
    res.end(chunk, encoding);
  };
  
  next();
};

// Error handling middleware
const securityErrorHandler = (err, req, res, next) => {
  console.error('Security error:', {
    requestId: req.requestId,
    error: err.message,
    stack: err.stack,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  // Don't expose internal errors to client
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      code: 403,
      message: 'Invalid CSRF token',
      data: null
    });
  }
  
  if (err.code === 'EACCES') {
    return res.status(403).json({
      code: 403,
      message: 'Access denied',
      data: null
    });
  }
  
  // Generic error response
  res.status(500).json({
    code: 500,
    message: 'Internal server error',
    data: null
  });
};

module.exports = {
  // Configuration
  SECURITY_CONFIG,
  
  // Rate limiters
  gatewayRateLimiter,
  authRateLimiter,
  apiKeyRateLimiter,
  createRateLimiter,
  
  // Validation middleware
  validateJWT,
  validateApiKey,
  
  // Security middleware
  securityHeaders,
  sanitizeInput,
  requestIdMiddleware,
  ipFilter,
  securityLogger,
  securityErrorHandler,
  
  // CORS
  corsConfig,
  
  // Utilities
  generateRequestId
};