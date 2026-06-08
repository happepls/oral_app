// client/src/__tests__/daily-limit-logic.test.js
import { resolveDailyLimitModal } from '../pages/dailyLimitLogic';

describe('resolveDailyLimitModal', () => {
  test('free tier → paywall modal + 引导订阅', () => {
    expect(resolveDailyLimitModal({ tier: 'free', used: 15, limit: 15 }))
      .toEqual({ kind: 'paywall', ctaToSubscription: true, used: 15, limit: 15 });
  });
  test('pro tier → 明日再来，无 CTA', () => {
    expect(resolveDailyLimitModal({ tier: 'pro', used: 150, limit: 150 }))
      .toEqual({ kind: 'come_back_tomorrow', ctaToSubscription: false, used: 150, limit: 150 });
  });
  test('缺字段降级为 free paywall', () => {
    expect(resolveDailyLimitModal({}).kind).toBe('paywall');
  });
});
