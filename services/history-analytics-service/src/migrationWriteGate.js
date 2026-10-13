'use strict';

/** Install before history routes. Operator endpoints require service authentication. */
function installMigrationWriteGate(app, { requireInternalService, env = process.env } = {}) {
  if (typeof requireInternalService !== 'function') throw new TypeError('Internal service authentication middleware is required');
  let paused = env.MONGO_WRITES_PAUSED === 'true';
  let activeWrites = 0;
  let uncertainWrites = 0;
  const state = () => ({ paused, active_writes: activeWrites, uncertain_writes: uncertainWrites, drained: activeWrites === 0 && uncertainWrites === 0 });

  app.get('/internal/migration/write-gate', requireInternalService, (req, res) => {
    res.json(state());
  });
  app.post('/internal/migration/write-gate', requireInternalService, (req, res) => {
    if (!req.body || typeof req.body.paused !== 'boolean') {
      return res.status(400).json({ success: false, message: 'paused must be a boolean' });
    }
    paused = req.body.paused;
    res.json(state());
  });

  app.use('/api/history', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (paused) {
      res.set('Retry-After', '30');
      return res.status(503).json({ success: false, code: 'HISTORY_WRITES_PAUSED', message: 'History writes temporarily paused for migration' });
    }
    activeWrites++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeWrites--;
      res.off('finish', release);
      res.off('close', abort);
    };
    const abort = () => {
      if (released) return;
      // An HTTP disconnect does not prove that its database write stopped.
      // Fail closed until an operator drains/stops the process before dumping.
      uncertainWrites++;
      release();
    };
    res.once('finish', release);
    res.once('close', abort);
    next();
  });
  return { getState: state };
}

module.exports = { installMigrationWriteGate };
