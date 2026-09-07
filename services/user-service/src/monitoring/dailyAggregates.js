// Numeric-only telemetry. Never retain request URLs, headers, bodies or identities.
const crypto = require('node:crypto');
const fs = require('node:fs');
const DAY = 86400;
const MIN_COVERAGE = 1368; // 95% of 1440 minutes; exposed in every response.
const PATH = '/api/users/monitoring/daily';

function readMemoryUtilization(read = file => fs.readFileSync(file, 'utf8'), budget = Number(process.env.MONITOR_MEMORY_BUDGET_BYTES || 0)) {
  for (const [usagePath, limitPath] of [
    ['/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory.max'],
    ['/sys/fs/cgroup/memory/memory.usage_in_bytes', '/sys/fs/cgroup/memory/memory.limit_in_bytes']
  ]) {
    try {
      const usage = Number(read(usagePath).trim());
      const cgroupLimit = Number(read(limitPath).trim());
      const limit = Number.isSafeInteger(cgroupLimit) && cgroupLimit > 0 ? cgroupLimit : budget;
      if (Number.isSafeInteger(limit) && limit > 0 && Number.isFinite(usage) && usage >= 0) {
        return usage / limit;
      }
    } catch { /* Unavailable is not zero utilization; never substitute host RAM. */ }
  }
  return null;
}

function aggregateRows(rows, backupEpoch, now) {
  const end = Math.floor(now / DAY) * DAY;
  const windows = [{ count: 0, errors: 0, minutes: 0, peak: 0 }, { count: 0, errors: 0, minutes: 0, peak: 0 }];
  let latest = 0;
  for (const row of rows) {
    const minute = Number(row.minute_epoch);
    if (row.memory_utilization !== null) latest = Math.max(latest, minute);
    const index = minute >= end - DAY ? 0 : 1;
    if (minute >= end || minute < end - 2 * DAY) continue;
    const window = windows[index];
    window.count += Number(row.sample_count);
    window.errors += Number(row.five_xx_count);
    if (row.memory_utilization !== null) {
      window.minutes += 1;
      window.peak = Math.max(window.peak, Number(row.memory_utilization));
    }
  }
  const [current, previous] = windows;
  if (!Number.isFinite(backupEpoch) || backupEpoch <= 0 || backupEpoch > now ||
      latest > now || now - latest > 180 || current.minutes < MIN_COVERAGE || current.count === 0) {
    return null;
  }
  return {
    schema_version: 1,
    window_start_epoch: end - DAY,
    window_end_epoch: end,
    generated_at_epoch: now,
    source_last_observed_epoch: latest,
    observed_minutes: current.minutes,
    sample_count: current.count,
    five_xx_count: current.errors,
    five_xx_rate: current.errors / current.count,
    resource_utilization: current.peak,
    previous_observed_minutes: previous.minutes,
    previous_sample_count: previous.count,
    previous_five_xx_rate: previous.count ? previous.errors / previous.count : 0,
    previous_resource_utilization: previous.peak,
    previous_window_available: previous.minutes >= MIN_COVERAGE && previous.count > 0,
    backup_completed_at_epoch: backupEpoch,
    backup_age_hours: (now - backupEpoch) / 3600
  };
}

function createDailyMonitor({ db, token, clock = () => Math.floor(Date.now() / 1000), memory = readMemoryUtilization, timeoutMs = 5000 }) {
  let pending = new Map();
  let flushing = false;
  let cached = null;
  let inFlight = null;
  let lastCleanup = 0;
  const enabled = typeof token === 'string' && token.length >= 32;
  const digest = value => crypto.createHash('sha256').update(value).digest();
  const expected = digest(enabled ? token : 'disabled');

  function bucket(at) {
    const minute = Math.floor(at / 60) * 60;
    if (!pending.has(minute)) pending.set(minute, { count: 0, errors: 0, memory: null });
    return pending.get(minute);
  }

  function middleware(req, res, next) {
    const path = req.path.toLowerCase().replace(/\/+$/, '');
    if (enabled && path.startsWith('/api/') && ![PATH, '/api/health', '/api/users/health', '/api/users/sse'].includes(path)) {
      res.once('finish', () => {
        const current = bucket(clock());
        current.count += 1;
        if (res.statusCode >= 500) current.errors += 1;
      });
    }
    next();
  }

  async function flush() {
    if (!enabled || flushing) return;
    flushing = true;
    const now = clock();
    const current = bucket(now);
    current.memory = memory();
    const batch = pending;
    pending = new Map();
    try {
      // At most a few minute buckets; failed writes leave a coverage gap. Do not
      // retry ambiguous commits and accidentally duplicate request counts.
      for (const [minute, data] of batch) {
        await db.query(`INSERT INTO monitor_user_minutes
          (minute_epoch, sample_count, five_xx_count, memory_utilization) VALUES ($1,$2,$3,$4)
          ON CONFLICT (minute_epoch) DO UPDATE SET
          sample_count = monitor_user_minutes.sample_count + EXCLUDED.sample_count,
          five_xx_count = monitor_user_minutes.five_xx_count + EXCLUDED.five_xx_count,
          memory_utilization = GREATEST(monitor_user_minutes.memory_utilization, EXCLUDED.memory_utilization)`,
        [minute, data.count, data.errors, data.memory]);
      }
      if (now - lastCleanup >= 3600) {
        await db.query('DELETE FROM monitor_user_minutes WHERE minute_epoch < $1', [now - 4 * DAY]);
        lastCleanup = now;
      }
    } catch {
      // Constant message only: DB errors may include connection credentials.
      console.warn('[daily-monitor] sample persistence unavailable');
    } finally {
      flushing = false;
    }
  }

  async function read() {
    const now = clock();
    if (cached && now >= cached.generated_at_epoch && now - cached.generated_at_epoch < 30 &&
        Math.floor(now / DAY) === Math.floor(cached.generated_at_epoch / DAY)) return cached;
    if (!inFlight) {
      inFlight = (async () => {
        const end = Math.floor(now / DAY) * DAY;
        const [metrics, backup] = await Promise.all([
          db.query('SELECT * FROM monitor_user_minutes WHERE minute_epoch >= $1 AND minute_epoch <= $2 ORDER BY minute_epoch', [end - 2 * DAY, now]),
          db.query('SELECT EXTRACT(EPOCH FROM completed_at)::bigint AS epoch FROM monitor_backup_success WHERE singleton = TRUE')
        ]);
        cached = aggregateRows(metrics.rows, Number(backup.rows[0]?.epoch), now);
        return cached;
      })().finally(() => { inFlight = null; });
    }
    return inFlight;
  }

  async function handler(req, res) {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    if (!enabled) return res.status(503).json({ available: false });
    const header = req.get('authorization') || '';
    if (!header.startsWith('Bearer ') || !crypto.timingSafeEqual(digest(header.slice(7)), expected)) {
      return res.status(401).json({ authorized: false });
    }
    let timeout;
    try {
      const value = await Promise.race([
        read(),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('deadline')), timeoutMs); })
      ]);
      if (!value) return res.status(503).json({ available: false });
      return res.json(value);
    } catch {
      return res.status(503).json({ available: false });
    } finally {
      clearTimeout(timeout);
    }
  }

  function start() {
    if (!enabled) return null;
    void flush();
    const timer = setInterval(() => { void flush(); }, 60000);
    timer.unref();
    return timer;
  }
  return { middleware, handler, start, flush };
}

module.exports = { createDailyMonitor, aggregateRows, readMemoryUtilization, PATH };
