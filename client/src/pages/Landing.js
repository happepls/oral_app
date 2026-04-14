import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { motion } from 'motion/react';
import { Mic, GraduationCap, Timer, TrendingUp, ChevronRight, ArrowRight } from 'lucide-react';

const TESTIMONIAL_COUNT = 3;

const FEATURE_ICONS = [Mic, GraduationCap, Timer, TrendingUp];

function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  const features = useMemo(() => [
    { Icon: Mic,           title: t('feature_1_title'), desc: t('feature_1_desc') },
    { Icon: GraduationCap, title: t('feature_2_title'), desc: t('feature_2_desc') },
    { Icon: Timer,         title: t('feature_3_title'), desc: t('feature_3_desc') },
    { Icon: TrendingUp,    title: t('feature_4_title'), desc: t('feature_4_desc') },
  ], [t]);

  const testimonials = useMemo(() => [
    { name: t('t1_name'), role: t('t1_role'), text: t('t1_text'), avatar: '👨‍🎓' },
    { name: t('t2_name'), role: t('t2_role'), text: t('t2_text'), avatar: '👩‍💼' },
    { name: t('t3_name'), role: t('t3_role'), text: t('t3_text'), avatar: '🧳' },
  ], [t]);

  const pricingPlans = useMemo(() => [
    {
      name: t('plan_free_name'), price: '0', period: '',
      features: [t('plan_free_f1'), t('plan_free_f2'), t('plan_free_f3')],
      cta: t('plan_free_cta'), highlight: false,
    },
    {
      name: t('plan_week_name'), price: '2.90', period: '/wk',
      features: [t('plan_week_f1'), t('plan_week_f2'), t('plan_week_f3'), t('plan_week_f4')],
      cta: t('plan_week_cta'), highlight: true,
    },
    {
      name: t('plan_year_name'), price: '89.90', period: '/yr',
      features: [t('plan_year_f1'), t('plan_year_f2'), t('plan_year_f3'), t('plan_year_f4'), t('plan_year_f5')],
      cta: t('plan_year_cta'), highlight: false,
    },
  ], [t]);

  useEffect(() => {
    if (user) {
      if (user.native_language) {
        navigate('/discovery');
      } else {
        navigate('/onboarding');
      }
    }
  }, [user, navigate]);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % TESTIMONIAL_COUNT);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg"
              style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
            />
            <span className="text-xl font-bold text-slate-900 dark:text-white">Guaji AI</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button
              onClick={() => navigate('/login')}
              className="text-slate-600 dark:text-slate-300 hover:text-primary font-medium px-4 py-2 transition-colors"
            >
              {t('nav_login')}
            </button>
            <button
              onClick={() => navigate('/register')}
              className="text-white font-medium px-5 py-2 rounded-lg transition hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
            >
              {t('nav_free_start')}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div
              className="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-6 text-primary"
              style={{ backgroundColor: '#637FF115' }}
            >
              {t('landing_badge')}
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white leading-tight mb-6">
              {t('landing_hero_title')}<br />
              <span
                className="text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
              >
                {t('landing_hero_highlight')}
              </span>
            </h1>
            <p className="text-xl text-slate-600 dark:text-slate-400 mb-10 max-w-2xl mx-auto">
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

      {/* ── Testimonials ── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            {t('landing_testimonials_title')}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-12">{t('landing_testimonials_desc')}</p>
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 shadow-brand">
            <div className="text-5xl mb-4">{testimonials[activeTestimonial].avatar}</div>
            <p className="text-xl text-slate-700 dark:text-slate-300 italic mb-6">
              "{testimonials[activeTestimonial].text}"
            </p>
            <p className="font-bold text-slate-900 dark:text-white">{testimonials[activeTestimonial].name}</p>
            <p className="text-slate-500 text-sm">{testimonials[activeTestimonial].role}</p>
            <div className="flex justify-center gap-2 mt-6">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTestimonial(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === activeTestimonial ? 'w-6 bg-primary' : 'w-2 bg-slate-300 dark:bg-slate-600'
                  }`}
                />
              ))}
            </div>
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
                  <span className="text-4xl font-bold">${plan.price}</span>
                  <span className={`text-sm ${plan.highlight ? 'text-primary-light' : 'text-slate-500'}`}>
                    {plan.period}
                  </span>
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
                      ? 'bg-white text-primary hover:bg-slate-100'
                      : 'text-white hover:opacity-90'
                  }`}
                  style={!plan.highlight ? { background: 'linear-gradient(135deg, #637FF1, #a47af6)' } : {}}
                >
                  {plan.cta}
                </button>
              </motion.div>
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
            <div
              className="w-6 h-6 rounded-lg"
              style={{ background: 'linear-gradient(135deg, #637FF1, #a47af6)' }}
            />
            <span className="font-bold text-slate-900 dark:text-white">Guaji AI</span>
          </div>
          <p className="text-slate-500 text-sm">{t('landing_footer')}</p>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
