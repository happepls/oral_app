// Reuse CRA's compiler and the real Landing component; no browser or network
// access is needed to build the public homepage.
const fs = require('node:fs');
const path = require('node:path');
const webpack = require('webpack');

const client = path.resolve(__dirname, '..');
const build = path.join(client, 'build');
const renderer = path.join(build, '.homepage-renderer.cjs');

async function main() {
  process.env.BABEL_ENV = 'production';
  process.env.NODE_ENV = 'production';
  const compiler = webpack({
    mode: 'production',
    target: 'node',
    context: client,
    entry: path.join(__dirname, 'render-homepage.js'),
    output: { path: build, filename: path.basename(renderer), library: { type: 'commonjs2' } },
    optimization: { minimize: false },
    resolve: { extensions: ['.js', '.json'] },
    // Resolve browser dependencies from client/node_modules at render time.
    externals: [({ request }, callback) => {
      if (request && !request.startsWith('.') && !path.isAbsolute(request)) {
        callback(null, `commonjs ${request}`);
      } else callback();
    }],
    module: { rules: [{
      test: /\.js$/,
      exclude: /node_modules/,
      loader: require.resolve('babel-loader'),
      options: { babelrc: false, configFile: false, presets: [require.resolve('babel-preset-react-app')] },
    }] },
  });
  try {
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      if (error) reject(error);
      else if (stats.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })));
      else resolve();
    }));
    const markup = await require(renderer).default();
    if (!markup.includes('mailto:admin@guajiguaji.top') || !markup.includes('guajiguaji')) {
      throw new Error('Public homepage content is incomplete');
    }
    const template = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
    if (!template.includes('<div id="root"></div>')) throw new Error('Unexpected CRA entrypoint');
    const withoutFallback = template.replace(/<noscript>[\s\S]*?<\/noscript>/, '');
    const homepage = withoutFallback.replace('<div id="root"></div>',
      `<div id="root" data-prerendered-homepage="true">${markup}</div>`);
    // Keep the metadata nodes so PageMetadata can restore them on client-side
    // navigation to /. The shell is never indexable before React starts.
    const shell = withoutFallback
      .replace('content="index,follow"', 'content="noindex,nofollow"')
      .replace(/(<link rel="canonical") href="[^"]*"/, '$1')
      .replace('id="homepage-structured-data" type="application/ld+json"',
        'id="homepage-structured-data" type="application/json"');
    fs.writeFileSync(path.join(build, 'homepage.html'), homepage);
    fs.writeFileSync(path.join(build, 'index.html'), shell);
    console.log('Prerendered public homepage; kept a separate noindex SPA shell.');
  } finally {
    await new Promise(resolve => compiler.close(resolve));
    fs.rmSync(renderer, { force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
