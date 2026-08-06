import fs from 'node:fs';
import path from 'node:path';

const buildDir = path.resolve(process.argv[2] || 'client/build');
const read = (name) => fs.readFileSync(path.join(buildDir, name), 'utf8');
const requireMatch = (condition, message) => {
  if (!condition) throw new Error(message);
};

const html = read('index.html');
const robots = read('robots.txt');
const sitemap = read('sitemap.xml');
const llms = read('llms.txt');

requireMatch(html.includes('<link rel="canonical" href="https://guajiguaji.top/"'), 'canonical homepage URL missing');
requireMatch(html.includes('property="og:title"') && html.includes('name="twitter:card"'), 'social metadata missing');
requireMatch(html.includes('GuaJi AI 是什么？') && html.includes('练习过程会记录什么？'), 'visible fallback FAQ missing');
requireMatch(html.includes('按真实场景练习口语的 AI 语音伙伴'), 'visible direct answer heading missing');

const schemaMatch = html.match(/<script id="homepage-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/);
requireMatch(schemaMatch, 'homepage JSON-LD missing');
const schema = JSON.parse(schemaMatch[1]);
const graph = schema['@graph'] || [];
for (const type of ['WebSite', 'Organization', 'SoftwareApplication', 'FAQPage']) {
  requireMatch(graph.some((item) => item['@type'] === type), `${type} schema missing`);
}
const faq = graph.find((item) => item['@type'] === 'FAQPage');
requireMatch(faq.mainEntity.length === 3, 'FAQ schema must contain exactly three visible questions');
for (const item of faq.mainEntity) {
  requireMatch(html.includes(item.name), `FAQ question is not visible: ${item.name}`);
  requireMatch(html.includes(item.acceptedAnswer.text), `FAQ answer is not visible: ${item.name}`);
}

requireMatch(robots.includes('Disallow: /api/') && robots.includes('Disallow: /login'), 'robots private-route rules missing');
requireMatch(robots.includes('Sitemap: https://guajiguaji.top/sitemap.xml'), 'robots sitemap declaration missing');
requireMatch((sitemap.match(/<loc>/g) || []).length === 1 && sitemap.includes('<loc>https://guajiguaji.top/</loc>'), 'sitemap must contain only the canonical homepage');
requireMatch(llms.includes('[GuaJi AI 首页](https://guajiguaji.top/)'), 'llms.txt canonical homepage missing');
requireMatch(!/https:\/\/guajiguaji\.top\/(login|register|api|discovery)/.test(llms), 'llms.txt exposes a private route');

const bundles = fs.readdirSync(path.join(buildDir, 'static', 'js')).filter((name) => name.endsWith('.js'));
const javascript = bundles.map((name) => read(path.join('static', 'js', name))).join('\n');
requireMatch(javascript.includes('noindex,nofollow'), 'private-route noindex behavior missing from build');

console.log('GEO build verification passed');
