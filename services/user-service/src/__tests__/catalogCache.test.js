const { createCatalogCache } = require('../stripe/catalogCache');

test('coalesces requests and refreshes after expiry', async () => {
  let time = 0;
  const load = jest.fn().mockResolvedValue([{ price_id: 'price_one' }]);
  const get = createCatalogCache(load, { ttlMs: 100, now: () => time });
  await Promise.all([get(), get(), get()]);
  await get();
  expect(load).toHaveBeenCalledTimes(1);
  time = 100;
  await get();
  expect(load).toHaveBeenCalledTimes(2);
});

test('does not serve expired data after failure and can recover', async () => {
  let time = 0;
  const rows = [{ price_id: 'price_one' }];
  const load = jest.fn().mockResolvedValueOnce(rows).mockRejectedValueOnce(new Error('upstream')).mockResolvedValueOnce(rows);
  const get = createCatalogCache(load, { ttlMs: 100, now: () => time });
  await get();
  time = 101;
  await expect(get()).rejects.toThrow('upstream');
  await expect(get()).resolves.toEqual(rows);
});

test('does not cache an empty catalog', async () => {
  const load = jest.fn().mockResolvedValue([]);
  const get = createCatalogCache(load);
  await get(); await get();
  expect(load).toHaveBeenCalledTimes(2);
});
