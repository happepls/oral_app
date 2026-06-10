import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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

// Static fallback used when Stripe is not yet configured (empty products from API).
// Prices mirror Landing.js Pricing section: $2.90/wk, $89.90/yr.
const FALLBACK_PRODUCTS = [
  {
    id: 'weekly-fallback',
    name: '周付会员',
    description: '解锁全部高级功能',
    metadata: { tier: 'weekly' },
    prices: [{
      id: null,
      unit_amount: 499,
      currency: 'usd',
      recurring: { interval: 'week' }
    }]
  },
  {
    id: 'annual-fallback',
    name: '年付会员',
    description: '最划算选项，节省62%',
    metadata: { tier: 'annual' },
    prices: [{
      id: null,
      unit_amount: 9900,
      currency: 'usd',
      recurring: { interval: 'year' }
    }]
  }
];

function Subscription() {
  const navigate = useNavigate();
  // Cookie mode: `token` is always null — gate auth on `user` instead.
  const { user, refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promoApplied, setPromoApplied] = useState(null);
  const [portalError, setPortalError] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!searchParams.get('session_id')) return;
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
  }, [searchParams, navigate, refreshProfile]);

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
      const list = Array.isArray(data?.data) && data.data.length > 0
        ? data.data
        : FALLBACK_PRODUCTS;
      setProducts(list);
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts(FALLBACK_PRODUCTS);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscription = async () => {
    try {
      // Cookie-based auth: httpOnly cookie is auto-sent via credentials.
      // Do NOT send `Authorization: Bearer null` in cookie mode (token is null).
      const res = await fetch(`${API_BASE}/stripe/subscription`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      setCurrentSubscription(data);
    } catch (error) {
      console.error('Error fetching subscription:', error);
    }
  };

  const handleApplyPromo = async () => {
    setPromoError('');
    const code = promoCode.trim().toUpperCase();

    if (!code) {
      setPromoError('请输入优惠码');
      return;
    }

    try {
      // Validate server-side so the discount table is never exposed in JS.
      const res = await fetch(`${API_BASE}/users/promo/validate`, {
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
        setPromoError(data?.error || '优惠码无效或已过期');
        setPromoApplied(null);
      }
    } catch (error) {
      console.error('Error validating promo code:', error);
      // Graceful fallback: the server is the source of truth, but if it's
      // unreachable surface a friendly retry message instead of crashing.
      setPromoError('优惠码校验失败，请稍后再试');
      setPromoApplied(null);
    }
  };

  const handleCheckout = async (priceId) => {
    if (!user) {
      navigate('/login');
      return;
    }

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
      const data = await res.json();
      if (data.url) {
        if (isAllowedRedirect(data.url)) {
          window.location.href = data.url;
        } else {
          console.error('Refused checkout redirect to disallowed URL:', data.url);
        }
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
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
        setPortalError('订阅管理页地址异常，请稍后再试或联系客服。');
      } else if (res.status === 400 && /no stripe customer/i.test(data.error || '')) {
        // active 状态但无 Stripe 客户（如测试号或历史数据）——没有可管理的真实订阅
        setPortalError('未找到可管理的 Stripe 订阅记录。若你是通过支付订阅的，请联系客服处理。');
      } else {
        // 500 / 502 / Stripe Portal 未在 Dashboard 启用等
        setPortalError('暂时无法打开订阅管理页，请稍后再试。如持续失败请联系客服。');
      }
    } catch (error) {
      console.error('Error opening portal:', error);
      setPortalError('网络异常，无法打开订阅管理页，请稍后再试。');
    } finally {
      setPortalLoading(false);
    }
  };

  const formatPrice = (amount, currency, interval) => {
    const price = (amount / 100).toFixed(2);
    const intervalText = interval === 'week' ? '周' : interval === 'year' ? '年' : '月';
    return `$${price}/${intervalText}`;
  };

  const getPlanFeatures = (tier) => {
    const features = {
      weekly: ['无限AI对话练习', '所有练习场景', '实时语音反馈', '进度追踪'],
      annual: ['无限AI对话练习', '所有练习场景', '实时语音反馈', '进度追踪', '优先客服支持', '新功能抢先体验']
    };
    return features[tier] || features.weekly;
  };

  const isSubscribed = currentSubscription?.status === 'active' || 
                       currentSubscription?.subscription?.status === 'active' ||
                       user?.subscription_status === 'active';

  if (loading) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--background)' }}>
      <div className="px-4 pt-6 pb-4">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center text-slate-600 dark:text-slate-400 mb-4"
        >
          <span className="material-symbols-outlined text-xl mr-1">arrow_back</span>
          返回
        </button>
        
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          升级会员
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          解锁全部功能，提升口语水平
        </p>
      </div>

      {showSuccess && (
        <div className="mx-4 mb-4 p-4 bg-green-100 dark:bg-green-900/30 rounded-xl border border-green-200 dark:border-green-800">
          <div className="flex items-center">
            <span className="text-green-600 dark:text-green-400 mr-2 text-xl">✓</span>
            <div>
              <span className="text-green-800 dark:text-green-200 font-medium block">订阅成功！感谢您的支持</span>
              <span className="text-green-600 dark:text-green-400 text-sm">正在跳转至个人中心...</span>
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
                <p className="font-semibold text-indigo-700 dark:text-indigo-300">会员已激活</p>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                您已是尊贵会员，享受全部功能
              </p>
            </div>
            <button
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50"
            >
              {portalLoading ? '打开中…' : '管理订阅'}
            </button>
          </div>
          {portalError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{portalError}</p>
          )}
        </div>
      )}

      <div className="px-4 space-y-4">
        <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900 dark:text-white">免费版</h3>
            <span className="text-slate-600 dark:text-slate-400">免费</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-center">
              <span className="text-slate-400 mr-2">•</span>
              每日3次AI对话
            </li>
            <li className="flex items-center">
              <span className="text-slate-400 mr-2">•</span>
              基础练习场景
            </li>
            <li className="flex items-center">
              <span className="text-slate-400 mr-2">•</span>
              每日打卡
            </li>
          </ul>
        </div>

        {products.map((product) => {
          const tier = product.metadata?.tier || 'weekly';
          const isAnnual = tier === 'annual';
          const features = getPlanFeatures(tier);
          const price = product.prices?.[0];

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
                  最划算 省60%
                </div>
              )}
              
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {product.name}
                </h3>
                {price && (
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {formatPrice(price.unit_amount, price.currency, price.recurring?.interval)}
                  </span>
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
                    alert('支付功能即将上线，敬请期待');
                    return;
                  }
                  handleCheckout(price.id);
                }}
                disabled={checkoutLoading === price?.id || isSubscribed}
                className={`w-full py-3 rounded-xl font-medium transition-all ${
                  isSubscribed
                    ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                    : isAnnual
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:opacity-90'
                      : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                } ${checkoutLoading === price?.id ? 'opacity-50' : ''}`}
              >
                {isSubscribed ? '已订阅' : checkoutLoading === price?.id ? '处理中...' : '立即订阅'}
              </button>
            </div>
          );
        })}

        <div className="mt-6 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <h4 className="font-medium text-slate-900 dark:text-white mb-3">优惠码</h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="输入优惠码"
              className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
            />
            <button
              onClick={handleApplyPromo}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
            >
              应用
            </button>
          </div>
          {promoError && (
            <p className="text-red-500 text-sm mt-2">{promoError}</p>
          )}
          {promoApplied && (
            <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-green-600 dark:text-green-400 text-sm">
                ✓ {promoApplied.description} (-{promoApplied.discount}%)
              </p>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-2">
            输入优惠码即可享受专属折扣
          </p>
        </div>
      </div>

      <div className="px-4 mt-8">
        <p className="text-xs text-center text-slate-500 dark:text-slate-500">
          订阅将自动续费。您可以随时在设置中取消订阅。
          <br />
          付款由 Stripe 安全处理。
        </p>
      </div>
    </div>
  );
}

export default Subscription;
