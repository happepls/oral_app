const { getUncachableStripeClient } = require('./stripeClient');

async function createProducts() {
  const stripe = await getUncachableStripeClient();
  
  console.log('Creating Guaji AI subscription products...');

  const existingProducts = await stripe.products.search({ 
    query: "metadata['app']:'guaji_ai'" 
  });
  
  if (existingProducts.data.length > 0) {
    console.log('Products already exist, skipping creation');
    console.log('Existing products:', existingProducts.data.map(p => p.name));
    return;
  }

  const weeklyProduct = await stripe.products.create({
    name: 'Guaji AI Weekly',
    description: '每周订阅，解锁所有高级功能，无限AI对话练习',
    metadata: {
      app: 'guaji_ai',
      tier: 'weekly',
      features: 'unlimited_conversations,all_scenarios,priority_support'
    }
  });
  console.log('Created weekly product:', weeklyProduct.id);

  const weeklyPrice = await stripe.prices.create({
    product: weeklyProduct.id,
    unit_amount: 290,
    currency: 'usd',
    recurring: { interval: 'week' },
    metadata: {
      tier: 'weekly',
      display_name: '周订阅'
    }
  });
  console.log('Created weekly price:', weeklyPrice.id, '- $2.90/week');

  const annualProduct = await stripe.products.create({
    name: 'Guaji AI Annual',
    description: '年度订阅，最划算的选择！解锁所有高级功能，无限AI对话练习',
    metadata: {
      app: 'guaji_ai',
      tier: 'annual',
      features: 'unlimited_conversations,all_scenarios,priority_support,early_access'
    }
  });
  console.log('Created annual product:', annualProduct.id);

  const annualPrice = await stripe.prices.create({
    product: annualProduct.id,
    unit_amount: 8990,
    currency: 'usd',
    recurring: { interval: 'year' },
    metadata: {
      tier: 'annual',
      display_name: '年订阅'
    }
  });
  console.log('Created annual price:', annualPrice.id, '- $89.90/year');

  console.log('\n=== Products Created Successfully ===');
  console.log('Weekly: $2.90/week -', weeklyProduct.id, weeklyPrice.id);
  console.log('Annual: $89.90/year -', annualProduct.id, annualPrice.id);
}

createProducts()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error creating products:', error);
    process.exit(1);
  });
