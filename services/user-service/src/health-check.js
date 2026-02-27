const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');

// Import your existing routes
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(compression());

// Enable CORS
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: 'User service is running'
  });
});

// Metrics endpoint for Prometheus
app.get('/metrics', (req, res) => {
  const metrics = [
    `# HELP nodejs_uptime_seconds Uptime of the Node.js process`,
    `# TYPE nodejs_uptime_seconds gauge`,
    `nodejs_uptime_seconds ${process.uptime()}`,
    `# HELP nodejs_memory_rss_bytes Resident Set Size memory',
    `# TYPE nodejs_memory_rss_bytes gauge`,
    `nodejs_memory_rss_bytes ${process.memoryUsage().rss}`,
    `# HELP nodejs_heap_total_bytes Total heap size',
    `# TYPE nodejs_heap_total_bytes gauge`,
    `nodejs_heap_total_bytes ${process.memoryUsage().heapTotal}`,
    `# HELP nodejs_heap_used_bytes Used heap size',
    `# TYPE nodejs_heap_used_bytes gauge`,
    `nodejs_heap_used_bytes ${process.memoryUsage().heapUsed}`
  ];
  
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(metrics.join('\n'));
});

// API routes
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`User service listening at http://localhost:${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
});