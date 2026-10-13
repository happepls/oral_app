#!/usr/bin/env node
// Offline operator tool. Never switches application configuration or removes databases.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
const filename = fileURLToPath(import.meta.url);
const MAGIC = Buffer.from('ORALMG01');

function safeError(stage) {
  const error = new Error(`MongoDB rehearsal failed at ${stage}; details suppressed.`);
  error.sanitized = true;
  return error;
}
function loadDriver() {
  const requireHistory = createRequire(path.resolve(path.dirname(filename), '../services/history-analytics-service/package.json'));
  const mongoose = requireHistory('mongoose');
  return { MongoClient: mongoose.mongo.MongoClient, EJSON: mongoose.mongo.BSON.EJSON };
}
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, ordered(value[k])]));
  return value;
}
function canonical(value, EJSON) { return JSON.stringify(ordered(EJSON.serialize(value, { relaxed: false }))); }
function indexSignature(index, EJSON) {
  const options = { ...index };
  delete options.ns;
  delete options.v;
  delete options.key;
  // Compound index key order is meaningful, unlike option/document property order.
  return canonical({ key: Object.entries(index.key), ...options }, EJSON);
}
async function snapshot(db, EJSON) {
  const started = Date.now();
  await db.command({ ping: 1 });
  const pingMs = Date.now() - started;
  let version = null, stats = null;
  try { version = (await db.command({ buildInfo: 1 })).version; } catch { /* restricted account */ }
  try {
    const s = await db.command({ dbStats: 1 });
    stats = Object.fromEntries(['collections', 'objects', 'dataSize', 'storageSize', 'indexSize'].map(k => [k, s[k]]));
  } catch { /* restricted account */ }
  const collections = [];
  for (const info of (await db.listCollections({}, { nameOnly: false }).toArray()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (info.type !== 'collection') throw safeError('unsupported collection type');
    const coll = db.collection(info.name);
    const digest = crypto.createHash('sha256');
    let count = 0;
    for await (const doc of coll.find({}, { promoteValues: false }).sort({ _id: 1 })) {
      const encoded = canonical(doc, EJSON);
      digest.update(`${Buffer.byteLength(encoded)}:`).update(encoded);
      count++;
    }
    const indexes = (await coll.listIndexes().toArray()).map(i => indexSignature(i, EJSON)).sort();
    collections.push({ name: info.name, count, sha256: digest.digest('hex'), indexes, options: canonical(info.options || {}, EJSON) });
  }
  return { pingMs, version, stats, collections, elapsedMs: Date.now() - started };
}
function compareSnapshots(source, target) {
  return JSON.stringify(source.collections) === JSON.stringify(target.collections);
}
function settings(env, mode) {
  if (!['inspect', 'compare', 'rehearse', 'restore'].includes(mode)) throw safeError('mode validation');
  for (const name of ['SOURCE_MONGO_DB', ...(mode === 'restore' ? [] : ['SOURCE_MONGO_URI']), ...(mode === 'inspect' ? [] : ['TARGET_MONGO_URI', 'TARGET_MONGO_DB'])]) {
    if (!env[name]) throw safeError('environment validation');
  }
  for (const name of ['SOURCE_MONGO_DB', ...(mode === 'inspect' ? [] : ['TARGET_MONGO_DB'])]) {
    // No wildcard namespace, special/internal DB, or shell-like input.
    if (!/^[a-zA-Z0-9_-]+$/.test(env[name]) || ['admin', 'local', 'config'].includes(env[name])) throw safeError('database validation');
  }
  if (['rehearse', 'restore'].includes(mode)) {
    if (env.SOURCE_MONGO_DB === env.TARGET_MONGO_DB) throw safeError('distinct target database validation');
    if (env.MONGO_WRITES_PAUSED !== 'true') throw safeError('write pause acknowledgment');
    if (!/^[A-Za-z0-9+/]{43}=$/.test(env.MONGO_BACKUP_KEY || '') || Buffer.from(env.MONGO_BACKUP_KEY, 'base64').length !== 32) throw safeError('backup key validation');
  }
}
function tool(command, args, input, output) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: [input ? 'pipe' : 'ignore', output ? 'pipe' : 'ignore', 'ignore'], env: { PATH: process.env.PATH, HOME: process.env.HOME } });
    const completed = new Promise((yes, no) => {
      child.once('error', () => no(safeError(command)));
      child.once('close', code => code === 0 ? yes() : no(safeError(command)));
    });
    const streams = [];
    if (input) streams.push(pipeline(input, child.stdin));
    if (output) streams.push(pipeline(child.stdout, output));
    Promise.all([completed, ...streams]).then(resolve, () => { child.kill(); reject(safeError(command)); });
  });
}
async function assertEmpty(db) {
  if ((await db.listCollections({}, { nameOnly: true }).toArray()).length) throw safeError('target must be fresh and empty');
}
async function decryptStream(file, key) {
  const handle = await fsp.open(file, 'r');
  try {
    const size = (await handle.stat()).size;
    if (size < 36) throw safeError('encrypted archive validation');
    const header = Buffer.alloc(20), tag = Buffer.alloc(16);
    await handle.read(header, 0, 20, 0);
    await handle.read(tag, 0, 16, size - 16);
    if (!header.subarray(0, 8).equals(MAGIC)) throw safeError('encrypted archive validation');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, header.subarray(8));
    decipher.setAAD(MAGIC);
    decipher.setAuthTag(tag);
    // Forward source stream errors into the stream consumed by pipeline.
    const source = fs.createReadStream(file, { start: 20, end: size - 17 });
    source.on('error', err => decipher.destroy(err));
    decipher.on('close', () => source.destroy());
    return source.pipe(decipher);
  } finally { await handle.close(); }
}
async function rehearse(env, backupPath, sourceDb, targetDb, EJSON, runTool = tool) {
  settings(env, 'rehearse');
  if (!backupPath) throw safeError('backup path validation');
  await assertEmpty(targetDb);
  const before = await snapshot(sourceDb, EJSON);
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'oral-mongo-'));
  const key = Buffer.from(env.MONGO_BACKUP_KEY, 'base64');
  const started = Date.now();
  let backupCreated = false, backupComplete = false;
  try {
    const sourceConfig = path.join(directory, 'source.yaml'), targetConfig = path.join(directory, 'target.yaml');
    await fsp.writeFile(sourceConfig, `uri: ${JSON.stringify(env.SOURCE_MONGO_URI)}\n`, { mode: 0o600, flag: 'wx' });
    await fsp.writeFile(targetConfig, `uri: ${JSON.stringify(env.TARGET_MONGO_URI)}\n`, { mode: 0o600, flag: 'wx' });
    // Exclusive create prevents overwriting any existing backup or following symlinks.
    const backup = await fsp.open(backupPath, 'wx', 0o600);
    backupCreated = true;
    const nonce = crypto.randomBytes(12);
    await backup.write(Buffer.concat([MAGIC, nonce]));
    await backup.close();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(MAGIC);
    const encryptedOutput = fs.createWriteStream(backupPath, { flags: 'a', mode: 0o600 });
    const encrypted = pipeline(cipher, encryptedOutput);
    // Observe rejection immediately while subprocess is running.
    encrypted.catch(() => {});
    try {
      await runTool('mongodump', ['--config', sourceConfig, '--db', env.SOURCE_MONGO_DB, '--archive', '--gzip', '--quiet'], null, cipher);
      await encrypted;
    } catch { cipher.destroy(); await encrypted.catch(() => {}); throw safeError('mongodump'); }
    await fsp.appendFile(backupPath, cipher.getAuthTag());
    backupComplete = true;
    const dumpMs = Date.now() - started;
    // Authenticate the entire backup before allowing any restore mutation.
    await pipeline(await decryptStream(backupPath, key), new Writable({ write(chunk, encoding, cb) { void chunk; void encoding; cb(); } }));
    await assertEmpty(targetDb);
    const restoreStart = Date.now();
    await runTool('mongorestore', ['--config', targetConfig, '--archive', '--gzip', '--nsInclude', `${env.SOURCE_MONGO_DB}.*`, '--nsFrom', `${env.SOURCE_MONGO_DB}.*`, '--nsTo', `${env.TARGET_MONGO_DB}.*`, '--stopOnError', '--quiet'], await decryptStream(backupPath, key), null);
    const restoreMs = Date.now() - restoreStart;
    const after = await snapshot(sourceDb, EJSON), target = await snapshot(targetDb, EJSON);
    const sourceStable = compareSnapshots(before, after), matches = compareSnapshots(before, target);
    if (!sourceStable || !matches) throw safeError(sourceStable ? 'data comparison' : 'source changed during write pause');
    return { mode: 'rehearse', source: before, target, sourceStable, matches, dumpMs, restoreMs, elapsedMs: Date.now() - started, encryptedBackupBytes: (await fsp.stat(backupPath)).size };
  } finally {
    key.fill(0);
    await fsp.rm(directory, { recursive: true, force: true });
    if (backupCreated && !backupComplete) await fsp.rm(backupPath, { force: true });
  }
}
async function restoreBackup(env, backupPath, targetDb, EJSON, runTool = tool) {
  settings(env, 'restore');
  if (!backupPath) throw safeError('backup path validation');
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'oral-mongo-restore-'));
  const key = Buffer.from(env.MONGO_BACKUP_KEY, 'base64');
  const started = Date.now();
  try {
    // Authenticate a private encrypted copy, so later changes to the supplied
    // backup cannot swap unverified content into the restore stream.
    const archive = path.join(directory, 'backup.enc');
    await fsp.copyFile(backupPath, archive, fs.constants.COPYFILE_EXCL);
    await fsp.chmod(archive, 0o600);
    try {
      await pipeline(await decryptStream(archive, key), new Writable({ write(chunk, encoding, cb) { void chunk; void encoding; cb(); } }));
    } catch { throw safeError('encrypted archive authentication'); }
    await assertEmpty(targetDb);
    const config = path.join(directory, 'target.yaml');
    await fsp.writeFile(config, `uri: ${JSON.stringify(env.TARGET_MONGO_URI)}\n`, { mode: 0o600, flag: 'wx' });
    const restoreStart = Date.now();
    await runTool('mongorestore', ['--config', config, '--archive', '--gzip', '--nsInclude', `${env.SOURCE_MONGO_DB}.*`, '--nsFrom', `${env.SOURCE_MONGO_DB}.*`, '--nsTo', `${env.TARGET_MONGO_DB}.*`, '--stopOnError', '--quiet'], await decryptStream(archive, key), null);
    const restoreMs = Date.now() - restoreStart;
    return { mode: 'restore', archiveAuthenticated: true, target: await snapshot(targetDb, EJSON), restoreMs, elapsedMs: Date.now() - started, encryptedBackupBytes: (await fsp.stat(archive)).size };
  } finally {
    key.fill(0);
    await fsp.rm(directory, { recursive: true, force: true });
  }
}
async function main(argv = process.argv.slice(2), env = process.env, driver) {
  const [mode, flag, backupPath] = argv;
  settings(env, mode);
  if (['rehearse', 'restore'].includes(mode) ? flag !== '--backup' || !backupPath || argv.length !== 3 : argv.length !== 1) throw safeError('arguments: inspect | compare | rehearse --backup FILE | restore --backup FILE');
  const { MongoClient, EJSON } = driver || loadDriver();
  const clients = [];
  try {
    if (mode === 'restore') {
      const targetClient = new MongoClient(env.TARGET_MONGO_URI, { serverSelectionTimeoutMS: 10000, promoteValues: false });
      clients.push(targetClient);
      await targetClient.connect();
      return await restoreBackup(env, backupPath, targetClient.db(env.TARGET_MONGO_DB), EJSON, driver?.runTool || tool);
    }
    const sourceClient = new MongoClient(env.SOURCE_MONGO_URI, { serverSelectionTimeoutMS: 10000, promoteValues: false });
    clients.push(sourceClient);
    await sourceClient.connect();
    const sourceDb = sourceClient.db(env.SOURCE_MONGO_DB);
    if (mode === 'inspect') return { mode, source: await snapshot(sourceDb, EJSON) };
    const targetClient = new MongoClient(env.TARGET_MONGO_URI, { serverSelectionTimeoutMS: 10000, promoteValues: false });
    clients.push(targetClient);
    await targetClient.connect();
    const targetDb = targetClient.db(env.TARGET_MONGO_DB);
    if (mode === 'rehearse') return await rehearse(env, backupPath, sourceDb, targetDb, EJSON);
    const source = await snapshot(sourceDb, EJSON), target = await snapshot(targetDb, EJSON);
    const matches = compareSnapshots(source, target);
    if (!matches) throw safeError('data comparison');
    return { mode, source, target, matches };
  } finally { await Promise.allSettled(clients.map(c => c.close())); }
}
export { canonical, indexSignature, snapshot, compareSnapshots, settings, assertEmpty, decryptStream, rehearse, restoreBackup, main };
if (process.argv[1] && path.resolve(process.argv[1]) === filename) main().then(report => {
  // Index specifications and collection validators may contain values; publish only their hashes.
  for (const db of [report.source, report.target].filter(Boolean)) db.collections = db.collections.map(({ indexes, options, ...c }) => ({ ...c, indexCount: indexes.length, indexesSha256: crypto.createHash('sha256').update(JSON.stringify(indexes)).digest('hex'), optionsSha256: crypto.createHash('sha256').update(options).digest('hex') }));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}).catch(error => {
  process.stderr.write(`${error.sanitized ? error.message : 'MongoDB rehearsal failed at connection or snapshot; details suppressed.'}\n`);
  process.exitCode = 1;
});
