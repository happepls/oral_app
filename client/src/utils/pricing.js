const DEFAULT_USD_CNY_REFERENCE_RATE = 33.71 / 4.99;

export const USD_CNY_REFERENCE_RATE = (() => {
  const configuredRate = Number(process.env.REACT_APP_USD_CNY_REFERENCE_RATE);
  return Number.isFinite(configuredRate) && configuredRate > 0
    ? configuredRate
    : DEFAULT_USD_CNY_REFERENCE_RATE;
})();

export function formatMinorCurrency(unitAmount, currency, locale) {
  const safeCurrency = String(currency || 'usd').toUpperCase();
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: safeCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(unitAmount || 0) / 100);
}

// This is a display-only reference. Stripe's currency and unit_amount remain
// the source of truth for Checkout and are never converted client-side.
export function formatCnyReference(unitAmount, currency, locale) {
  if (String(currency || '').toLowerCase() !== 'usd') return null;
  const cnyMinorAmount = Math.round(Number(unitAmount || 0) * USD_CNY_REFERENCE_RATE);
  return formatMinorCurrency(cnyMinorAmount, 'cny', locale);
}
