// 决定每日上限事件弹哪种 modal。纯函数，便于测试。
export function resolveDailyLimitModal(info) {
  const tier = info && info.tier === 'pro' ? 'pro' : 'free';
  const used = (info && info.used) ?? 0;
  const limit = (info && info.limit) ?? 0;
  if (tier === 'pro') {
    return { kind: 'come_back_tomorrow', ctaToSubscription: false, used, limit };
  }
  return { kind: 'paywall', ctaToSubscription: true, used, limit };
}
