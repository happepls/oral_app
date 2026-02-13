const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');
const OpenAI = require('openai');
require('dotenv').config();

// Import security middleware
const {
  SECURITY_CONFIG,
  gatewayRateLimiter,
  authRateLimiter,
  validateJWT,
  validateApiKey,
  securityHeaders,
  sanitizeInput,
  requestIdMiddleware,
  securityLogger,
  securityErrorHandler,
  corsConfig,
  ipFilter
} = require('./securityMiddleware');

const app = express();
const PORT = process.env.PORT || 8080;

// Apply security middleware
app.use(requestIdMiddleware); // Add request ID for tracking
app.use(securityHeaders); // Security headers
app.use(cookieParser()); // Cookie parser
app.use(cors(corsConfig)); // CORS with proper configuration
app.use(gatewayRateLimiter); // Rate limiting
app.use(sanitizeInput); // Input sanitization
app.use(express.json({ limit: '10mb' })); // JSON parsing with size limit

// IP filtering (optional, configure based on needs)
const allowedIPs = process.env.ALLOWED_IPS?.split(',') || [];
const blockedIPs = process.env.BLOCKED_IPS?.split(',') || [];
if (allowedIPs.length > 0 || blockedIPs.length > 0) {
  app.use(ipFilter(allowedIPs, blockedIPs));
}

// Security logging
app.use(securityLogger);

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8082';
const COMMS_SERVICE_URL = process.env.COMMS_SERVICE_URL || 'http://localhost:3003';
const CONVERSATION_SERVICE_URL = process.env.CONVERSATION_SERVICE_URL || 'http://localhost:8000';

// Enhanced proxy configuration with security
const createSecureProxy = (target, pathRewrite = {}) => {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    
    // Security enhancements
    onProxyReq: (proxyReq, req, res) => {
      // Add security headers to proxied requests
      proxyReq.setHeader('X-Forwarded-For', req.ip);
      proxyReq.setHeader('X-Request-ID', req.requestId);
      proxyReq.setHeader('X-Original-Host', req.get('host'));
      
      // Remove sensitive headers
      proxyReq.removeHeader('x-api-key');
      proxyReq.removeHeader('authorization'); // Re-add if needed by target service
      
      if (req.user) {
        // Add user context for authenticated requests
        proxyReq.setHeader('X-User-ID', req.user.id);
      }
    },
    
    onProxyRes: (proxyRes, req, res) => {
      // Add security headers to responses
      proxyRes.headers['X-Content-Type-Options'] = 'nosniff';
      proxyRes.headers['X-Frame-Options'] = 'DENY';
      proxyRes.headers['X-XSS-Protection'] = '1; mode=block';
      
      // Remove server identification headers
      delete proxyRes.headers['x-powered-by'];
      delete proxyRes.headers['server'];
    },
    
    onError: (err, req, res) => {
      console.error('Proxy error:', {
        requestId: req.requestId,
        target,
        error: err.message,
        url: req.url
      });
      
      res.status(502).json({
        code: 502,
        message: 'Service temporarily unavailable',
        data: null
      });
    }
  });
};

// AI scenario generation with enhanced security
app.use('/api/ai/generate-scenarios', 
  authRateLimiter,
  validateJWT,
  express.json({ limit: '1mb' }),
  async (req, res) => {
    try {
      const { type, target_language, target_level, interests, description, native_language } = req.body;
      
      // Input validation
      if (!target_language || !target_level) {
        return res.status(400).json({
          code: 400,
          message: 'Missing required fields: target_language, target_level',
          data: null
        });
      }
      
      // Sanitize inputs
      const sanitizedData = {
        type: type?.replace(/[<>]/g, '')?.substring(0, 50) || 'daily_conversation',
        target_language: target_language.replace(/[<>]/g, '').substring(0, 50),
        target_level: target_level.replace(/[<>]/g, '').substring(0, 30),
        interests: interests?.replace(/[<>]/g, '')?.substring(0, 200) || 'general topics',
        description: description?.replace(/[<>]/g, '')?.substring(0, 500) || 'none',
        native_language: native_language?.replace(/[<>]/g, '')?.substring(0, 50) || 'Chinese'
      };
      
      // Initialize OpenAI client if API key is available
      if (!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY) {
        return res.status(503).json({
          code: 503,
          message: 'AI service not configured',
          data: null
        });
      }
      
      const openrouter = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
      });
      
      const outputLang = sanitizedData.native_language;
      const outputLangInstruction = outputLang === 'Chinese' ? '用中文输出所有场景标题和任务描述' : 
                                     outputLang === 'Japanese' ? '日本語で全てのシナリオタイトルとタスクを出力してください' :
                                     outputLang === 'French' ? 'Générez tous les titres et tâches en français' :
                                     'Output all scenario titles and tasks in English';
      
      const prompt = `You are an expert language learning curriculum designer. Generate exactly 10 practice scenarios for a ${sanitizedData.target_language} learner.

IMPORTANT: ${outputLangInstruction}

User Profile:
- Goal Type: ${sanitizedData.type}
- Target Level: ${sanitizedData.target_level}
- Interests: ${sanitizedData.interests}
- Additional Notes: ${sanitizedData.description}
- Native Language: ${outputLang}

Requirements:
1. Create 10 unique, practical scenarios relevant to the goal type
2. Each scenario must have a clear title and exactly 3 specific practice tasks
3. Tasks should be conversational goals the learner can practice in ${sanitizedData.target_language}
4. Include 1 scenario about cultural small talk in ${sanitizedData.target_language}-speaking regions
5. Order scenarios from easier to more challenging
6. IMPORTANT: Write scenario titles and task descriptions in ${outputLang} so the learner can understand them easily

Respond ONLY with valid JSON in this exact format:
{
  "scenarios": [
    {
      "title": "场景标题(用${outputLang})",
      "tasks": ["任务1(用${outputLang})", "任务2(用${outputLang})", "任务3(用${outputLang})"]
    }
  ]
}`;
      
      const response = await openrouter.chat.completions.create({
        model: 'meta-llama/llama-3.3-70b-instruct',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2048,
        response_format: { type: 'json_object' }
      });
      
      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      
      res.json({
        code: 200,
        message: 'Success',
        data: parsed
      });
    } catch (error) {
      console.error('AI Scenario Generation Error:', {
        requestId: req.requestId,
        userId: req.user?.id,
        error: error.message
      });
      
      res.status(500).json({
        code: 500,
        message: 'Failed to generate scenarios',
        data: null
      });
    }
  }
);

// Protected routes (require authentication)
app.use('/api/users', 
  validateJWT,
  createSecureProxy(USER_SERVICE_URL, { '^/api/users': '' })
);

app.use('/api/ai', 
  validateJWT,
  createSecureProxy(AI_SERVICE_URL, { '^/api/ai': '' })
);

app.use('/api/conversation', 
  validateJWT,
  createSecureProxy(CONVERSATION_SERVICE_URL, { '^/api/conversation': '' })
);

app.use('/api/history/user', 
  validateJWT,
  createSecureProxy(CONVERSATION_SERVICE_URL, { '^/api/history/user': '/history/user' })
);

app.use('/api/history/stats', 
  validateJWT,
  createSecureProxy(CONVERSATION_SERVICE_URL, { '^/api/history/stats': '/history/stats' })
);

app.use('/api/history/session', 
  validateJWT,
  createSecureProxy(CONVERSATION_SERVICE_URL, { '^/api/history/session': '/history' })
);

// WebSocket proxy (with authentication)
app.use('/api/ws', 
  validateJWT,
  createSecureProxy(COMMS_SERVICE_URL, {})
);

// Stripe webhook (no auth required for webhooks)
app.use('/api/stripe/webhook', 
  createSecureProxy(USER_SERVICE_URL, {})
);

// Stripe API (requires authentication)
app.use('/api/stripe', 
  validateJWT,
  createSecureProxy(USER_SERVICE_URL, {})
);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    code: 404,
    message: 'API endpoint not found',
    data: null
  });
});

// Global error handler
app.use(securityErrorHandler);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔒 Secure API Gateway running on port ${PORT}`);
  console.log(`Proxying to:`);
  console.log(`  - User Service: ${USER_SERVICE_URL}`);
  console.log(`  - AI Service: ${AI_SERVICE_URL}`);
  console.log(`  - Comms Service: ${COMMS_SERVICE_URL}`);
  console.log(`  - Conversation Service: ${CONVERSATION_SERVICE_URL}`);
  console.log(`Security features enabled:`);
  console.log(`  - Rate limiting`);
  console.log(`  - JWT validation`);
  console.log(`  - Input sanitization`);
  console.log(`  - Security headers`);
  console.log(`  - Request tracking`);
});