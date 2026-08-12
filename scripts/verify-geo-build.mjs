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
const rootMatch = html.match(/<div id="root">([\s\S]*?)<\/div>/);
requireMatch(rootMatch && rootMatch[1].trim() === '', 'React root must stay empty to prevent pre-hydration fallback flash');
const noScriptMatch = html.match(/<noscript>([\s\S]*?)<\/noscript>/);
requireMatch(noScriptMatch, 'no-JavaScript fallback content missing');
const noScript = noScriptMatch[1];
requireMatch(noScript.includes('GuaJi AI 是什么？') && noScript.includes('练习过程会记录什么？'), 'no-JavaScript fallback FAQ missing');
requireMatch(noScript.includes('按真实场景练习口语的 AI 语音伙伴'), 'no-JavaScript direct answer heading missing');

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
  requireMatch(noScript.includes(item.name), `FAQ question is missing from no-JavaScript fallback: ${item.name}`);
  requireMatch(noScript.includes(item.acceptedAnswer.text), `FAQ answer is missing from no-JavaScript fallback: ${item.name}`);
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
