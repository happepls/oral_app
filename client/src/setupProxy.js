const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const target = process.env.PROXY_TARGET || 'http://localhost:8080';
  
  // Explicit WebSocket Proxy
  app.use('/api/ws', createProxyMiddleware({
    target: target,
    changeOrigin: true,
    ws: true,
    logLevel: 'debug'
  }));
  
  // General API Proxy
  app.use('/api', createProxyMiddleware({
    target: target,
    changeOrigin: true,
    // ws: true, // Disable implicit ws here to avoid conflicts
  }));
};
