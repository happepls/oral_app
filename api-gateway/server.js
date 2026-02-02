const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8082';
const COMMS_SERVICE_URL = process.env.COMMS_SERVICE_URL || 'http://localhost:3003';
const CONVERSATION_SERVICE_URL = process.env.CONVERSATION_SERVICE_URL || 'http://localhost:8083';

// 代理中间件必须在express.json()之前，以保持原始请求体
app.use('/api/users', createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/users': '' },
  logLevel: 'debug'
}));

app.use('/api/ai', createProxyMiddleware({
  target: AI_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/ai': '' },
  logLevel: 'debug'
}));

app.use('/api/conversation', createProxyMiddleware({
  target: CONVERSATION_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/conversation': '' },
  logLevel: 'debug'
}));

app.use('/api/ws', createProxyMiddleware({
  target: COMMS_SERVICE_URL,
  changeOrigin: true,
  ws: true,
  logLevel: 'debug'
}));

// express.json() 放在代理之后，用于非代理的API
app.use(express.json());

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