// Run the real nginx routing against the local production build, on an
// unprivileged port with isolated logs/pid. Does not start production services.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const client = path.resolve(__dirname, '..');
const artifacts = path.resolve(client, '../quality/artifacts/seo-nginx');
fs.mkdirSync(artifacts, { recursive: true });
const mimeTypes = ['/etc/nginx/mime.types', '/opt/homebrew/etc/nginx/mime.types', '/usr/local/etc/nginx/mime.types']
  .find(filename => fs.existsSync(filename));
if (!mimeTypes) throw new Error('Install nginx before running the production SEO tests');
const binary = process.env.NGINX_BINARY || 'nginx';
const names = process.argv.includes('--check')
  ? ['client.nginx.conf', 'client.nginx.zeabur.conf', 'nginx.prod.conf'] : ['client.nginx.zeabur.conf'];

for (const name of names) {
  const config = fs.readFileSync(path.join(client, name), 'utf8')
    .replace('worker_processes auto;', 'worker_processes 1;')
    .replace(/pid \/tmp\/nginx.pid;/, `pid "${artifacts}/${name}.pid";`)
    .replace(/listen 500[01];/, 'listen 4173;')
    .replace('/etc/nginx/mime.types', mimeTypes)
    .replace('root /usr/share/nginx/html;', `root "${client}/build";`)
    .replaceAll('http://api-gateway:80', 'http://127.0.0.1:9');
  const filename = path.join(artifacts, name);
  fs.writeFileSync(filename, config);
  const args = ['-p', `${artifacts}/`, '-c', filename];
  if (process.argv.includes('--check')) {
    const result = spawnSync(binary, [...args, '-t'], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  } else {
    const child = spawn(binary, [...args, '-g', 'daemon off;'], { stdio: 'inherit' });
    child.on('error', error => { console.error(error); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code || 0; });
    process.on('SIGINT', () => child.kill('SIGQUIT'));
    process.on('SIGTERM', () => child.kill('SIGQUIT'));
  }
}
