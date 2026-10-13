const test = require('node:test');
const assert = require('node:assert/strict');
const { databaseReady } = require('../src/databaseReadiness');

test('connected driver without successful database ping is not ready', async () => {
  assert.equal(await databaseReady({ readyState: 0 }), false);
  assert.equal(await databaseReady({ readyState: 1, db: { command: async () => { throw Error('credential'); } } }), false);
  assert.equal(await databaseReady({ readyState: 1, db: { command: () => new Promise(() => {}) } }, 10), false);
  assert.equal(await databaseReady({ readyState: 1, db: { command: async command => { assert.deepEqual(command, { ping: 1 }); } } }), true);
});
