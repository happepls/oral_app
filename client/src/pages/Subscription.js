import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { formatCnyReference, formatMinorCurrency } from '../utils/pricing';

// Aligns with services/api.js: env var (or default) already includes the `/api`
// prefix. Append only the resource path here — never re-prepend `/api/`, that
// produces `/api/api/...` which 404s and trips upstream-header bugs at nginx.
const API_BASE = process.env.REACT_APP_API_URL || '/api';

const ALLOWED_REDIRECT_HOSTS = [
  'checkout.stripe.com',
  'billing.stripe.com',
];

function isAllowedRedirect(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    return ALLOWED_REDIRECT_HOSTS.some(
      (h) => hostname === h || hostname.endsWith('.' + h)
    );
  } catch {
    return false;
  }
}

function Subscription() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  // Cookie mode: `token` is always null — gate auth on `user` instead.
  const { user, refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const stripeSessionId = searchParams.get('session_id');
  const location = useLocation();
  const isCancelled = location.pathname.endsWith('/cancel');
  // Account billing always has a deterministic in-product return target.
  // This also avoids returning to a Stripe Checkout history entry.
  const handleBack = () => navigate('/profile', { replace: isCancelled });
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(Boolean(user));
  const [subscriptionError, setSubscriptionError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promoApplied, setPromoApplied] = useState(null);
  const [portalError, setPortalError] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  useEffect(() => {
    if (!stripeSessionId) return;
    setShowSuccess(true);
    // After Stripe redirects back, the subscription_status is written by an
    // async webhook that often hasn't landed yet. Poll refreshProfile a few
    // times so the user object is `active` (and AuthContext fully re-ready)
    // before we navigate to /profile — otherwise Profile renders before the
    // user is hydrated and can sit blank until a manual refresh.
    let cancelled = false;
    let tries = 0;
    const MAX_TRIES = 5;
    const tick = async () => {
      tries += 1;
      let updated = null;
      try {
        updated = refreshProfile ? await refreshProfile() : null;
      } catch { /* keep polling */ }
      if (cancelled) return;
      const active = updated?.subscription_status === 'active';
      if (active || tries >= MAX_TRIES) {
        navigate('/profile');
      } else {
        setTimeout(tick, 1500);
      }
    };
    tick();
    return () => { cancelled = true; };
  }, [stripeSessionId, navigate, refreshProfile]);

  useEffect(() => {
    fetchProducts();
    if (user) {
      fetchSubscription();
    }
  }, [user]);

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/stripe/products-with-prices`);
      const data = await res.json();
      const list = Array.isArray(data?.data) ? data.data : [];
      setProducts(list);
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscription = async () => {
    setSubscriptionLoading(true);
    setSubscriptionError(false);
    try {
      // Cookie-based auth: httpOnly cookie is auto-sent via credentials.
      // Do NOT send `Authorization: Bearer null` in cookie mode (token is null).
      const res = await fetch(`${API_BASE}/stripe/subscription`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (!res.ok) throw new Error(`Subscription request failed (${res.status})`);
      const data = await res.json();
      setCurrentSubscription(data?.data || data);
    } catch (error) {
      console.error('Error fetching subscription:', error);
      setSubscriptionError(true);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleApplyPromo = async () => {
    setPromoError('');
    const code = promoCode.trim().toUpperCase();

    if (!code) {
      setPromoError(t('qa_ui.subscription_promo_required'));
      return;
    }

    try {
      // Validate server-side so the discount table is never exposed in JS.
      const res = await fetch(`${API_BASE}/stripe/promotion-codes/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (res.ok && data?.valid) {
        setPromoApplied({
          code: data.code,
          discount: data.discount,
          description: data.description
        });
      } else {
        setPromoError(data?.error || t('qa_ui.subscription_promo_invalid'));
        setPromoApplied(null);
      }
    } catch (error) {
      console.error('Error validating promo code:', error);
      // Graceful fallback: the server is the source of truth, but if it's
      // unreachable surface a friendly retry message instead of crashing.
      setPromoError(t('qa_ui.subscription_promo_error'));
      setPromoApplied(null);
    }
  };

  const handleCheckout = async (priceId) => {
    if (!user) {
      navigate('/login');
      return;
    }

    setCheckoutError('');
    setCheckoutLoading(priceId);
    try {
      const body = { priceId };
      if (promoApplied) {
        body.promotionCode = promoApplied.code;
      }

      const res = await fetch(`${API_BASE}/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      // 包裹 res.json()：502 等返回 HTML 错误页时 .json() 会抛，
      // 不包裹则与网络错误无法区分，且用户看不到任何提示。
      let data = {};
      try { data = await res.json(); } catch { /* non-JSON (e.g. 502 HTML) */ }
      if (res.ok && data.url) {
        if (isAllowedRedirect(data.url)) {
          window.location.href = data.url;
          return;
        }
        console.error('Refused checkout redirect to disallowed URL:', data.url);
        setCheckoutError(t('qa_ui.subscription_checkout_url_error'));
      } else {
        // 4xx/5xx / Stripe 配置缺失等
        console.error('Checkout failed:', res.status, data);
        setCheckoutError(t('qa_ui.subscription_checkout_error'));
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      setCheckoutError(t('qa_ui.subscription_network_error'));
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setPortalError('');
    setPortalLoading(true);
    try {
      const res = await fetch(`${API_BASE}/stripe/portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      let data = {};
      try { data = await res.json(); } catch { /* non-JSON (e.g. 502 HTML) */ }
      if (res.ok && data.url) {
        if (isAllowedRedirect(data.url)) {
          window.location.href = data.url;
          return;
        }
        console.error('Refused portal redirect to disallowed URL:', data.url);
        setPortalError(t('qa_ui.subscription_portal_url_error'));
      } else if (res.status === 400 && /no stripe customer/i.test(data.error || '')) {
        // active 状态但无 Stripe 客户（如测试号或历史数据）——没有可管理的真实订阅
        setPortalError(t('qa_ui.subscription_portal_missing'));
      } else {
        // 500 / 502 / Stripe Portal 未在 Dashboard 启用等
        setPortalError(t('qa_ui.subscription_portal_error'));
      }
    } catch (error) {
      console.error('Error opening portal:', error);
      setPortalError(t('qa_ui.subscription_portal_network_error'));
    } finally {
      setPortalLoading(false);
    }
  };

  const formatPrice = (amount, currency, interval) => {
    const price = formatMinorCurrency(amount, currency, i18n.language);
    const intervalText = interval === 'week'
      ? t('qa_ui.subscription_interval_week')
      : interval === 'year'
        ? t('qa_ui.subscription_interval_year')
        : t('qa_ui.subscription_interval_month');
    return `${price}/${intervalText}`;
  };

  const getPlanFeatures = (tier) => {
    const features = {
      weekly: [
        t('qa_ui.subscription_feature_unlimited'),
        t('qa_ui.subscription_feature_scenarios'),
        t('qa_ui.subscription_feature_feedback'),
        t('qa_ui.subscription_feature_progress'),
      ],
      annual: [
        t('qa_ui.subscription_feature_unlimited'),
        t('qa_ui.subscription_feature_scenarios'),
        t('qa_ui.subscription_feature_feedback'),
        t('qa_ui.subscription_feature_progress'),
        t('qa_ui.subscription_feature_support'),
        t('qa_ui.subscription_feature_early'),
      ]
    };
    return features[tier] || features.weekly;
  };

  const isSubscribed = currentSubscription?.status === 'active' || 
                       currentSubscription?.subscription?.status === 'active' ||
                       user?.subscription_status === 'active';

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="min-h-[100dvh] bg-background-light dark:bg-background-dark flex items-center justify-center">
        <span className="sr-only">{t('qa_ui.loading')}</span>
        <div aria-hidden="true" className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-lg pb-24" style={{ background: 'var(--background)' }}>
      <div className="px-4 pt-6 pb-4">
        <button
          onClick={handleBack}
          className="mb-4 flex min-h-[44px] items-center rounded-xl border border-slate-200 bg-white px-3 text-slate-600 shadow-sm transition-colors hover:border-primary/40 hover:text-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <span className="material-symbols-outlined text-xl mr-1">arrow_back</span>
          {t('qa_ui.subscription_back')}
        </button>

        {isCancelled && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t('qa_ui.subscription_cancelled')}
            </p>
          </div>
        )}

        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {t('qa_ui.subscription_title')}
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          {t('qa_ui.subscription_subtitle')}
        </p>
      </div>

      {showSuccess && (
        <div className="mx-4 mb-4 p-4 bg-green-100 dark:bg-green-900/30 rounded-xl border border-green-200 dark:border-green-800">
          <div className="flex items-center">
            <span className="text-green-600 dark:text-green-400 mr-2 text-xl">✓</span>
            <div>
              <span className="text-green-800 dark:text-green-200 font-medium block">{t('qa_ui.subscription_success')}</span>
              <span className="text-green-600 dark:text-green-400 text-sm">{t('qa_ui.subscription_redirecting')}</span>
            </div>
          </div>
        </div>
      )}

      {isSubscribed && (
        <div className="mx-4 mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">👑</span>
                <p className="font-semibold text-indigo-700 dark:text-indigo-300">{t('qa_ui.subscription_active')}</p>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('qa_ui.subscription_active_body')}
              </p>
            </div>
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50"
            >
              {portalLoading ? t('qa_ui.subscription_portal_opening') : t('qa_ui.subscription_manage')}
            </button>
          </div>
          {portalError && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{portalError}</p>
          )}
        </div>
      )}

      {subscriptionError && !isSubscribed && (
        <div role="alert" className="mx-4 mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <span>{t('qa_ui.subscription_status_error')}</span>
          <button type="button" onClick={fetchSubscription} className="flex-shrink-0 rounded-lg border border-amber-400 px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50">{t('qa_ui.retry')}</button>
        </div>
      )}

      <div className="px-4 space-y-4">
        <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900 dark:text-white">{t('qa_ui.subscription_free')}</h3>
            <span className="text-slate-600 dark:text-slate-400">{t('qa_ui.subscription_free_price')}</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-center">
              <span className="text-slate-400 mr-2">•</span>
              {t('qa_ui.subscription_free_conversations')}
            </li>
            <li className="flex items-center">
              <span className="text-slate-400 mr-2">•</span>
              {t('qa_ui.subscription_basic_scenarios')}
            </li>
            <li className="flex items-center">
              <span className="text-slate-400 mr-2">•</span>
              {t('qa_ui.subscription_daily_checkin')}
            </li>
          </ul>
        </div>

        {products.map((product) => {
          const tier = product.metadata?.tier || 'weekly';
          const isAnnual = tier === 'annual';
          const features = getPlanFeatures(tier);
          const price = product.prices?.[0];
          const cnyReference = price
            ? formatCnyReference(price.unit_amount, price.currency, i18n.language)
            : null;

          return (
            <div 
              key={product.id}
              className={`p-4 rounded-xl border-2 ${
                isAnnual 
                  ? 'bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-indigo-500' 
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              }`}
            >
              {isAnnual && (
                <div className="inline-block px-3 py-1 text-xs font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full mb-3">
                  {t('qa_ui.subscription_best_value')}
                </div>
              )}
              
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {product.name}
                </h3>
                {price && (
                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-900 dark:text-white">
                      {formatPrice(price.unit_amount, price.currency, price.recurring?.interval)}
                    </div>
                    {cnyReference && (
                      <div className="text-xs font-normal text-slate-500 dark:text-slate-400">
                        {t('price_cny_reference', { price: cnyReference })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                {product.description}
              </p>
              
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
                {features.map((feature, idx) => (
                  <li key={idx} className="flex items-center">
                    <span className="text-green-500 mr-2">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              
              <button
                onClick={() => {
                  if (!price?.id) {
                    setCheckoutError(t('qa_ui.subscription_price_missing'));
                    return;
                  }
                  handleCheckout(price.id);
                }}
                disabled={checkoutLoading === price?.id || isSubscribed || subscriptionLoading || subscriptionError}
                className={`w-full py-3 rounded-xl font-medium transition-all ${
                  isSubscribed
                    ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                    : isAnnual
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:opacity-90'
                      : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                } ${checkoutLoading === price?.id ? 'opacity-50' : ''}`}
              >
                {subscriptionLoading
                  ? t('qa_ui.subscription_status_loading')
                  : subscriptionError
                    ? t('qa_ui.subscription_status_unavailable_short')
                  : isSubscribed
                    ? t('qa_ui.subscription_subscribed')
                    : checkoutLoading === price?.id
                      ? t('qa_ui.subscription_processing')
                      : t('qa_ui.subscription_subscribe_now')}
              </button>
            </div>
          );
        })}

        {products.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            {t('qa_ui.subscription_prices_unavailable')}
          </div>
        )}

        {checkoutError && (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400 text-center">{checkoutError}</p>
        )}

        <div className="mt-6 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <label htmlFor="subscription-promo-code" className="block font-medium text-slate-900 dark:text-white mb-3">{t('qa_ui.subscription_promo')}</label>
          <div className="flex gap-2">
            <input
              id="subscription-promo-code"
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder={t('qa_ui.subscription_promo_placeholder')}
              className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
            />
            <button
              onClick={handleApplyPromo}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
            >
              {t('qa_ui.subscription_apply')}
            </button>
          </div>
          {promoError && (
            <p role="alert" className="text-red-600 dark:text-red-300 text-sm mt-2">{promoError}</p>
          )}
          {promoApplied && (
            <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p role="status" className="text-green-700 dark:text-green-300 text-sm">
                ✓ {promoApplied.description}
              </p>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-2">
            {t('qa_ui.subscription_promo_hint')}
          </p>
        </div>
      </div>

      <div className="px-4 mt-8">
        <p className="text-xs text-center text-slate-600 dark:text-slate-400">
          {t('qa_ui.subscription_renewal')}
          <br />
          {t('qa_ui.subscription_stripe')}
        </p>
      </div>
    </div>
  );
}

export default Subscription;
