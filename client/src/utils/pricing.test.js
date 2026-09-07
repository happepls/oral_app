import {
  formatCnyReference,
  formatMinorCurrency,
  USD_CNY_REFERENCE_RATE,
  annualSavingPercent,
} from './pricing';

describe('pricing display helpers', () => {
  test('compares annual billing to 52 weekly payments, without claiming savings for reference prices', () => {
    const products = [
      { metadata: { tier: 'weekly' }, prices: [{ unit_amount: 499, currency: 'usd' }] },
      { metadata: { tier: 'annual' }, prices: [{ unit_amount: 9900, currency: 'usd' }] },
    ];
    expect(annualSavingPercent(products)).toBe(61);
    expect(annualSavingPercent(products.map(p => ({ ...p, reference: true })))).toBeNull();
    products[1].prices[0].currency = 'eur';
    expect(annualSavingPercent(products)).toBeNull();
  });
  test('keeps Stripe USD as the primary amount', () => {
    expect(formatMinorCurrency(499, 'usd', 'en-US')).toBe('$4.99');
  });

  test('converts USD 4.99 to the corrected CNY reference amount', () => {
    expect(USD_CNY_REFERENCE_RATE).toBeCloseTo(33.71 / 4.99, 6);
    expect(formatCnyReference(499, 'usd', 'zh-CN')).toBe('¥33.71');
  });

  test('does not add a conversion reference to non-USD prices', () => {
    expect(formatCnyReference(999, 'cny', 'zh-CN')).toBeNull();
  });
});
