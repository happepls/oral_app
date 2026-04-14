import { motion } from "motion/react";
import { ScenarioCard } from "../components/ScenarioCard";
import { UserCard } from "../components/UserCard";
import { StatCard } from "../components/StatCard";
import { Play, TrendingUp, Target, Award, Book, Search } from "lucide-react";
import { useState } from "react";
import designTokens from "../../imports/design-tokens.json";

export function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const tokens = designTokens.global;

  const scenarios = [
    {
      title: "机场安检",
      description: "学习机场安检常用对话，顺利通过海关",
      image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&q=80",
      duration: "10 分钟",
      difficulty: "beginner" as const,
      rating: 4.9,
      progress: 100,
    },
    {
      title: "咖啡店点单",
      description: "学会用英语点咖啡和甜点",
      image: "https://images.unsplash.com/photo-1511920170033-f8396924c348?w=400&q=80",
      duration: "5 分钟",
      difficulty: "beginner" as const,
      rating: 4.8,
      progress: 60,
    },
    {
      title: "酒店入住",
      description: "办理入住和询问设施",
      image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&q=80",
      duration: "15 分钟",
      difficulty: "intermediate" as const,
      rating: 4.7,
      progress: 0,
    },
    {
      title: "餐厅点餐",
      description: "学会点菜和提出特殊要求",
      image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&q=80",
      duration: "10 分钟",
      difficulty: "beginner" as const,
      rating: 4.9,
      progress: 0,
    },
    {
      title: "商务会议",
      description: "专业场合的英语交流",
      image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400&q=80",
      duration: "30 分钟",
      difficulty: "advanced" as const,
      rating: 4.6,
      progress: 0,
    },
  ];

  const stats = [
    { label: "已完成场景", value: "12", icon: <Award className="w-5 h-5" />, trend: "+3" },
    { label: "学习天数", value: "28", icon: <TrendingUp className="w-5 h-5" />, trend: "+1" },
    { label: "练习时长", value: "420", unit: "分钟", icon: <Target className="w-5 h-5" />, trend: "+45" },
  ];

  const filters = [
    { id: "all", label: "全部", emoji: "📚" },
    { id: "daily", label: "日常", emoji: "☕" },
    { id: "travel", label: "旅行", emoji: "✈️" },
    { id: "business", label: "商务", emoji: "💼" },
    { id: "academic", label: "学术", emoji: "🎓" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 mb-2">🏠 主页</h1>
            <p className="text-gray-600">开始今天的口语练习</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🦜</span>
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
              Oral AI
            </span>
          </div>
        </div>

        {/* User Card */}
        <UserCard
          userName="学习者小明"
          userLevel="中级学员 · Lv.8"
          streakDays={28}
          variant="default"
        />
      </div>

      {/* Stats Overview */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">📊 学习概览</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((stat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <StatCard {...stat} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* Quick Start */}
      <section className="mb-12">
        <div className="p-8 rounded-3xl shadow-lg" style={{
          background: `linear-gradient(135deg, ${tokens.color.primary.value}15, ${tokens.color.secondary.value}15)`,
        }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                今日推荐练习
              </h2>
              <p className="text-gray-600 mb-4">
                根据你的学习进度为你推荐
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 rounded-xl text-white font-semibold flex items-center gap-2 shadow-lg"
                style={{
                  background: `linear-gradient(to right, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
                }}
              >
                <Play className="w-5 h-5" />
                开始练习
              </motion.button>
            </div>
            <div className="text-8xl">🎯</div>
          </div>
        </div>
      </section>

      {/* Search & Filter */}
      <section className="mb-8">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          {/* Search Bar */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索场景..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {filters.map((filter) => (
              <motion.button
                key={filter.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveFilter(filter.id)}
                className="px-4 py-3 rounded-xl font-medium whitespace-nowrap transition-all"
                style={{
                  backgroundColor: activeFilter === filter.id 
                    ? tokens.color.primary.value 
                    : "white",
                  color: activeFilter === filter.id ? "white" : "#6b7280",
                  border: `2px solid ${activeFilter === filter.id ? tokens.color.primary.value : "#e5e7eb"}`,
                }}
              >
                <span className="mr-2">{filter.emoji}</span>
                {filter.label}
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* Recommended Scenarios */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-1">🎯 为你推荐</h2>
            <p className="text-sm text-gray-600">基于你的水平和兴趣</p>
          </div>
          <button className="text-sm font-medium flex items-center gap-1" style={{ color: tokens.color.primary.value }}>
            查看全部
            <Book className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scenarios.slice(0, 3).map((scenario, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <ScenarioCard
                {...scenario}
                state={scenario.progress > 0 ? "selected" : "default"}
                onStart={() => console.log("Start scenario:", scenario.title)}
              />
            </motion.div>
          ))}
        </div>
      </section>

      {/* All Scenarios */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-1">📚 所有场景</h2>
            <p className="text-sm text-gray-600">18+ 真实生活场景</p>
          </div>
          <select className="px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm">
            <option>推荐排序</option>
            <option>难度排序</option>
            <option>最新上线</option>
            <option>最受欢迎</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scenarios.map((scenario, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + idx * 0.1 }}
            >
              <ScenarioCard
                {...scenario}
                state="default"
                onStart={() => console.log("Start scenario:", scenario.title)}
              />
            </motion.div>
          ))}
        </div>
      </section>

      {/* Stats Footer */}
      <section className="mt-12 p-8 rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <p className="text-5xl font-bold mb-2">18</p>
            <p className="text-sm opacity-90">可用场景</p>
          </div>
          <div>
            <p className="text-5xl font-bold mb-2">12</p>
            <p className="text-sm opacity-90">已完成</p>
          </div>
          <div>
            <p className="text-5xl font-bold mb-2">3</p>
            <p className="text-sm opacity-90">进行中</p>
          </div>
          <div>
            <p className="text-5xl font-bold mb-2">5</p>
            <p className="text-sm opacity-90">已解锁</p>
          </div>
        </div>
      </section>
    </div>
  );
}