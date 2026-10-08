const { membership, prepaidExpiry, addTerm } = require('../stripe/membership');

test('prepaid expiry is enforced even when stored combined status is active', () => {
  const user = { subscription_status: 'active', stripe_subscription_status: 'free', prepaid_expires_at: '2026-10-07T12:00:00Z' };
  expect(membership(user, Date.parse('2026-10-07T11:59:59Z')).billing_source).toBe('prepaid');
  expect(membership(user, Date.parse('2026-10-07T12:00:00Z')).subscription_status).toBe('free');
  expect(membership({ ...user, stripe_subscription_status: 'active' }, Date.parse('2027-01-01')).subscription_status).toBe('active');
  expect(membership({ subscription_status: 'active' }).subscription_status).toBe('active');
  expect(membership({ ...user, stripe_subscription_status: null }, Date.parse('2027-01-01')).subscription_status).toBe('free');
});

test('annual leap day clamps and weekly terms use exact UTC durations', () => {
  expect(addTerm('2024-02-29T12:34:56Z', 'annual').toISOString()).toBe('2025-02-28T12:34:56.000Z');
  expect(addTerm('2026-12-29T12:34:56Z', 'weekly').toISOString()).toBe('2027-01-05T12:34:56.000Z');
});

test('ledger ignores refunds and recomputes deterministically after out-of-order fulfillment', () => {
  const orders = [{ id: 'b', paid_at: '2026-10-08T00:00:00Z', tier: 'weekly', status: 'fulfilled' },
    { id: 'a', paid_at: '2026-10-07T00:00:00Z', tier: 'weekly', status: 'fulfilled' }];
  expect(prepaidExpiry(orders).toISOString()).toBe('2026-10-21T00:00:00.000Z');
  expect(prepaidExpiry([...orders].reverse())).toEqual(prepaidExpiry(orders));
  expect(prepaidExpiry([{ ...orders[0], status: 'refunded' }, orders[1]]).toISOString()).toBe('2026-10-14T00:00:00.000Z');
});
