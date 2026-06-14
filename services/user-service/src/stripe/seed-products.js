const { getUncachableStripeClient } = require('./stripeClient');

// Target catalog. Stripe prices are immutable: if a product already exists with
// a price at a different amount, we create a NEW price and archive the old one
// so the active price always reflects these values.
const CATALOG = [
  {
    tier: 'weekly',
    product: {
      name: 'Guaji AI Weekly',
      description: '每周订阅，解锁所有高级功能，无限AI对话练习',
      metadata: {
        app: 'guaji_ai',
        tier: 'weekly',
        features: 'unlimited_conversations,all_scenarios,priority_support',
      },
    },
    price: {
      unit_amount: 499, // $4.99/week
      currency: 'usd',
      recurring: { interval: 'week' },
      metadata: { tier: 'weekly', display_name: '周订阅' },
    },
  },
  {
    tier: 'annual',
    product: {
      name: 'Guaji AI Annual',
      description: '年度订阅，最划算的选择！解锁所有高级功能，无限AI对话练习',
      metadata: {
        app: 'guaji_ai',
        tier: 'annual',
        features: 'unlimited_conversations,all_scenarios,priority_support,early_access',
      },
    },
    price: {
      unit_amount: 9900, // $99/year
      currency: 'usd',
      recurring: { interval: 'year' },
      metadata: { tier: 'annual', display_name: '年订阅' },
    },
  },
];

async function findProductByTier(stripe, tier) {
  const res = await stripe.products.search({
    query: `metadata['app']:'guaji_ai' AND metadata['tier']:'${tier}'`,
  });
  return res.data[0] || null;
}

async function ensurePrice(stripe, product, priceSpec) {
  const existing = await stripe.prices.list({ product: product.id, active: true, limit: 100 });

  const match = existing.data.find(
    (p) =>
      p.unit_amount === priceSpec.unit_amount &&
      p.currency === priceSpec.currency &&
      p.recurring?.interval === priceSpec.recurring.interval
  );
  if (match) {
    console.log(`  ✓ price up-to-date: ${match.id} (${priceSpec.unit_amount / 100} ${priceSpec.currency}/${priceSpec.recurring.interval})`);
    return match;
  }

  // Archive any stale active prices so only the new one remains active.
  for (const stale of existing.data) {
    await stripe.prices.update(stale.id, { active: false });
    console.log(`  ⨯ archived stale price: ${stale.id} (${stale.unit_amount / 100} ${stale.currency})`);
  }

  const created = await stripe.prices.create({
    product: product.id,
    unit_amount: priceSpec.unit_amount,
    currency: priceSpec.currency,
    recurring: priceSpec.recurring,
    metadata: priceSpec.metadata,
  });
  console.log(`  + created price: ${created.id} (${priceSpec.unit_amount / 100} ${priceSpec.currency}/${priceSpec.recurring.interval})`);
  return created;
}

async function seed() {
  const stripe = await getUncachableStripeClient();
  console.log('Seeding Guaji AI subscription products...\n');

  for (const entry of CATALOG) {
    let product = await findProductByTier(stripe, entry.tier);
    if (product) {
      console.log(`Product exists [${entry.tier}]: ${product.id}`);
      // Keep product metadata/description current.
      product = await stripe.products.update(product.id, {
        name: entry.product.name,
        description: entry.product.description,
        metadata: entry.product.metadata,
      });
    } else {
      product = await stripe.products.create(entry.product);
      console.log(`Created product [${entry.tier}]: ${product.id}`);
    }
    const price = await ensurePrice(stripe, product, entry.price);
    console.log(`  → ${entry.tier}: product=${product.id} price=${price.id}\n`);
  }

  console.log('=== Seeding complete ===');
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error seeding products:', error);
    process.exit(1);
  });
