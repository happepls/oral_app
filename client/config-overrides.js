module.exports = {
  webpack: function override(config, env) {
    return config;
  },
  devServer: function(configFunction) {
    return function(proxy, allowedHost) {
      const config = configFunction(proxy, allowedHost);
      config.allowedHosts = 'all';
      config.client = {
        ...(config.client || {}),
        webSocketURL: 'auto://0.0.0.0:0/ws',
      };
      // Allow Google OAuth popup postMessage
      config.headers = {
        ...(config.headers || {}),
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
      };
      return config;
    };
  },
};
