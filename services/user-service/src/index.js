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

const { runMigrations } = require('stripe-replit-sync');
const { getStripeSync } = require('./stripe/stripeClient');
const { WebhookHandlers } = require('./stripe/webhookHandlers');

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('DATABASE_URL not set, skipping Stripe initialization');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl, schema: 'stripe' });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();
    
    // If stripeSync is null, it means Stripe keys were not available
    if (!stripeSync) {
      console.log('Stripe not configured, skipping webhook and sync setup');
      return;
    }

    const replitDomains = process.env.REPLIT_DOMAINS;
    if (replitDomains) {
      console.log('Setting up managed webhook...');
      const webhookBaseUrl = `https://${replitDomains.split(',')[0]}`;
      try {
        const result = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
        if (result?.webhook?.url) {
          console.log(`Webhook configured: ${result.webhook.url}`);
        } else {
          console.log('Webhook setup completed (no URL returned)');
        }
      } catch (webhookError) {
        console.warn('Webhook setup failed, continuing without managed webhook:', webhookError.message);
      }
    } else {
      console.log('REPLIT_DOMAINS not set, skipping webhook setup');
    }

    console.log('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
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
app.use(generalRateLimiter); // Rate limiting
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
const stripeRoutes = require('./stripe/stripeRoutes');

app.use('/', userRoutes);
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

initStripe().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`User service listening on port ${PORT}`);
  });
});