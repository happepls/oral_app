const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();

// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'build')));

// Proxy API requests to the API Gateway
const apiGatewayUrl = process.env.API_GATEWAY || 'http://oral_app_api_gateway:80';
console.log('API Gateway URL:', apiGatewayUrl);

// WebSocket proxy for real-time communication
const wsProxy = createProxyMiddleware({
  target: apiGatewayUrl,
  changeOrigin: true,
  ws: true, // Enable WebSocket proxying
  pathRewrite: {
    '^/api/ws': '/api/ws' // Keep the /api/ws prefix as is
  },
  logLevel: 'debug',
  onProxyReqWs: (proxyReq, req, socket) => {
    console.log('Proxying WebSocket request:', req.url, '->', apiGatewayUrl + req.url);
  },
  onError: (err, req, res) => {
    console.error('WebSocket proxy error:', err.message, req.url);
  }
});

// Register WebSocket proxy FIRST, before general API proxy
app.use('/api/ws', wsProxy);

// General API proxy - remove duplicate
app.use('/api', createProxyMiddleware({
  target: apiGatewayUrl,
  changeOrigin: true,
  pathRewrite: {
    '^/api': '/api' // Keep the /api prefix as is
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log('Proxying API request:', req.method, req.url, '->', apiGatewayUrl + req.url);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('Received API response:', proxyRes.statusCode, req.url);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err.message, req.url);
    // Return a more informative error to the client
    res.status(500).json({ 
      error: 'Service temporarily unavailable', 
      message: 'Unable to connect to backend services. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}));

// For any route that doesn't match a static file or API route, serve the index.html
// This allows React Router to handle client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Client server running on port ${PORT}`);
  console.log(`API requests will be proxied to: ${apiGatewayUrl}`);
});