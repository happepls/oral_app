const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:3002';
const COMMS_SERVICE_URL = process.env.COMMS_SERVICE_URL || 'http://localhost:3003';

app.use('/api/auth', createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  logLevel: 'debug'
}));

app.use('/api/user', createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  logLevel: 'debug'
}));

app.use('/api/ai', createProxyMiddleware({
  target: AI_SERVICE_URL,
  changeOrigin: true,
  logLevel: 'debug'
}));

app.use('/api/conversation', createProxyMiddleware({
  target: COMMS_SERVICE_URL,
  changeOrigin: true,
  logLevel: 'debug'
}));

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'api-gateway',
    timestamp: new Date().toISOString()
  });
});

app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'API endpoint not found' 
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`Proxying to:`);
  console.log(`  - User Service: ${USER_SERVICE_URL}`);
  console.log(`  - AI Service: ${AI_SERVICE_URL}`);
  console.log(`  - Comms Service: ${COMMS_SERVICE_URL}`);
});
