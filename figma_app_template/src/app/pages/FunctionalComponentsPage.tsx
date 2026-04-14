import { useState } from "react";
import { motion } from "motion/react";
import { StatCard } from "../components/StatCard";
import { ActivityItem } from "../components/ActivityItem";
import { AchievementBadge } from "../components/AchievementBadge";
import { SkillBar } from "../components/SkillBar";
import { ChartBar } from "../components/ChartBar";
import { TabButton } from "../components/TabButton";
import { Alert } from "../components/Alert";
import { 
  Flame, 
  Target, 
  Award, 
  Clock,
  MessageSquare,
  Mic,
  BookOpen,
  Trophy,
  Star,
  Heart,
  Zap,
  Calendar,
  TrendingUp
} from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

export function FunctionalComponentsPage() {
  const tokens = designTokens.global;
  const [activeTab, setActiveTab] = useState("overview");
  const [showAlert, setShowAlert] = useState(true);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">🧩 功能组件库</h1>
        <p className="text-gray-600">完整的 UI 组件集合，用于构建数据展示和交互界面</p>
      </div>

      {/* Alert Section */}
      {showAlert && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Alert 提示框</h2>
          <div className="space-y-4">
            <Alert
              type="info"
              title="信息提示"
              message="这是一条普通的信息提示，用于告知用户一些非关键信息。"
              closable
              onClose={() => setShowAlert(false)}
            />
            <Alert
              type="success"
              title="操作成功"
              message="您的学习记录已保存！今天完成了 3 个场景练习，继续保持。"
            />
            <Alert
              type="warning"
              title="注意"
              message="您的连续打卡即将中断，请在今天 23:59 前完成至少一次练习。"
            />
            <Alert
              type="error"
              message="网络连接失败，无法同步您的学习数据。请检查网络连接后重试。"
              closable
            />
          </div>
        </div>
      )}

      {/* TabButton Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">9. TabButton 标签按钮</h2>
        <div className="flex flex-wrap gap-3">
          <TabButton
            label="概览"
            state={activeTab === "overview" ? "active" : "default"}
            onClick={() => setActiveTab("overview")}
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <TabButton
            label="练习记录"
            state={activeTab === "practice" ? "active" : "default"}
            onClick={() => setActiveTab("practice")}
            icon={<BookOpen className="w-4 h-4" />}
          />
          <TabButton
            label="成就"
            state={activeTab === "achievements" ? "active" : "default"}
            onClick={() => setActiveTab("achievements")}
            icon={<Trophy className="w-4 h-4" />}
          />
          <TabButton
            label="统计"
            state={activeTab === "stats" ? "active" : "default"}
            onClick={() => setActiveTab("stats")}
          />
        </div>
      </div>

      {/* StatCard Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">4. StatCard 统计卡片</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Flame className="w-6 h-6" />}
            value="12"
            label="连续打卡天数"
            trend={{ direction: "up", value: "+2" }}
            color={tokens.color.warning.value}
          />
          <StatCard
            icon={<Target className="w-6 h-6" />}
            value="85%"
            label="本周完成率"
            trend={{ direction: "up", value: "+15%" }}
            color={tokens.color.success.value}
          />
          <StatCard
            icon={<Award className="w-6 h-6" />}
            value="24"
            label="已解锁成就"
            color={tokens.color.secondary.value}
          />
          <StatCard
            icon={<Clock className="w-6 h-6" />}
            value="3.5h"
            label="本周学习时长"
            trend={{ direction: "down", value: "-0.5h" }}
            color={tokens.color.primary.value}
          />
        </div>
      </div>

      {/* ChartBar Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">8. ChartBar 图表柱状</h2>
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">本周练习时长</h3>
          <div className="flex items-end justify-between gap-4">
            <ChartBar value={45} maxValue={60} label="45分" dayLabel="周一" state="default" />
            <ChartBar value={52} maxValue={60} label="52分" dayLabel="周二" state="default" />
            <ChartBar value={60} maxValue={60} label="60分" dayLabel="周三" state="highlight" />
            <ChartBar value={38} maxValue={60} label="38分" dayLabel="周四" state="default" />
            <ChartBar value={55} maxValue={60} label="55分" dayLabel="周五" state="default" />
            <ChartBar value={0} maxValue={60} label="0分" dayLabel="周六" state="today" />
            <ChartBar value={0} maxValue={60} label="0分" dayLabel="周日" state="default" />
          </div>
        </div>
      </div>

      {/* SkillBar Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">7. SkillBar 技能进度条</h2>
        <div className="space-y-4">
          <SkillBar skillName="听力理解" score={850} maxScore={1000} />
          <SkillBar skillName="口语表达" score={720} maxScore={1000} />
          <SkillBar skillName="词汇量" score={2340} maxScore={5000} />
          <SkillBar skillName="语法准确度" score={68} maxScore={100} showPercentage />
          <SkillBar skillName="发音标准度" score={82} maxScore={100} showPercentage />
        </div>
      </div>

      {/* ActivityItem Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">5. ActivityItem 活动项</h2>
        <div className="space-y-3">
          <ActivityItem
            icon={<MessageSquare className="w-5 h-5" />}
            title="完成机场办理登机场景"
            description="练习时长 15 分钟，准确率 92%"
            time="2 小时前"
            iconColor={tokens.color.primary.value}
          />
          <ActivityItem
            icon={<Mic className="w-5 h-5" />}
            title="语音重复练习"
            description="完成 20 个句子跟读，平均分 85 分"
            time="5 小时前"
            iconColor={tokens.color.secondary.value}
          />
          <ActivityItem
            icon={<Trophy className="w-5 h-5" />}
            title="解锁成就：连续打卡大师"
            description="连续打卡 10 天"
            time="昨天"
            iconColor={tokens.color.warning.value}
          />
          <ActivityItem
            icon={<BookOpen className="w-5 h-5" />}
            title="学习新场景：餐厅点餐"
            description="开始学习中级场景"
            time="2 天前"
            iconColor={tokens.color.success.value}
          />
          <ActivityItem
            icon={<Star className="w-5 h-5" />}
            title="达成每周目标"
            description="本周完成 5 个场景练习"
            time="3 天前"
            iconColor={tokens.color.error.value}
          />
        </div>
      </div>

      {/* AchievementBadge Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">6. AchievementBadge 成就徽章</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <AchievementBadge
            icon="🏆"
            name="新手上路"
            state="unlocked"
            date="2024-01-15"
          />
          <AchievementBadge
            icon="🔥"
            name="连续打卡"
            state="unlocked"
            date="2024-02-10"
          />
          <AchievementBadge
            icon="⭐"
            name="完美表现"
            state="unlocked"
            date="2024-03-05"
          />
          <AchievementBadge
            icon="💎"
            name="钻石学员"
            state="unlocked"
            date="2024-03-20"
          />
          <AchievementBadge
            icon="🎯"
            name="百发百中"
            state="locked"
          />
          <AchievementBadge
            icon="👑"
            name="口语之王"
            state="locked"
          />
          <AchievementBadge
            icon="🚀"
            name="飞速进步"
            state="locked"
          />
          <AchievementBadge
            icon="🌟"
            name="明星学员"
            state="locked"
          />
          <AchievementBadge
            icon="💪"
            name="坚持不懈"
            state="unlocked"
            date="2024-02-28"
          />
          <AchievementBadge
            icon="🎓"
            name="毕业典礼"
            state="locked"
          />
          <AchievementBadge
            icon="⚡"
            name="闪电突破"
            state="locked"
          />
          <AchievementBadge
            icon="❤️"
            name="热爱学习"
            state="unlocked"
            date="2024-01-20"
          />
        </div>
      </div>

      {/* Component Features Summary */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-8 border border-blue-200">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">✨ 组件特性总览</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Zap className="w-5 h-5" style={{ color: tokens.color.warning.value }} />
              交互动画
            </h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• Hover 悬停效果（缩放、颜色变化）</li>
              <li>• Tap 点击反馈</li>
              <li>• 进度条动画（ChartBar, SkillBar）</li>
              <li>• 淡入淡出效果（Alert）</li>
            </ul>
          </div>

          <div className="bg-white rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Heart className="w-5 h-5" style={{ color: tokens.color.error.value }} />
              设计规范
            </h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• 统一使用 Design Tokens</li>
              <li>• 圆角: sm(10px), md(13px), lg(20px)</li>
              <li>• 间距: 16px, 20px 标准内边距</li>
              <li>• 渐变色: Primary → Secondary</li>
            </ul>
          </div>

          <div className="bg-white rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Star className="w-5 h-5" style={{ color: tokens.color.warning.value }} />
              状态管理
            </h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• ChartBar: default, highlight, today</li>
              <li>• AchievementBadge: locked, unlocked</li>
              <li>• TabButton: default, active</li>
              <li>• Alert: info, success, warning, error</li>
            </ul>
          </div>

          <div className="bg-white rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5" style={{ color: tokens.color.success.value }} />
              应用场景
            </h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li>• 个人中心数据展示</li>
              <li>• 学习进度追踪</li>
              <li>• 成就系统展示</li>
              <li>• 活动时间线</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
