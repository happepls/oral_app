async function databaseReady(connection, timeoutMs = 2000) {
  if (connection.readyState !== 1 || !connection.db) return false;
  let timer;
  try {
    await Promise.race([
      connection.db.command({ ping: 1 }, { maxTimeMS: timeoutMs }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); }),
    ]);
    return true;
  } catch (_) { return false; }
  finally { clearTimeout(timer); }
}

function installDatabaseReadiness(app, connection) {
  app.get('/ready', async (_req, res) => {
    const ready = await databaseReady(connection);
    res.set('Cache-Control', 'no-store');
    res.status(ready ? 200 : 503).json({ status: ready ? 'OK' : 'unavailable', database: ready ? 'connected' : 'unavailable' });
  });
}

module.exports = { databaseReady, installDatabaseReadiness };
