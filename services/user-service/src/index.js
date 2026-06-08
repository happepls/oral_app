require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const app = express();

// Import security middleware
const {
  securityHeaders,
  generalRateLimiter,
  mongoSanitize,
  xss,
  hpp,
  validateContentType,
  requestSizeLimiter
} = require('./middleware/securityMiddleware');

const { WebhookHandlers } = require('./stripe/webhookHandlers');

// Stripe now uses native SDK webhooks (no Replit sync / managed webhook).
// Products, prices and subscriptions are fetched live from the Stripe API,
// and webhook events update the users table directly. Nothing to bootstrap
// here beyond a config sanity check.
function initStripe() {
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) {
    console.log('Stripe configured (native SDK webhooks).');
  } else {
    console.warn('Stripe not fully configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET missing). Payments disabled.');
  }
}

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body, sig);
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(express.json());

// Apply security middleware
app.use(securityHeaders); // Security headers
app.use(cookieParser()); // Cookie parser for JWT cookies

// Rate limiting - skip for internal service communication
app.use((req, res, next) => {
  // Skip rate limiting for internal service communication
  const isInternalService =
    req.headers['x-internal-service'] === 'true' ||
    req.headers['user-agent']?.includes('node-fetch') ||
    req.headers['user-agent']?.includes('httpx') ||
    req.ip?.startsWith('172.') ||  // Docker internal network
    req.connection?.remoteAddress?.startsWith('172.') ||
    true; // TEMPORARY: Disable rate limiting for debugging

  if (isInternalService) {
    return next();
  }

  generalRateLimiter(req, res, next);
});

app.use(mongoSanitize()); // Prevent NoSQL injection
app.use(xss()); // Prevent XSS attacks
app.use(hpp()); // Prevent HTTP Parameter Pollution
app.use(validateContentType); // Validate content type
app.use(requestSizeLimiter('10mb')); // Limit request size

// Custom security middleware
app.use((req, res, next) => {
  // Remove sensitive headers
  res.removeHeader('X-Powered-By');
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  next();
});

// Error handling for malformed JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      code: 400,
      message: 'Invalid JSON format',
      data: null
    });
  }
  next(err);
});

const userRoutes = require('./routes/userRoutes');
const sseRoutes = require('./routes/sseRoutes');
const stripeRoutes = require('./stripe/stripeRoutes');
const redisClient = require('./utils/redisClient');

redisClient.connect().catch(err => console.warn('[user-service] Redis connect failed (SSE will be unavailable):', err.message));

app.use('/', userRoutes);
app.use('/', sseRoutes);
app.use('/api/stripe', stripeRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'user-service'
  });
});

app.get('/', (req, res) => {
  res.send('User Service is running');
});

const PORT = process.env.PORT || 3000;

// Start server immediately, don't wait for Stripe
app.listen(PORT, '0.0.0.0', () => {
  console.log(`User service listening on port ${PORT}`);
});

// Initialize Stripe in the background (non-blocking)
initStripe();