const path = require('path');

module.exports = function override(config, env) {
  // Development server optimizations
  if (env === 'development') {
    config.devServer = {
      ...config.devServer,
      allowedHosts: 'all',
      client: {
        webSocketURL: 'auto://0.0.0.0:0/ws',
      },
      // Faster hot reload
      hot: true,
      liveReload: false,
    };
  }

  // Production build optimizations
  if (env === 'production') {
    // Enable persistent caching for faster rebuilds
    config.cache = {
      type: 'filesystem',
      cacheDirectory: path.resolve(__dirname, 'node_modules/.cache/webpack'),
      store: 'pack',
      buildDependencies: {
        config: [__filename],
        tsconfig: [path.resolve(__dirname, 'tsconfig.json')],
      },
    };

    // Optimize bundle splitting
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
          reuseExistingChunk: true,
          enforce: true,
        },
        common: {
          name: 'common',
          minChunks: 2,
          priority: 5,
          reuseExistingChunk: true,
          enforce: true,
        },
      },
    };

    // Enable parallelization
    config.parallelism = require('os').cpus().length;

    // Optimize module resolution
    config.resolve.modules = [
      path.resolve(__dirname, 'src'),
      'node_modules',
    ];

    // Add production-specific plugins
    const webpack = require('webpack');
    config.plugins.push(
      new webpack.optimize.AggressiveMergingPlugin(),
      new webpack.optimize.ModuleConcatenationPlugin()
    );
  }

  // Common optimizations
  config.resolve.extensions = ['.js', '.jsx', '.json'];
  
  // Optimize source maps for faster builds
  config.devtool = env === 'production' ? 'source-map' : 'eval-cheap-module-source-map';

  return config;
};