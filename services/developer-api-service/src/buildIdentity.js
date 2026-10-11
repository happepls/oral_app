const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Content identity works even when a monorepo build context has no .git or SHA.
function sourceIdentity(root = path.resolve(__dirname, '..')) {
  const files = ['package.json', 'package-lock.json'];
  function walk(directory) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const name = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) files.push(name);
    }
  }
  walk('src');
  const hash = crypto.createHash('sha256');
  for (const name of files.sort()) {
    hash.update(name).update('\0').update(fs.readFileSync(path.join(root, name))).update('\0');
  }
  return { source_sha256: hash.digest('hex') };
}

function verifyImage(root = path.resolve(__dirname, '..')) {
  const actual = sourceIdentity(root);
  const manifest = path.join(root, 'build-identity.json');
  if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).source_sha256 !== actual.source_sha256) {
    throw new Error('Image source differs from its build manifest');
  }
  return actual;
}

async function main() {
  const identity = verifyImage();
  if (process.argv[2] === '--write') {
    fs.writeFileSync(path.resolve(__dirname, '../build-identity.json'), `${JSON.stringify(identity)}\n`);
  } else if (process.argv[2] === '--compare') {
    const response = await fetch(process.argv[3], { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Health request failed: ${response.status}`);
    const health = await response.json();
    if (health.service !== 'developer-api-service' || health.build?.source_sha256 !== identity.source_sha256) {
      throw new Error('Running source differs from the expected checkout');
    }
    console.log('Running source matches expected checkout');
  } else console.log(JSON.stringify(identity));
}
if (require.main === module) main().catch(err => { console.error(err.message); process.exitCode = 1; });
module.exports = { sourceIdentity, verifyImage };
