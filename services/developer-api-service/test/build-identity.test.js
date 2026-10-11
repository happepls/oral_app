const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sourceIdentity, verifyImage } = require('../src/buildIdentity');

test('source identity detects old runtime code even with an unchanged deployment SHA', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'developer-build-'));
  try {
    fs.mkdirSync(path.join(root, 'src'));
    for (const file of ['package.json', 'package-lock.json']) fs.writeFileSync(path.join(root, file), '{}');
    fs.writeFileSync(path.join(root, 'src/app.js'), 'trusted headers');
    const expected = sourceIdentity(root);
    fs.writeFileSync(path.join(root, 'build-identity.json'), JSON.stringify(expected));
    assert.deepEqual(verifyImage(root), expected);
    fs.writeFileSync(path.join(root, 'src/app.js'), 'old code');
    assert.notDeepEqual(sourceIdentity(root), expected);
    assert.throws(() => verifyImage(root), /differs/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
