import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = process.env.REACT_APP_API_URL || '';

function Subscription() {
  const navigate = useNavigate();
  const { user, token, refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promoApplied, setPromoApplied] = useState(null);

  useEffect(() => {
    if (searchParams.get('session_id')) {
      setShowSuccess(true);
      if (refreshProfile) refreshProfile();
      setTimeout(() => {
        navigate('/profile');
      }, 3000);
    }
  }, [searchParams, navigate, refreshProfile]);

  useEffect(() => {
    fetchProducts();
    if (token) {
      fetchSubscription();
    }
  }, [token]);

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stripe/products-with-prices`);
      const data = await res.json();
      setProducts(data.data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscription = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stripe/subscription`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setCurrentSubscription(data);
    } catch (error) {
      console.error('Error fetching subscription:', error);
    }
  };

  const handleApplyPromo = () => {
    setPromoError('');
    const code = promoCode.trim().toUpperCase();
    
    if (!code) {
      setPromoError('请输入优惠码');
      return;
    }

    if (code === 'WELCOME20') {
      setPromoApplied({ code, discount: 20, description: '新用户8折优惠' });
    } else if (code === 'ANNUAL50') {
      setPromoApplied({ code, discount: 50, description: '年度订阅5折特惠' });
    } else {
      setPromoError('优惠码无效或已过期');
      setPromoApplied(null);
    }
  };

  const handleCheckout = async (priceId) => {
    if (!token) {
      navigate('/login');
      return;
    }

    setCheckoutLoading(priceId);
    try {
      const body = { priceId };
      if (promoApplied) {
        body.promotionCode = promoApplied.code;
      }

      const res = await fetch(`${API_BASE}/api/stripe/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stripe/portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error opening portal:', error);
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
    <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24">
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
              className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
            >
              管理订阅
            </button>
          </div>
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
              
              {price && (
                <button
                  onClick={() => handleCheckout(price.id)}
                  disabled={checkoutLoading === price.id || isSubscribed}
                  className={`w-full py-3 rounded-xl font-medium transition-all ${
                    isSubscribed
                      ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                      : isAnnual
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:opacity-90'
                        : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                  } ${checkoutLoading === price.id ? 'opacity-50' : ''}`}
                >
                  {isSubscribed ? '已订阅' : checkoutLoading === price.id ? '处理中...' : '立即订阅'}
                </button>
              )}
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
            试试：WELCOME20 (8折) 或 ANNUAL50 (年订阅5折)
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
