import { useCallback, useEffect, useState } from 'react';

export const REFERENCE_PRODUCTS = [
  { id: 'reference-weekly', metadata: { tier: 'weekly' }, reference: true,
    prices: [{ unit_amount: 499, currency: 'usd', recurring: { interval: 'week', interval_count: 1 } }] },
  { id: 'reference-annual', metadata: { tier: 'annual' }, reference: true,
    prices: [{ unit_amount: 9900, currency: 'usd', recurring: { interval: 'year', interval_count: 1 } }] },
];

export function validProducts(payload) {
  return REFERENCE_PRODUCTS.map(({ metadata }) => {
    const interval = metadata.tier === 'weekly' ? 'week' : 'year';
    for (const product of Array.isArray(payload?.data) ? payload.data : []) {
      if (product.metadata?.tier !== metadata.tier || product.active === false) continue;
      const price = product.prices?.find(p => p.id && p.active !== false &&
        Number.isSafeInteger(p.unit_amount) && p.unit_amount > 0 &&
        /^[a-z]{3}$/i.test(p.currency || '') && p.recurring?.interval === interval &&
        (p.recurring.interval_count ?? 1) === 1);
      if (price) return { ...product, prices: [price], reference: false };
    }
    return null;
  }).filter(Boolean);
}

// Each mounted consumer owns cancellation. Late failures cannot clear a newer result.
export default function usePricingCatalog() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ products: [], loading: true });
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    let active = true;
    let controller;
    let timeout;
    setState({ products: [], loading: true });
    (async () => {
      let products = [];
      for (let n = 0; n < 2 && active; n += 1) {
        controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(`${process.env.REACT_APP_API_URL || '/api'}/stripe/products-with-prices`, {
            signal: controller.signal, credentials: 'include',
          });
          if (!response.ok) throw new Error('Catalog unavailable');
          products = validProducts(await response.json());
          if (products.length === 2) break;
        } catch {
          // A bounded second attempt handles transient upstream errors.
        } finally {
          clearTimeout(timeout);
        }
      }
      if (active) setState({ products, loading: false });
    })();
    return () => { active = false; clearTimeout(timeout); controller?.abort(); };
  }, [attempt]);
  const products = REFERENCE_PRODUCTS.map(reference =>
    state.products.find(p => p.metadata.tier === reference.metadata.tier) || reference);
  return { products, loading: state.loading, unavailable: products.some(p => p.reference), retry };
}
