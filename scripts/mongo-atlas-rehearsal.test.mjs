import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { canonical, indexSignature, snapshot, compareSnapshots, settings, rehearse, decryptStream, restoreBackup, main } from './mongo-atlas-rehearsal.mjs';
const EJSON = { serialize: value => value };
const env = {
  SOURCE_MONGO_URI: 'mongodb://secret-source:password@source.invalid/source',
  TARGET_MONGO_URI: 'mongodb://secret-target:password@target.invalid/target',
  SOURCE_MONGO_DB: 'source', TARGET_MONGO_DB: 'target', MONGO_WRITES_PAUSED: 'true',
  MONGO_BACKUP_KEY: Buffer.alloc(32, 7).toString('base64')
};
function database(collections = []) {
  return {
    collections,
    command: async c => c.ping ? { ok: 1 } : c.buildInfo ? { version: '7.0' } : { collections: collections.length, objects: 1 },
    listCollections() { return { toArray: async () => this.collections.map(c => ({ name: c.name, type: 'collection', options: c.options || {} })) }; },
    collection(name) {
      const c = this.collections.find(c => c.name === name);
      return {
        find(query, options) {
          assert.equal(options.promoteValues, false);
          return { sort(sort) {
            assert.deepEqual(sort, { _id: 1 });
            return (async function* () { for (const doc of [...c.docs].sort((a, b) => a._id - b._id)) yield doc; })();
          } };
        },
        listIndexes: () => ({ toArray: async () => c.indexes || [{ key: { _id: 1 }, name: '_id_', v: 2 }] })
      };
    }
  };
}
const collection = () => ({ name: 'history', docs: [{ _id: 2, audio: 'cos://private', text: 'PRIVATE HISTORY' }, { _id: 1, text: 'older' }] });
test('canonical EJSON independent of property order; compound indexes retain order', () => {
  assert.equal(canonical({ z: 1, a: { d: 2, c: 1 } }, EJSON), canonical({ a: { c: 1, d: 2 }, z: 1 }, EJSON));
  assert.notEqual(indexSignature({ key: { a: 1, b: 1 } }, EJSON), indexSignature({ key: { b: 1, a: 1 } }, EJSON));
  assert.equal(indexSignature({ key: { a: 1 }, ns: 'source.history', v: 1, unique: true }, EJSON), indexSignature({ key: { a: 1 }, ns: 'target.history', v: 2, unique: true }, EJSON));
});
test('full digest detects changes beyond count and excludes message content', async () => {
  const source = database([collection()]), target = database([collection()]);
  const a = await snapshot(source, EJSON), b = await snapshot(target, EJSON);
  assert.equal(compareSnapshots(a, b), true);
  target.collections[0].docs[0].text = 'changed';
  assert.equal(compareSnapshots(a, await snapshot(target, EJSON)), false);
  assert.equal(JSON.stringify(a).includes('PRIVATE HISTORY'), false);
  target.collections[0].docs = source.collections[0].docs;
  target.collections[0].indexes = [{ key: { _id: 1 }, name: '_id_', unique: true }];
  assert.equal(compareSnapshots(a, await snapshot(target, EJSON)), false);
});
test('restricted statistics permissions do not mask mandatory connection check', async () => {
  const db = database([collection()]);
  db.command = async c => { if (c.ping) return { ok: 1 }; throw Error('denied'); };
  const s = await snapshot(db, EJSON);
  assert.equal(s.version, null); assert.equal(s.stats, null); assert.equal(s.collections[0].count, 2);
  db.command = async () => { throw Error('offline'); };
  await assert.rejects(snapshot(db, EJSON));
});
test('restore requires acknowledged pause, distinct safe database and exact key', () => {
  settings(env, 'rehearse');
  for (const change of [{ MONGO_WRITES_PAUSED: 'false' }, { TARGET_MONGO_DB: 'source' }, { TARGET_MONGO_DB: '*' }, { MONGO_BACKUP_KEY: 'invalid' }]) {
    assert.throws(() => settings({ ...env, ...change }, 'rehearse'), /MongoDB rehearsal failed/);
  }
});
test('fresh target guard rejects even an existing empty collection before subprocess', async () => {
  let called = false;
  await assert.rejects(rehearse(env, '/not-used', database([collection()]), database([{ name: 'history', docs: [] }]), EJSON, async () => { called = true; }), /fresh and empty/);
  assert.equal(called, false);
});
test('encrypted stream rehearsal preserves data; credentials absent from tool argv', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mongo-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'backup.enc');
  const source = database([collection()]), target = database();
  let sourceConfig, targetConfig, calls = 0;
  const archive = Buffer.from('PRIVATE HISTORY BINARY ARCHIVE');
  const run = async (cmd, args, input, output) => {
    calls++;
    assert.equal(args.join(' ').includes('password'), false);
    assert.equal(args.includes('--drop'), false);
    const config = args[args.indexOf('--config') + 1];
    assert.equal((await fs.stat(config)).mode & 0o777, 0o600);
    assert.equal(await fs.readFile(config, 'utf8'), `uri: ${JSON.stringify(cmd === 'mongodump' ? env.SOURCE_MONGO_URI : env.TARGET_MONGO_URI)}\n`);
    if (cmd === 'mongodump') {
      sourceConfig = config;
      await pipeline(Readable.from([archive]), output);
    } else {
      targetConfig = config;
      assert.equal(args[args.indexOf('--nsFrom') + 1], 'source.*');
      assert.equal(args[args.indexOf('--nsTo') + 1], 'target.*');
      const chunks = [];
      for await (const chunk of input) chunks.push(chunk);
      assert.deepEqual(Buffer.concat(chunks), archive);
      target.collections.push(collection());
    }
  };
  const result = await rehearse(env, file, source, target, EJSON, run);
  assert.equal(calls, 2); assert.equal(result.matches, true); assert.equal(result.sourceStable, true);
  const encrypted = await fs.readFile(file);
  assert.equal(encrypted.includes(archive), false);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  await assert.rejects(fs.stat(sourceConfig)); await assert.rejects(fs.stat(targetConfig));
  encrypted[22] ^= 1;
  await fs.writeFile(file, encrypted);
  await assert.rejects(pipeline(await decryptStream(file, Buffer.from(env.MONGO_BACKUP_KEY, 'base64')), new Writable({ write(c, e, cb) { void c; void e; cb(); } })));
});
test('failed dump removes partial backup and credentials without exposing errors', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mongo-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'backup.enc');
  let config;
  await assert.rejects(rehearse(env, file, database([collection()]), database(), EJSON, async (cmd, args) => {
    config = args[args.indexOf('--config') + 1];
    throw Error(env.SOURCE_MONGO_URI);
  }), error => !error.message.includes('password') && error.message.includes('mongodump'));
  await assert.rejects(fs.stat(file)); await assert.rejects(fs.stat(config));
});
test('source mutation during acknowledged pause invalidates rehearsal', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mongo-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = database([collection()]), target = database();
  await assert.rejects(rehearse(env, path.join(dir, 'backup.enc'), source, target, EJSON, async (cmd, args, input, output) => {
    if (output) await pipeline(Readable.from(['archive']), output);
    else {
      for await (const chunk of input) { void chunk; }
      target.collections.push(collection());
      source.collections[0].docs.push({ _id: 3, text: 'late write' });
    }
  }), /source changed during write pause/);
});

async function savedBackup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mongo-restore-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'saved.enc');
  const magic = Buffer.from('ORALMG01'), nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(env.MONGO_BACKUP_KEY, 'base64'), nonce);
  cipher.setAAD(magic);
  const plaintext = Buffer.from('PRIVATE SAVED MONGO ARCHIVE');
  await fs.writeFile(file, Buffer.concat([magic, nonce, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]), { mode: 0o600 });
  return { file, plaintext };
}
test('saved backup restore works without source cluster and preserves backup', async t => {
  const { file, plaintext } = await savedBackup(t);
  const original = await fs.readFile(file);
  const { SOURCE_MONGO_URI, ...offlineEnv } = env;
  void SOURCE_MONGO_URI;
  settings(offlineEnv, 'restore');
  const target = database();
  let connections = 0, closed = false, config;
  const driver = {
    EJSON,
    MongoClient: class {
      constructor(uri) { assert.equal(uri, env.TARGET_MONGO_URI); connections++; }
      async connect() {}
      db(name) { assert.equal(name, env.TARGET_MONGO_DB); return target; }
      async close() { closed = true; }
    },
    runTool: async (cmd, args, input, output) => {
      assert.equal(cmd, 'mongorestore'); assert.equal(output, null);
      assert.equal(args.includes('--drop'), false);
      assert.equal(args.join(' ').includes('password'), false);
      assert.equal(args[args.indexOf('--nsInclude') + 1], 'source.*');
      assert.equal(args[args.indexOf('--nsFrom') + 1], 'source.*');
      assert.equal(args[args.indexOf('--nsTo') + 1], 'target.*');
      config = args[args.indexOf('--config') + 1];
      assert.equal((await fs.stat(config)).mode & 0o777, 0o600);
      // Mutating operator-supplied archive after authentication cannot affect private copy.
      await fs.writeFile(file, 'changed externally');
      const chunks = [];
      for await (const chunk of input) chunks.push(chunk);
      assert.deepEqual(Buffer.concat(chunks), plaintext);
      target.collections.push(collection());
    }
  };
  const report = await main(['restore', '--backup', file], offlineEnv, driver);
  assert.equal(connections, 1); assert.equal(closed, true);
  assert.equal(report.archiveAuthenticated, true);
  assert.equal(report.target.collections[0].count, 2);
  assert.equal(report.encryptedBackupBytes, original.length);
  await assert.rejects(fs.stat(config));
  assert.equal(await fs.readFile(file, 'utf8'), 'changed externally');
});
test('wrong key and tampered backups never execute restore', async t => {
  const { file } = await savedBackup(t);
  let invoked = 0;
  const run = async () => { invoked++; };
  await assert.rejects(restoreBackup({ ...env, MONGO_BACKUP_KEY: Buffer.alloc(32, 8).toString('base64') }, file, database(), EJSON, run), /archive authentication/);
  const bytes = await fs.readFile(file);
  bytes[21] ^= 1;
  await fs.writeFile(file, bytes);
  await assert.rejects(restoreBackup(env, file, database(), EJSON, run), /archive authentication/);
  assert.equal(invoked, 0);
  assert.deepEqual(await fs.readFile(file), bytes);
});
test('saved restore rejects existing targets and unsafe namespace without mutation', async t => {
  const { file } = await savedBackup(t);
  let invoked = 0;
  const run = async () => { invoked++; };
  await assert.rejects(restoreBackup(env, file, database([collection()]), EJSON, run), /fresh and empty/);
  await assert.rejects(restoreBackup({ ...env, TARGET_MONGO_DB: env.SOURCE_MONGO_DB }, file, database(), EJSON, run), /distinct target/);
  await assert.rejects(restoreBackup({ ...env, MONGO_WRITES_PAUSED: 'false' }, file, database(), EJSON, run), /write pause/);
  assert.equal(invoked, 0);
});
