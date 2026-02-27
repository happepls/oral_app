const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const validator = require('validator');
const { body, validationResult } = require('express-validator');

// Rate limiting configurations
const createRateLimiter = (windowMs, max, message, standardHeaders = true, legacyHeaders = true) => {
  return rateLimit({
    windowMs,
    max,
    message: { code: 429, message, data: null },
    standardHeaders,
    legacyHeaders,
    // Trust proxy headers for accurate client IP detection
    trustProxy: true,
    // Use custom key generator to avoid X-Forwarded-For issues
    keyGenerator: (req) => {
      // Get real client IP from X-Forwarded-For header when behind proxy
      const forwardedFor = req.headers['x-forwarded-for'];
      if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
      }
      return req.ip || req.connection.remoteAddress;
    },
    handler: (req, res) => {
      res.status(429).json({
        code: 429,
        message,
        data: null
      });
    }
  });
};

// Rate limiters for different endpoints
const authRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  20, // limit each IP to 20 requests per windowMs (increased for testing)
  'Too many authentication attempts, please try again later.'
);

const generalRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  'Too many requests from this IP, please try again later.'
);

const apiRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  1000, // limit each IP to 1000 requests per windowMs
  'API rate limit exceeded, please try again later.'
);

// Security headers middleware
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
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
});

// Input validation middleware
const validateRegistration = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
    .escape(),
  
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 100 })
    .withMessage('Email must not exceed 100 characters'),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
    .isLength({ max: 128 })
    .withMessage('Password must not exceed 128 characters'),
  
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Name must be between 1 and 50 characters')
    .escape()
];

const validateLogin = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ max: 128 })
    .withMessage('Password must not exceed 128 characters')
];

const validatePasswordReset = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
];

const validatePasswordUpdate = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
    .custom((value, { req }) => value !== req.body.currentPassword)
    .withMessage('New password must be different from current password')
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 400,
      message: 'Validation failed',
      data: {
        errors: errors.array().map(error => ({
          field: error.param,
          message: error.msg
        }))
      }
    });
  }
  next();
};

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Remove potential XSS payloads
        req.body[key] = validator.escape(req.body[key]);
      }
    });
  }
  
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = validator.escape(req.query[key]);
      }
    });
  }
  
  next();
};

// API key validation middleware
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      code: 401,
      message: 'API key is required',
      data: null
    });
  }
  
  // Validate API key format (basic validation)
  if (!validator.isAlphanumeric(apiKey) || apiKey.length < 32) {
    return res.status(401).json({
      code: 401,
      message: 'Invalid API key format',
      data: null
    });
  }
  
  // Here you would typically verify the API key against your database
  // For now, we'll just pass it through with basic validation
  next();
};

// Session security middleware
const sessionSecurity = (req, res, next) => {
  // Prevent session fixation attacks
  if (req.session && !req.session.regenerated) {
    req.session.regenerate(() => {
      req.session.regenerated = true;
      next();
    });
  } else {
    next();
  }
};

// Content type validation middleware
const validateContentType = (req, res, next) => {
  // Only validate for POST, PUT, PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(415).json({
        code: 415,
        message: 'Content-Type must be application/json',
        data: null
      });
    }
  }
  
  next();
};

// Request size limiter
const requestSizeLimiter = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength) {
      const maxBytes = parseInt(maxSize) * 1024 * 1024; // Convert MB to bytes
      if (parseInt(contentLength) > maxBytes) {
        return res.status(413).json({
          code: 413,
          message: `Request entity too large. Maximum size allowed is ${maxSize}`,
          data: null
        });
      }
    }
    
    next();
  };
};

module.exports = {
  // Rate limiters
  authRateLimiter,
  generalRateLimiter,
  apiRateLimiter,
  createRateLimiter,
  
  // Security middleware
  securityHeaders,
  sanitizeInput,
  sessionSecurity,
  validateContentType,
  requestSizeLimiter,
  
  // Validation middleware
  validateRegistration,
  validateLogin,
  validatePasswordReset,
  validatePasswordUpdate,
  handleValidationErrors,
  
  // API security
  validateApiKey,
  
  // Additional security exports
  mongoSanitize,
  xss,
  hpp
};