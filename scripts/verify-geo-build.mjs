import fs from 'node:fs';
import path from 'node:path';

const buildDir = path.resolve(process.argv[2] || 'client/build');
const read = (name) => fs.readFileSync(path.join(buildDir, name), 'utf8');
const requireMatch = (condition, message) => {
  if (!condition) throw new Error(message);
};

const html = read('homepage.html');
const shell = read('index.html');
const robots = read('robots.txt');
const sitemap = read('sitemap.xml');
const llms = read('llms.txt');

requireMatch(html.includes('<link rel="canonical" href="https://guajiguaji.top/"'), 'canonical homepage URL missing');
requireMatch(html.includes('property="og:title"') && html.includes('name="twitter:card"'), 'social metadata missing');
const rootMatch = shell.match(/<div id="root">([\s\S]*?)<\/div>/);
requireMatch(rootMatch && rootMatch[1].trim() === '', 'React root must stay empty to prevent pre-hydration fallback flash');
requireMatch(shell.includes('content="noindex,nofollow"'), 'SPA shell must be noindex before React starts');
requireMatch(!shell.includes('type="application/ld+json"') && !shell.includes('<noscript>'), 'SPA shell exposes homepage schema or content');
requireMatch(!shell.includes('rel="canonical" href='), 'SPA shell must not declare a homepage canonical');
requireMatch(html.includes('data-prerendered-homepage="true"'), 'public homepage was not prerendered');
requireMatch(!html.includes('<noscript>'), 'homepage duplicates its prerendered content in noscript');
requireMatch(html.includes('Guaji AI（guajiguaji）') && html.includes('练习过程会记录什么？'), 'public brand introduction or FAQ missing');
requireMatch(html.includes('href="mailto:admin@guajiguaji.top"'), 'official contact link missing');
requireMatch(html.includes('href="/register"') && html.includes('href="/login"'), 'public navigation is not crawlable');
requireMatch(!/opacity:\s*0(?:[;"}])/.test(html), 'prerendered content is hidden by an initial animation');

const schemaMatch = html.match(/<script id="homepage-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/);
requireMatch(schemaMatch, 'homepage JSON-LD missing');
const schema = JSON.parse(schemaMatch[1]);
const graph = schema['@graph'] || [];
for (const type of ['WebSite', 'Organization', 'SoftwareApplication', 'FAQPage']) {
  requireMatch(graph.some((item) => item['@type'] === type), `${type} schema missing`);
}
const faq = graph.find((item) => item['@type'] === 'FAQPage');
requireMatch(faq.mainEntity.length === 3, 'FAQ schema must contain exactly three fallback questions');
for (const item of faq.mainEntity) {
  requireMatch(html.includes(item.name), `FAQ question is missing from public homepage: ${item.name}`);
  requireMatch(html.includes(item.acceptedAnswer.text), `FAQ answer is missing from public homepage: ${item.name}`);
}
const website = graph.find((item) => item['@type'] === 'WebSite');
requireMatch(website.alternateName.includes('guajiguaji') && website.alternateName.includes('Guaji'), 'brand aliases missing');
requireMatch(graph.find((item) => item['@type'] === 'Organization').email === 'admin@guajiguaji.top', 'organization contact missing');

// Verify that the deployed route allowlist covers every real React deep link.
// This catches drift when a new route is added without updating nginx.
const appSource = fs.readFileSync('client/src/App.js', 'utf8');
const routes = [...appSource.matchAll(/<Route path="([^"]+)"/g)]
  .map(match => match[1]).filter(route => route !== '/' && route !== '*');
for (const filename of ['client/client.nginx.conf', 'client/client.nginx.zeabur.conf', 'client/nginx.prod.conf']) {
  const config = fs.readFileSync(filename, 'utf8');
  requireMatch(config.includes('try_files /homepage.html =404;'), `${filename}: prerendered homepage routing missing`);
  requireMatch(config.includes('location = /homepage.html { internal; }'), `${filename}: duplicate homepage URL exposed`);
  requireMatch(!config.includes('try_files $uri $uri/ /index.html'), `${filename}: unknown URLs still fall back to homepage`);
  const pattern = config.match(/location ~ (\^\/\(welcome[^\s]+) \{/);
  requireMatch(pattern, `${filename}: SPA route allowlist missing`);
  const allowlist = new RegExp(pattern[1]);
  for (const route of routes) {
    requireMatch(allowlist.test(route.replace(':sessionId', 'test-session')), `${filename}: valid route ${route} is not served`);
  }
  requireMatch(!allowlist.test('/unknown-page') && !allowlist.test('/static/missing.js'), `${filename}: allowlist accepts unknown paths`);
}

requireMatch(robots.includes('Disallow: /api/') && robots.includes('Disallow: /login'), 'robots private-route rules missing');
requireMatch(robots.includes('Sitemap: https://guajiguaji.top/sitemap.xml'), 'robots sitemap declaration missing');
requireMatch((sitemap.match(/<loc>/g) || []).length === 1 && sitemap.includes('<loc>https://guajiguaji.top/</loc>'), 'sitemap must contain only the canonical homepage');
requireMatch(llms.includes('[Guaji AI 首页](https://guajiguaji.top/)'), 'llms.txt canonical homepage missing');
requireMatch(!/https:\/\/guajiguaji\.top\/(login|register|api|discovery)/.test(llms), 'llms.txt exposes a private route');

const bundles = fs.readdirSync(path.join(buildDir, 'static', 'js')).filter((name) => name.endsWith('.js'));
const javascript = bundles.map((name) => read(path.join('static', 'js', name))).join('\n');
requireMatch(javascript.includes('noindex,nofollow'), 'private-route noindex behavior missing from build');

console.log('GEO build verification passed');
