function membership(user, now = Date.now()) {
  if (!user) return user;
  if (!('subscription_status' in user) && !('stripe_subscription_status' in user) && !('prepaid_expires_at' in user)) return user;
  const subscriptionStatus = 'stripe_subscription_status' in user
    ? user.stripe_subscription_status || 'free' : user.subscription_status || 'free';
  const subscriptionActive = ['active', 'trialing'].includes(subscriptionStatus);
  const prepaidActive = new Date(user.prepaid_expires_at || 0).getTime() > now;
  return {
    ...user,
    stripe_subscription_status: subscriptionStatus,
    subscription_status: subscriptionActive || prepaidActive ? 'active'
      : ['past_due','unpaid'].includes(subscriptionStatus) ? 'past_due'
        : ['canceled','incomplete_expired'].includes(subscriptionStatus) ? 'canceled'
          : subscriptionStatus === 'paused' ? 'paused' : 'free',
    billing_source: subscriptionActive ? 'subscription' : prepaidActive ? 'prepaid' : null,
  };
}

function addTerm(date, tier) {
  const result = new Date(date);
  if (tier === 'weekly') return new Date(result.getTime() + 7 * 86400000);
  if (tier !== 'annual') throw new Error('Unknown membership term');
  const month = result.getUTCMonth();
  result.setUTCFullYear(result.getUTCFullYear() + 1);
  if (result.getUTCMonth() !== month) result.setUTCDate(0);
  return result;
}

function prepaidExpiry(orders) {
  let expiry = null;
  const ordered = [...orders].sort((a, b) =>
    new Date(a.paid_at) - new Date(b.paid_at) || String(a.id).localeCompare(String(b.id)));
  for (const order of ordered) {
    if (order.status !== 'fulfilled') continue;
    const start = Math.max(new Date(order.paid_at).getTime(), expiry?.getTime() || 0);
    expiry = addTerm(start, order.tier);
  }
  return expiry;
}

module.exports = { membership, addTerm, prepaidExpiry };
