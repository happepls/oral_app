// Cache only successful, nonempty public catalogs. Never serve expired prices.
function createCatalogCache(load, { ttlMs = 60000, now = Date.now } = {}) {
  let value;
  let expiresAt = 0;
  let pending;
  return async () => {
    if (value && now() < expiresAt) return value;
    if (!pending) {
      pending = Promise.resolve().then(load).then(rows => {
        if (rows.length && rows.some(row => row.price_id)) {
          value = rows;
          expiresAt = now() + ttlMs;
        }
        return rows;
      }).finally(() => { pending = null; });
    }
    return pending;
  };
}
module.exports = { createCatalogCache };
