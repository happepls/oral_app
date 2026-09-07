import { act, renderHook, waitFor } from '@testing-library/react';
import usePricingCatalog, { REFERENCE_PRODUCTS, validProducts } from './usePricingCatalog';

const data = REFERENCE_PRODUCTS.map(p => ({ ...p, reference: false, prices: p.prices.map(price => ({ ...price, id: `price_${p.metadata.tier}` })) }));
const response = () => ({ ok: true, json: async () => ({ data }) });
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

test('rejects missing IDs, mismatched billing periods and malformed amounts', () => {
  expect(validProducts({ data: REFERENCE_PRODUCTS })).toEqual([]);
  expect(validProducts({ data })).toHaveLength(2);
  expect(validProducts({ data: [{ ...data[0], prices: [{ ...data[0].prices[0], unit_amount: '499' }] }] })).toEqual([]);
  expect(validProducts({ data: [{ ...data[0], prices: [{ ...data[0].prices[0], recurring: { interval: 'week', interval_count: 2 } }] }] })).toEqual([]);
});

test('recovers from a transient HTTP failure', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(response());
  const { result } = renderHook(() => usePricingCatalog());
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.unavailable).toBe(false);
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('bounded failure shows reference plans without checkout IDs; manual retry restores live prices', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() => usePricingCatalog());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(result.current.products.every(p => p.reference && !p.prices[0].id)).toBe(true);
  global.fetch.mockResolvedValue(response());
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.unavailable).toBe(false));
});

test('aborted old request cannot overwrite a newer result', async () => {
  let rejectOld;
  global.fetch = jest.fn().mockImplementationOnce(() => new Promise((resolve, reject) => { rejectOld = reject; })).mockResolvedValue(response());
  const { result } = renderHook(() => usePricingCatalog());
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.unavailable).toBe(false));
  await act(async () => rejectOld(new Error('aborted')));
  expect(result.current.unavailable).toBe(false);
});
