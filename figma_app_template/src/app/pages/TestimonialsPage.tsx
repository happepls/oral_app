import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

interface Testimonial {
  id: string;
  avatar: string;
  username: string;
  handle: string;
  content: string;
  highlighted?: boolean;
}

export function TestimonialsPage() {
  const tokens = designTokens.global;

  const testimonials: Testimonial[] = [
    {
      id: "1",
      avatar: "👨‍💻",
      username: "jonahships_",
      handle: "@jonahships_",
      content: "Setup @openclaw by @steipete yesterday. All I have to say is, wow. First I was using my Claude Max sub and I...",
      highlighted: true,
    },
    {
      id: "2",
      avatar: "👨‍🎨",
      username: "AryehDubois",
      handle: "@AryehDubois",
      content: "Tried Claw by @steipete. I tried to build my own AI assistant bots before, and I am very impressed how many...",
    },
    {
      id: "3",
      avatar: "🤖",
      username: "Senator_NFTs",
      handle: "@Senator_NFTs",
      content: "OpenClaw is a game changer. the potential for custom extensions is huge, and ai really speeds up the...",
    },
    {
      id: "4",
      avatar: "🎯",
      username: "mneves75",
      handle: "@mneves75",
      content: "Try @openclaw. I think you are going to love it. And you can use iMessage, WhatsApp, telegram to talk to it.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      {/* Animated Background Stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.5 + 0.2,
            }}
            animate={{
              opacity: [Math.random() * 0.5 + 0.2, Math.random() * 0.8 + 0.2, Math.random() * 0.5 + 0.2],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-6 py-20">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <motion.div
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="text-4xl"
            >
              ❯
            </motion.div>
            <h2 className="text-4xl md:text-5xl font-bold text-white">
              What People Say
            </h2>
          </div>

          <motion.a
            href="#"
            whileHover={{ x: 5 }}
            className="hidden md:flex items-center gap-2 text-lg font-medium"
            style={{ color: tokens.color.primary.value }}
          >
            View all
            <ChevronRight className="w-5 h-5" />
          </motion.a>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -8, transition: { duration: 0.2 } }}
              className={`relative p-8 rounded-3xl backdrop-blur-xl transition-all ${
                testimonial.highlighted
                  ? "bg-gradient-to-br from-red-900/30 to-red-800/20 border-2 border-red-500/50"
                  : "bg-slate-800/30 border border-slate-700/50"
              }`}
            >
              {/* Glow Effect for Highlighted Card */}
              {testimonial.highlighted && (
                <div
                  className="absolute inset-0 rounded-3xl blur-2xl opacity-30 -z-10"
                  style={{
                    background: `radial-gradient(circle at 50% 0%, ${tokens.color.primary.value}, transparent 70%)`,
                  }}
                />
              )}

              {/* Content */}
              <div className="flex items-start gap-4 mb-4">
                <div className="text-5xl flex-shrink-0">{testimonial.avatar}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-300 text-base leading-relaxed mb-4">
                    "{testimonial.content}"
                  </p>
                  <div
                    className="inline-flex items-center gap-1 text-sm font-semibold"
                    style={{ color: testimonial.highlighted ? tokens.color.primary.value : "#ef4444" }}
                  >
                    {testimonial.handle}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Mobile View All Button */}
        <motion.a
          href="#"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="md:hidden flex items-center justify-center gap-2 mt-8 text-lg font-medium"
          style={{ color: tokens.color.primary.value }}
        >
          View all
          <ChevronRight className="w-5 h-5" />
        </motion.a>

        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {[
            { value: "50K+", label: "活跃用户" },
            { value: "1M+", label: "练习次数" },
            { value: "4.9★", label: "用户评分" },
          ].map((stat, index) => (
            <motion.div
              key={index}
              whileHover={{ scale: 1.05 }}
              className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 text-center"
            >
              <div
                className="text-5xl font-bold mb-2"
                style={{
                  background: `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {stat.value}
              </div>
              <div className="text-gray-400 text-lg">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-20 text-center"
        >
          <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 backdrop-blur-xl border border-indigo-500/30 rounded-3xl p-12">
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
              加入数万名学习者
            </h3>
            <p className="text-xl text-gray-300 mb-8">
              开始你的语言学习之旅，让 AI 成为你的私人口语教练
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-12 py-5 rounded-2xl text-white text-lg font-semibold shadow-2xl"
              style={{
                background: `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
              }}
            >
              免费开始
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
