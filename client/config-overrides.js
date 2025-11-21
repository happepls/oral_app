module.exports = function override(config, env) {
  if (env === 'development') {
    config.devServer = {
      ...config.devServer,
      allowedHosts: 'all',
      client: {
        webSocketURL: 'auto://0.0.0.0:0/ws',
      },
    };
  }
  return config;
};
