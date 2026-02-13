# API Security and User Data Protection

## Overview

This document outlines the comprehensive security enhancements implemented for the Oral AI application, focusing on API security, user data protection, and compliance with security best practices.

## Security Architecture

### 1. Multi-Layer Security Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Applications                      │
├─────────────────────────────────────────────────────────────┤
│                  API Gateway Security                       │
│  • Rate Limiting • JWT Validation • Input Sanitization    │
│  • CORS Protection • Security Headers • Request Tracking    │
├─────────────────────────────────────────────────────────────┤
│                  Service-Level Security                     │
│  • Authentication • Authorization • Data Encryption       │
│  • Audit Logging • Error Handling • Session Management    │
├─────────────────────────────────────────────────────────────┤
│                    Data Layer Security                      │
│  • Database Encryption • Secure Connections • Backup      │
│  • Access Controls • Data Retention • Privacy Controls   │
└─────────────────────────────────────────────────────────────┘
```

### 2. Security Components

#### API Gateway Security (`api-gateway/securityMiddleware.js`)
- **Rate Limiting**: Prevents abuse and DDoS attacks
- **JWT Validation**: Secure token-based authentication
- **Input Sanitization**: Prevents injection attacks
- **CORS Protection**: Controls cross-origin requests
- **Security Headers**: Implements security best practices
- **Request Tracking**: Enables security monitoring

#### User Service Security (`services/user-service/src/middleware/`)
- **Enhanced Authentication**: JWT with refresh tokens
- **Input Validation**: Comprehensive validation rules
- **Data Encryption**: Sensitive data protection
- **Session Management**: Secure session handling
- **Password Security**: Strong password requirements

## Security Features

### 1. Authentication & Authorization

#### JWT Token Management
```javascript
// Access Token (15 minutes)
const accessToken = jwt.sign(
  { id: userId, type: 'access' },
  process.env.JWT_SECRET,
  { expiresIn: '15m', issuer: 'oral-app' }
);

// Refresh Token (7 days)
const refreshToken = jwt.sign(
  { id: userId, type: 'refresh', tokenId: generateSecureToken() },
  process.env.JWT_REFRESH_SECRET,
  { expiresIn: '7d', issuer: 'oral-app' }
);
```

#### Password Security
- Minimum 8 characters
- Must contain uppercase, lowercase, numbers, and special characters
- Bcrypt hashing with salt rounds of 12
- Password history tracking
- Account lockout after failed attempts

### 2. Rate Limiting & DDoS Protection

#### Rate Limiting Configuration
```javascript
// Authentication endpoints
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts'
});

// General API endpoints
const generalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests from this IP'
});
```

### 3. Input Validation & Sanitization

#### Validation Rules
```javascript
const validateRegistration = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .escape(),
  
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 100 }),
  
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .isLength({ max: 128 })
];
```

#### Input Sanitization
- XSS protection with express-xss-sanitizer
- NoSQL injection prevention with express-mongo-sanitize
- HTTP Parameter Pollution protection with hpp
- Content-Type validation
- Request size limiting

### 4. Data Encryption

#### Sensitive Data Encryption
```javascript
const encryptUserSensitiveData = (userData, masterKey) => {
  const sensitiveFields = ['email', 'phone', 'address', 'paymentInfo'];
  
  sensitiveFields.forEach(field => {
    if (userData[field]) {
      const encrypted = encryptData(JSON.stringify(userData[field]), masterKey);
      userData[field] = {
        encrypted: true,
        data: encrypted.encrypted,
        iv: encrypted.iv,
        tag: encrypted.tag
      };
    }
  });
  
  return userData;
};
```

#### Encryption Configuration
- Algorithm: AES-256-GCM
- Key Length: 32 bytes
- IV Length: 16 bytes
- Authentication Tag: 16 bytes
- PBKDF2 key derivation with 100,000 iterations

### 5. Security Headers

#### Implemented Security Headers
```javascript
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
      objectSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }
});
```

### 6. API Security

#### API Key Management
- Secure random API key generation
- API key rotation support
- Rate limiting per API key
- API key usage tracking

#### Request Validation
```javascript
const validateContentType = (req, res, next) => {
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
```

## Data Protection

### 1. Personal Data Protection

#### Data Minimization
- Collect only necessary user data
- Implement data retention policies
- Provide data export functionality
- Support user data deletion (GDPR compliance)

#### Data Anonymization
```javascript
const maskSensitiveData = (data) => {
  if (typeof data !== 'string') return data;
  
  if (data.length <= 4) {
    return '*'.repeat(data.length);
  }
  
  const start = data.slice(0, 2);
  const end = data.slice(-2);
  const masked = '*'.repeat(data.length - 4);
  
  return `${start}${masked}${end}`;
};
```

### 2. Audio Data Security

#### Audio Streaming Security
- Encrypted WebSocket connections (WSS)
- Audio data encryption in transit
- Secure audio file storage
- Audio data retention policies

#### Audio Processing Security
- Input validation for audio data
- File type validation
- File size limitations
- Malware scanning for uploads

### 3. Database Security

#### Connection Security
- SSL/TLS encrypted database connections
- Connection string security
- Database access controls
- Regular security updates

#### Data Encryption at Rest
- Database-level encryption
- Column-level encryption for sensitive data
- Backup encryption
- Key management

## Security Monitoring

### 1. Security Logging

#### Security Event Logging
```javascript
const securityLogger = (req, res, next) => {
  const securityInfo = {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
    userId: req.user?.id || null
  };
  
  // Log security events
  if (res.statusCode >= 400) {
    console.warn('Security event:', securityInfo);
  }
  
  next();
};
```

#### Log Security
- Structured logging format
- Log rotation and retention
- Secure log storage
- Access control for logs

### 2. Security Alerts

#### Automated Security Monitoring
- Failed authentication attempts
- Rate limiting violations
- Suspicious request patterns
- System errors and anomalies

#### Alert Configuration
```javascript
// Security alert thresholds
const SECURITY_ALERTS = {
  failedLoginAttempts: 5,
  rateLimitViolations: 10,
  suspiciousRequests: 20,
  systemErrors: 50
};
```

## Compliance & Standards

### 1. Data Protection Regulations

#### GDPR Compliance
- User consent management
- Data portability (export functionality)
- Right to erasure (data deletion)
- Privacy by design implementation

#### Data Processing Records
- Document data processing activities
- Maintain data flow diagrams
- Implement data protection impact assessments
- Regular compliance audits

### 2. Security Standards

#### OWASP Top 10 Protection
- **A01:2021 – Broken Access Control**: Implemented role-based access control
- **A02:2021 – Cryptographic Failures**: Strong encryption for sensitive data
- **A03:2021 – Injection**: Input validation and parameterized queries
- **A04:2021 – Insecure Design**: Security-first design principles
- **A05:2021 – Security Misconfiguration**: Secure default configurations

#### Security Best Practices
- Regular security audits
- Penetration testing
- Vulnerability scanning
- Security training for developers

## Security Testing

### 1. Automated Security Testing

#### Security Audit Script
```bash
# Run security audit
node security-audit.js

# Check for vulnerabilities
npm audit

# Check for outdated packages
npm outdated
```

#### Security Test Coverage
- Authentication testing
- Authorization testing
- Input validation testing
- Encryption testing
- Rate limiting testing

### 2. Manual Security Testing

#### Penetration Testing Checklist
- [ ] Authentication bypass attempts
- [ ] SQL injection testing
- [ ] XSS vulnerability testing
- [ ] CSRF protection testing
- [ ] API security testing
- [ ] File upload security testing

## Incident Response

### 1. Security Incident Procedures

#### Incident Classification
- **Critical**: Data breach, system compromise
- **High**: Authentication bypass, data exposure
- **Medium**: Rate limiting violations, suspicious activity
- **Low**: Minor configuration issues

#### Response Timeline
- **Critical**: Immediate response (within 1 hour)
- **High**: Response within 4 hours
- **Medium**: Response within 24 hours
- **Low**: Response within 1 week

### 2. Recovery Procedures

#### Data Breach Response
1. Immediate containment
2. Assessment of impact
3. Notification procedures
4. Remediation actions
5. Post-incident review

#### System Recovery
1. Backup restoration
2. System hardening
3. Security patch application
4. Monitoring enhancement
5. Documentation updates

## Security Maintenance

### 1. Regular Security Updates

#### Update Schedule
- **Daily**: Security monitoring and alerting
- **Weekly**: Dependency updates and vulnerability scanning
- **Monthly**: Security audit and penetration testing
- **Quarterly**: Security architecture review
- **Annually**: Comprehensive security assessment

#### Update Procedures
- Security patch management
- Dependency vulnerability management
- Configuration security updates
- Security documentation updates

### 2. Security Training

#### Developer Training
- Secure coding practices
- OWASP Top 10 awareness
- Security testing techniques
- Incident response procedures

#### User Education
- Password security best practices
- Phishing awareness
- Privacy settings management
- Security incident reporting

## Security Configuration

### 1. Environment Variables

#### Required Security Variables
```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
JWT_REFRESH_SECRET=your-refresh-token-secret-minimum-32-characters-long

# Encryption
ENCRYPTION_KEY=your-encryption-key-32-characters-long

# API Security
API_KEY_LENGTH=32
API_RATE_LIMIT=5000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_MAX_AUTH_ATTEMPTS=5
```

### 2. Security Dependencies

#### Required Security Packages
```json
{
  "dependencies": {
    "helmet": "^7.0.0",
    "express-rate-limit": "^6.7.0",
    "express-validator": "^6.15.0",
    "express-mongo-sanitize": "^2.2.0",
    "xss-clean": "^0.1.4",
    "hpp": "^0.2.3",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.0",
    "crypto": "^1.0.1"
  }
}
```

## Security Checklist

### Deployment Security Checklist
- [ ] All environment variables configured
- [ ] Security headers implemented
- [ ] Rate limiting enabled
- [ ] Input validation configured
- [ ] Data encryption enabled
- [ ] Security logging configured
- [ ] SSL/TLS certificates installed
- [ ] Security monitoring active
- [ ] Backup encryption enabled
- [ ] Security documentation updated

### Ongoing Security Maintenance
- [ ] Regular security audits
- [ ] Dependency updates
- [ ] Vulnerability scanning
- [ ] Security training
- [ ] Incident response testing
- [ ] Backup restoration testing
- [ ] Security metrics review
- [ ] Compliance audits

## Contact Information

### Security Team
- **Security Lead**: [Email]
- **Security Engineer**: [Email]
- **Incident Response**: [Email]

### External Security Resources
- **Security Vendor**: [Contact]
- **Penetration Testing**: [Contact]
- **Compliance Consultant**: [Contact]

---

**Note**: This security documentation should be regularly updated as the application evolves. Review and update security measures quarterly or after any significant changes to the application architecture.