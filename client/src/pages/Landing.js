import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const features = [
  { icon: 'mic', title: '实时语音对话', desc: 'AI导师实时倾听、理解并回应，模拟真实对话场景' },
  { icon: 'school', title: '个性化学习', desc: '根据你的水平和兴趣定制专属练习场景' },
  { icon: 'timer', title: '24/7全天候', desc: '随时随地练习，不受时间地点限制' },
  { icon: 'trending_up', title: '进度追踪', desc: '详细的学习报告，清晰看到每一步进步' }
];

const testimonials = [
  { name: '小明', role: '大学生', text: '用Guaji AI练习一个月，雅思口语从5.5提到了6.5！', avatar: '👨‍🎓' },
  { name: 'Sarah', role: '职场白领', text: '终于敢在会议上用英语发言了，感谢AI导师的陪伴！', avatar: '👩‍💼' },
  { name: '老王', role: '旅行爱好者', text: '出国旅游再也不怕语言障碍，练习的场景都很实用', avatar: '🧳' }
];

const pricingPlans = [
  { name: '免费版', price: '0', period: '', features: ['每日3次对话', '基础场景', '进度追踪'], cta: '开始使用', highlight: false },
  { name: '周订阅', price: '2.90', period: '/周', features: ['无限对话', '全部场景', '详细报告', '优先支持'], cta: '立即订阅', highlight: true },
  { name: '年订阅', price: '89.90', period: '/年', features: ['无限对话', '全部场景', '详细报告', '优先支持', '省60%'], cta: '最划算', highlight: false }
];

function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTestimonial, setActiveTestimonial] = useState(0);

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
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500"></div>
            <span className="text-xl font-bold text-slate-900 dark:text-white">Guaji AI</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 font-medium px-4 py-2">
              登录
            </button>
            <button onClick={() => navigate('/register')} className="bg-indigo-600 text-white font-medium px-5 py-2 rounded-lg hover:bg-indigo-700 transition">
              免费开始
            </button>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block px-4 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full text-sm font-medium mb-6">
            AI赋能的语言学习新方式
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white leading-tight mb-6">
            24/7 AI口语导师<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-500">随时练习，随时进步</span>
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 mb-10 max-w-2xl mx-auto">
            告别尴尬的对话练习，Guaji AI提供自然流畅的语音对话体验，帮助你在真实场景中提升口语能力
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={() => navigate('/register')} className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold px-8 py-4 rounded-xl text-lg hover:opacity-90 transition shadow-lg shadow-indigo-500/30">
              免费开始体验
            </button>
            <button onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })} className="border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-bold px-8 py-4 rounded-xl text-lg hover:border-indigo-500 hover:text-indigo-500 transition">
              了解更多
            </button>
          </div>
        </div>
      </section>

      <section id="features" className="py-20 px-4 bg-slate-50 dark:bg-slate-800/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-900 dark:text-white mb-4">为什么选择Guaji AI</h2>
          <p className="text-slate-600 dark:text-slate-400 text-center mb-12 max-w-2xl mx-auto">
            结合最先进的AI语音技术，为你提供沉浸式的口语练习体验
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-white">{f.icon}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">用户真实反馈</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-12">已有数千用户通过Guaji AI提升了口语水平</p>
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700">
            <div className="text-5xl mb-4">{testimonials[activeTestimonial].avatar}</div>
            <p className="text-xl text-slate-700 dark:text-slate-300 italic mb-6">"{testimonials[activeTestimonial].text}"</p>
            <p className="font-bold text-slate-900 dark:text-white">{testimonials[activeTestimonial].name}</p>
            <p className="text-slate-500 text-sm">{testimonials[activeTestimonial].role}</p>
            <div className="flex justify-center gap-2 mt-6">
              {testimonials.map((_, i) => (
                <button key={i} onClick={() => setActiveTestimonial(i)} className={`w-2 h-2 rounded-full transition ${i === activeTestimonial ? 'bg-indigo-500 w-6' : 'bg-slate-300 dark:bg-slate-600'}`} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20 px-4 bg-slate-50 dark:bg-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-900 dark:text-white mb-4">简单透明的定价</h2>
          <p className="text-slate-600 dark:text-slate-400 text-center mb-12">选择适合你的计划，开始提升口语之旅</p>
          <div className="grid md:grid-cols-3 gap-6">
            {pricingPlans.map((plan, i) => (
              <div key={i} className={`rounded-2xl p-6 border-2 transition ${plan.highlight ? 'bg-gradient-to-b from-indigo-500 to-purple-500 border-transparent text-white scale-105' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                <h3 className={`text-lg font-bold mb-2 ${plan.highlight ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{plan.name}</h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold">${plan.price}</span>
                  <span className={`text-sm ${plan.highlight ? 'text-indigo-200' : 'text-slate-500'}`}>{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm">
                      <span className={`material-symbols-outlined text-sm ${plan.highlight ? 'text-green-300' : 'text-green-500'}`}>check_circle</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => navigate('/register')} className={`w-full py-3 rounded-xl font-bold transition ${plan.highlight ? 'bg-white text-indigo-600 hover:bg-slate-100' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-6">准备好提升你的口语了吗？</h2>
          <p className="text-xl text-slate-600 dark:text-slate-400 mb-10">立即注册，开始你的AI口语练习之旅</p>
          <button onClick={() => navigate('/register')} className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold px-10 py-4 rounded-xl text-lg hover:opacity-90 transition shadow-lg shadow-indigo-500/30">
            免费创建账户
          </button>
        </div>
      </section>

      <footer className="py-10 px-4 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500"></div>
            <span className="font-bold text-slate-900 dark:text-white">Guaji AI</span>
          </div>
          <p className="text-slate-500 text-sm">© 2026 Guaji AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
