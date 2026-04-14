import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, ChevronDown, Mail, MessageCircle, Rocket, Mic, BarChart3, Settings, MessageSquare } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

interface FAQItem {
  question: string;
  answer: string | string[];
}

interface FAQCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: FAQItem[];
}

export function HelpPage() {
  const tokens = designTokens.global;
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<string[]>(["getting-started-0"]);

  const categories: FAQCategory[] = [
    {
      id: "getting-started",
      title: "入门指南",
      icon: <Rocket className="w-7 h-7" />,
      items: [
        {
          question: "如何开始第一次练习？",
          answer: [
            "1. 在首页选择你想练习的场景（如机场安检、咖啡店点单）",
            "2. 点击\"开始\"按钮进入对话界面",
            "3. 按住麦克风按钮开始说话，或切换到键盘输入",
            "4. AI 会实时回复并提供发音反馈",
          ],
        },
        {
          question: "我的英语水平适合哪个场景？",
          answer: [
            "**初学者**：咖啡店点单、问路导航、餐厅点餐",
            "**中级**：机场安检、酒店入住、看病就医、银行办事",
            "**高级**：商务会议、面试技巧、学术演讲",
            "可以在设置中调整你的水平，系统会智能推荐场景。",
          ],
        },
        {
          question: "需要付费吗？",
          answer: "基础场景完全免费！高级场景（商务、学术）需要完成一定数量的练习后解锁，或订阅 Premium 会员。",
        },
      ],
    },
    {
      id: "voice-recording",
      title: "录音功能",
      icon: <Mic className="w-7 h-7" />,
      items: [
        {
          question: "如何录制语音？",
          answer: [
            "**按住说话**：按住麦克风按钮开始录音，松开结束",
            "**锁定录音**：上滑可锁定，无需持续按住",
            "**取消录音**：录音时向左滑动可取消",
            "最长录音时长 60 秒。",
          ],
        },
        {
          question: "发音评分是如何计算的？",
          answer: [
            "评分基于以下维度：",
            "• 发音准确度（40%）",
            "• 语速流畅度（25%）",
            "• 语调自然度（20%）",
            "• 词汇完整性（15%）",
            "分数范围：0-100 分，80 分以上为良好。",
          ],
        },
        {
          question: "录音质量不好怎么办？",
          answer: [
            "1. 确保在安静环境下录音",
            "2. 麦克风距离嘴巴 10-15cm",
            "3. 说话清晰，不要过快",
            "4. 检查手机麦克风权限是否开启",
          ],
        },
      ],
    },
    {
      id: "progress",
      title: "进度与成就",
      icon: <BarChart3 className="w-7 h-7" />,
      items: [
        {
          question: "如何查看学习进度？",
          answer: [
            "点击底部导航栏的\"进度\"标签，可以看到：",
            "• 本周学习趋势图表",
            "• 各项技能分数",
            "• 已完成场景列表",
            "• 成就徽章收集情况",
          ],
        },
        {
          question: "成就是什么？如何解锁？",
          answer: [
            "成就是你学习里程碑的纪念徽章：",
            "🎯 首次满分：单次练习获得 100 分",
            "🔥 7 天连续：连续学习 7 天",
            "💬 百次对话：完成 100 次对话",
            "🏆 月度冠军：月度学习时长第一",
            "⭐ 全场景通关：完成所有场景",
            "💎 钻石会员：订阅 Premium",
          ],
        },
      ],
    },
    {
      id: "account",
      title: "账户与设置",
      icon: <Settings className="w-7 h-7" />,
      items: [
        {
          question: "如何修改个人资料？",
          answer: [
            "进入\"设置\"→\"个人资料\"→点击\"编辑资料\"，可以修改：",
            "• 头像",
            "• 昵称",
            "• 邮箱",
          ],
        },
        {
          question: "如何导出数据？",
          answer: "进入\"设置\"→\"隐私与安全\"→\"导出数据\"，系统会将你的学习记录打包发送到注册邮箱。",
        },
        {
          question: "忘记密码怎么办？",
          answer: "在登录页面点击\"忘记密码\"，输入注册邮箱，我们会发送重置链接。",
        },
      ],
    },
  ];

  const toggleItem = (categoryId: string, itemIndex: number) => {
    const itemId = `${categoryId}-${itemIndex}`;
    setExpandedItems((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const filteredCategories = categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const query = searchQuery.toLowerCase();
        const matchQuestion = item.question.toLowerCase().includes(query);
        const matchAnswer = Array.isArray(item.answer)
          ? item.answer.some((line) => line.toLowerCase().includes(query))
          : item.answer.toLowerCase().includes(query);
        return matchQuestion || matchAnswer;
      }),
    }))
    .filter((category) => category.items.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
            style={{ background: tokens.color.primary.value }}
          />
          <div
            className="absolute top-20 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
            style={{ background: tokens.color.secondary.value }}
          />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 py-20 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-6xl font-bold text-white mb-4"
          >
            帮助中心
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-gray-400 mb-8"
          >
            常见问题解答，快速找到你需要的帮助
          </motion.p>

          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-2xl mx-auto"
          >
            <div className="relative">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索问题..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-16 pr-6 py-5 bg-slate-800/50 backdrop-blur-xl border-2 border-slate-700 rounded-3xl text-white placeholder-gray-500 text-lg focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
          </motion.div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="max-w-4xl mx-auto px-6 pb-20">
        {filteredCategories.length === 0 && searchQuery && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-xl text-gray-400">没有找到相关问题</p>
            <p className="text-gray-500 mt-2">试试其他关键词或联系客服</p>
          </div>
        )}

        {filteredCategories.map((category, categoryIndex) => (
          <motion.div
            key={category.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: categoryIndex * 0.1 }}
            className="mb-12"
          >
            {/* Category Header */}
            <div className="flex items-center gap-3 mb-6">
              <div
                className="p-3 rounded-2xl"
                style={{ background: `${tokens.color.primary.value}20` }}
              >
                <div style={{ color: tokens.color.primary.value }}>{category.icon}</div>
              </div>
              <h2 className="text-3xl font-semibold text-white">{category.title}</h2>
            </div>

            {/* FAQ Items */}
            <div className="space-y-3">
              {category.items.map((item, itemIndex) => {
                const itemId = `${category.id}-${itemIndex}`;
                const isExpanded = expandedItems.includes(itemId);

                return (
                  <motion.div
                    key={itemIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: itemIndex * 0.05 }}
                    className="bg-slate-800/40 backdrop-blur-sm border border-slate-700 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition-all"
                  >
                    {/* Question */}
                    <button
                      onClick={() => toggleItem(category.id, itemIndex)}
                      className="w-full flex items-center justify-between p-6 text-left"
                    >
                      <span className="flex items-center gap-3 flex-1">
                        <span className="text-xl">📌</span>
                        <span className="text-lg font-medium text-white">{item.question}</span>
                      </span>
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      </motion.div>
                    </button>

                    {/* Answer */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 pb-6 pt-0">
                            <div className="pl-9 text-gray-300 leading-relaxed space-y-2">
                              {Array.isArray(item.answer) ? (
                                item.answer.map((line, lineIndex) => (
                                  <p key={lineIndex} className={line.startsWith("**") ? "font-semibold text-white" : ""}>
                                    {line.replace(/\*\*/g, "")}
                                  </p>
                                ))
                              ) : (
                                <p>{item.answer}</p>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ))}

        {/* Contact Support Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className="p-3 rounded-2xl"
              style={{ background: `${tokens.color.primary.value}20` }}
            >
              <MessageSquare className="w-7 h-7" style={{ color: tokens.color.primary.value }} />
            </div>
            <h2 className="text-3xl font-semibold text-white">联系支持</h2>
          </div>

          <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700 rounded-3xl p-8 text-center">
            <p className="text-lg text-gray-300 mb-6">
              没有找到你想要的答案？我们随时为你提供帮助。
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
              <motion.a
                href="mailto:support@oralai.com"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-white font-semibold shadow-lg"
                style={{
                  background: `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
                }}
              >
                <Mail className="w-5 h-5" />
                发送邮件
              </motion.a>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-white font-semibold bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                在线客服
              </motion.button>
            </div>

            <p className="text-sm text-gray-500">服务时间：周一至周五 9:00-18:00</p>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-gray-500 text-sm">
            © 2026 Oral AI Team · 隐私政策 · 服务条款
          </p>
        </div>
      </footer>
    </div>
  );
}
