import {
  formatCnyReference,
  formatMinorCurrency,
  USD_CNY_REFERENCE_RATE,
} from './pricing';

describe('pricing display helpers', () => {
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
