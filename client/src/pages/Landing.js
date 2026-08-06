import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { formatCnyReference, formatMinorCurrency } from '../utils/pricing';
import { motion } from 'motion/react';
import { Mic, GraduationCap, Timer, TrendingUp, ChevronRight, ArrowRight } from 'lucide-react';

function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [livePrices, setLivePrices] = useState({});

  const features = useMemo(() => [
    { Icon: Mic,           title: t('feature_1_title'), desc: t('feature_1_desc') },
    { Icon: GraduationCap, title: t('feature_2_title'), desc: t('feature_2_desc') },
    { Icon: Timer,         title: t('feature_3_title'), desc: t('feature_3_desc') },
    { Icon: TrendingUp,    title: t('feature_4_title'), desc: t('feature_4_desc') },
  ], [t]);

  const faqs = useMemo(() => [
    { question: t('landing_faq_q1'), answer: t('landing_faq_a1') },
    { question: t('landing_faq_q2'), answer: t('landing_faq_a2') },
    { question: t('landing_faq_q3'), answer: t('landing_faq_a3') },
  ], [t]);

  const pricingPlans = useMemo(() => [
    {
      name: t('plan_free_name'), price: '$0', period: '', cnyReference: null,
      features: [t('plan_free_f1'), t('plan_free_f2'), t('plan_free_f3')],
      cta: t('plan_free_cta'), highlight: false,
    },
    {
      name: t('plan_week_name'),
      price: livePrices.weekly
        ? formatMinorCurrency(livePrices.weekly.unitAmount, livePrices.weekly.currency, i18n.language)
        : null,
      period: livePrices.weekly ? `/${t('qa_ui.subscription_interval_week')}` : '',
      cnyReference: livePrices.weekly
        ? formatCnyReference(livePrices.weekly.unitAmount, livePrices.weekly.currency, i18n.language)
        : null,
      features: [t('plan_week_f1'), t('plan_week_f2'), t('plan_week_f3'), t('plan_week_f4')],
      cta: t('plan_week_cta'), highlight: true,
    },
    {
      name: t('plan_year_name'),
      price: livePrices.annual
        ? formatMinorCurrency(livePrices.annual.unitAmount, livePrices.annual.currency, i18n.language)
        : null,
      period: livePrices.annual ? `/${t('qa_ui.subscription_interval_year')}` : '',
      cnyReference: livePrices.annual
        ? formatCnyReference(livePrices.annual.unitAmount, livePrices.annual.currency, i18n.language)
        : null,
      features: [t('plan_year_f1'), t('plan_year_f2'), t('plan_year_f3'), t('plan_year_f4'), t('plan_year_f5')],
      cta: t('plan_year_cta'), highlight: false,
    },
  ], [t, i18n.language, livePrices]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/stripe/products-with-prices', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('price unavailable')))
      .then((payload) => {
        const mapped = {};
        for (const product of Array.isArray(payload?.data) ? payload.data : []) {
          const price = product.prices?.[0];
          const tier = product.metadata?.tier;
          if (!price || !tier) continue;
          mapped[tier] = {
            unitAmount: price.unit_amount,
            currency: price.currency,
            interval: price.recurring?.interval,
          };
        }
        setLivePrices(mapped);
      })
      .catch(() => setLivePrices({}));
    return () => controller.abort();
  }, []);

  // 已登录用户可以主动回访首页（不再强制 redirect 到 /discovery）。
  // 仅当账号尚未完成 onboarding（无 native_language）时才引导去 /onboarding，
  // 否则停留首页，由 navbar 提供「进入应用」入口。
  useEffect(() => {
    if (user && !user.native_language) {
      navigate('/onboarding');
    }
  }, [user, navigate]);

  useEffect(() => {
    const node = document.getElementById('homepage-structured-data');
    if (!node) return;
    try {
      const schema = JSON.parse(node.textContent);
      const graph = schema['@graph'] || [];
      const website = graph.find((item) => item['@type'] === 'WebSite');
      const app = graph.find((item) => item['@type'] === 'SoftwareApplication');
      const faq = graph.find((item) => item['@type'] === 'FAQPage');
      if (website) website.inLanguage = i18n.language === 'zh' ? 'zh-CN' : i18n.language;
      if (app) app.description = t('landing_direct_answer');
      if (faq) {
        faq.mainEntity = faqs.map(({ question, answer }) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        }));
      }
      node.textContent = JSON.stringify(schema);
    } catch {
      // The build-time JSON-LD remains valid if an extension mutates the node.
    }
  }, [faqs, i18n.language, t]);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/guaji-logo.svg" alt="GuaJi" className="w-8 h-8" />
            <span className="hidden sm:inline text-xl font-bold text-slate-900 dark:text-white">GuaJi</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <LanguageSwitcher />
            {user ? (
              <>
                <span className="text-slate-700 dark:text-slate-200 font-medium px-2 hidden sm:inline">
                  {user.nickname || user.username || t('learner_default')}
                </span>
                <button
                  onClick={() => navigate('/discovery')}
                  className="text-white font-medium px-3 sm:px-5 py-2 rounded-lg transition hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #2d44ca, #7040cf)' }}
                >
                  {t('nav_enter_app')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="text-slate-600 dark:text-slate-300 hover:text-primary font-medium px-2 sm:px-4 py-2 transition-colors"
                >
                  {t('nav_login')}
                </button>
                <button
                  onClick={() => navigate('/register')}
                  className="text-white font-medium px-3 sm:px-5 py-2 rounded-lg transition hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #2d44ca, #7040cf)' }}
                >
                  {t('nav_free_start')}
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero (dark navy) ── */}
      <section className="pt-24 pb-20 px-4 relative overflow-hidden" style={{ background: '#1F2D5C' }}>
        <div style={{
          position: 'absolute', right: 0, bottom: 0, width: '60%', height: '100%',
          background: 'radial-gradient(ellipse at 80% 60%, rgba(164,122,246,0.2) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div className="max-w-4xl mx-auto text-center relative z-10 pt-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div
              className="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-6"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}
            >
              {t('landing_badge')}
            </div>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6" style={{ color: '#fff' }}>
              {t('landing_hero_title')}<br />
              <span
                className="text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(90deg, #c3cef8, #a47af6)' }}
              >
                {t('landing_hero_highlight')}
              </span>
            </h1>
            <p className="text-xl mb-10 max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.72)' }}>
              {t('landing_hero_desc')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/register')}
                className="flex items-center justify-center gap-2 text-white font-bold px-8 py-4 rounded-xl text-lg transition shadow-brand"
                style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
              >
                {t('landing_hero_cta')}
                <ArrowRight className="w-5 h-5" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}
                className="border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-bold px-8 py-4 rounded-xl text-lg hover:border-primary hover:text-primary transition"
              >
                {t('landing_learn_more')}
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Direct answer ── */}
      <section className="py-16 px-4 bg-white dark:bg-slate-900" aria-labelledby="direct-answer-title">
        <div className="max-w-4xl mx-auto">
          <h2 id="direct-answer-title" className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-5">
            {t('landing_direct_title')}
          </h2>
          <p className="text-lg leading-8 text-slate-700 dark:text-slate-300">
            {t('landing_direct_answer')}
          </p>
          <ul className="mt-8 grid gap-4 md:grid-cols-3 text-slate-700 dark:text-slate-300">
            <li className="rounded-xl border border-slate-200 dark:border-slate-700 p-5">{t('landing_direct_point_1')}</li>
            <li className="rounded-xl border border-slate-200 dark:border-slate-700 p-5">{t('landing_direct_point_2')}</li>
            <li className="rounded-xl border border-slate-200 dark:border-slate-700 p-5">{t('landing_direct_point_3')}</li>
          </ul>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 px-4 bg-slate-50 dark:bg-slate-800/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-900 dark:text-white mb-4">
            {t('landing_features_title')}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-center mb-12 max-w-2xl mx-auto">
            {t('landing_features_desc')}
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map(({ Icon, title, desc }, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.25 }}
                className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-brand transition-shadow"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 px-4 bg-slate-50 dark:bg-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-900 dark:text-white mb-4">
            {t('landing_pricing_title')}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-center mb-12">{t('landing_pricing_desc')}</p>
          <div className="grid md:grid-cols-3 gap-6">
            {pricingPlans.map((plan, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.25 }}
                className={`rounded-2xl p-6 border-2 transition ${
                  plan.highlight
                    ? 'border-transparent text-white scale-105 shadow-brand-lg'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }`}
                style={plan.highlight ? { background: 'linear-gradient(135deg, #637FF1, #a47af6)' } : {}}
              >
                <h3 className={`text-lg font-bold mb-2 ${plan.highlight ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                  {plan.name}
                </h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold">{plan.price === null ? '—' : plan.price}</span>
                  <span className={`text-sm ${plan.highlight ? 'text-primary-light' : 'text-slate-500'}`}>
                    {plan.period}
                  </span>
                  {plan.price === null && <span className="ml-2 text-xs text-slate-500">{t('qa_ui.price_unavailable_short')}</span>}
                  {plan.cnyReference && (
                    <p className={`mt-1 text-xs ${plan.highlight ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {t('price_cny_reference', { price: plan.cnyReference })}
                    </p>
                  )}
                </div>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm">
                      <span className={`text-lg ${plan.highlight ? 'text-green-300' : 'text-success'}`}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate('/register')}
                  className={`w-full py-3 rounded-xl font-bold transition ${
                    plan.highlight
                      ? 'bg-white text-indigo-700 hover:bg-slate-100'
                      : 'text-white hover:opacity-90'
                  }`}
                  style={!plan.highlight ? { background: 'linear-gradient(135deg, #637FF1, #a47af6)' } : {}}
                >
                  {plan.cta}
                </button>
              </motion.div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
            {t('landing_price_settlement_note')}
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 px-4 bg-white dark:bg-slate-900" aria-labelledby="faq-title">
        <div className="max-w-4xl mx-auto">
          <h2 id="faq-title" className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-10">
            {t('landing_faq_title')}
          </h2>
          <div className="space-y-6">
            {faqs.map(({ question, answer }) => (
              <article key={question} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{question}</h3>
                <p className="leading-7 text-slate-700 dark:text-slate-300">{answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-6">
              {t('landing_cta_title')}
            </h2>
            <p className="text-xl text-slate-600 dark:text-slate-400 mb-10">{t('landing_cta_desc')}</p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/register')}
              className="flex items-center gap-2 mx-auto text-white font-bold px-10 py-4 rounded-xl text-lg transition shadow-brand"
              style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
            >
              {t('landing_cta_btn')}
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-4 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/guaji-logo.svg" alt="" className="h-8 w-8" />
            <span className="font-bold text-slate-900 dark:text-white">GuaJi</span>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-slate-500 text-sm">{t('landing_footer')}</p>
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm underline"
            >
              {t('privacy_title')}
            </button>
          </div>
        </div>
      </footer>

      {/* ── Privacy Policy Modal ── */}
      {showPrivacy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowPrivacy(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowPrivacy(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 pr-8">
              {t('privacy_title')}
            </h2>
            {t('privacy_body').split('\n\n').map((para, i) => (
              <p key={i} className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-3">
                {para}
              </p>
            ))}
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default Landing;
