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
  TrendingUp,
  Settings,
  Bell,
  Calendar,
  BarChart3,
  User
} from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

export function ProfileMockupPage() {
  const tokens = designTokens.global;
  const [activeTab, setActiveTab] = useState("overview");
  const [showAlert, setShowAlert] = useState(true);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
                style={{ background: `linear-gradient(135deg, ${tokens.color.primary.value}, ${tokens.color.secondary.value})` }}
              >
                <User className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">学习者小明</h1>
                <p className="text-sm text-gray-500">加入于 2024年1月 · 中级学员</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <Bell className="w-5 h-5 text-gray-600" />
              </button>
              <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <Settings className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Alert */}
        {showAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Alert
              type="success"
              title="🎉 恭喜解锁新成就！"
              message="您已连续打卡 12 天，获得「坚持不懈」徽章！"
              closable
              onClose={() => setShowAlert(false)}
            />
          </motion.div>
        )}

        {/* Tabs */}
        <div className="mb-8 flex flex-wrap gap-3">
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
            icon={<BarChart3 className="w-4 h-4" />}
          />
        </div>

        {activeTab === "overview" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Stats Grid */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📊 本周概览</h2>
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

            {/* Chart */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📈 本周练习时长</h2>
              <div className="bg-white border border-gray-200 rounded-2xl p-6">
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

            {/* Recent Activities */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">🕐 最近活动</h2>
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
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "practice" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📚 学习技能</h2>
              <div className="space-y-4">
                <SkillBar skillName="听力理解" score={850} maxScore={1000} />
                <SkillBar skillName="口语表达" score={720} maxScore={1000} />
                <SkillBar skillName="词汇量" score={2340} maxScore={5000} />
                <SkillBar skillName="语法准确度" score={68} maxScore={100} showPercentage />
                <SkillBar skillName="发音标准度" score={82} maxScore={100} showPercentage />
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📖 练习历史</h2>
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
          </motion.div>
        )}

        {activeTab === "achievements" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4">🏆 成就徽章</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <AchievementBadge icon="🏆" name="新手上路" state="unlocked" date="2024-01-15" />
              <AchievementBadge icon="🔥" name="连续打卡" state="unlocked" date="2024-02-10" />
              <AchievementBadge icon="⭐" name="完美表现" state="unlocked" date="2024-03-05" />
              <AchievementBadge icon="💎" name="钻石学员" state="unlocked" date="2024-03-20" />
              <AchievementBadge icon="🎯" name="百发百中" state="locked" />
              <AchievementBadge icon="👑" name="口语之王" state="locked" />
              <AchievementBadge icon="🚀" name="飞速进步" state="locked" />
              <AchievementBadge icon="🌟" name="明星学员" state="locked" />
              <AchievementBadge icon="💪" name="坚持不懈" state="unlocked" date="2024-02-28" />
              <AchievementBadge icon="🎓" name="毕业典礼" state="locked" />
              <AchievementBadge icon="⚡" name="闪电突破" state="locked" />
              <AchievementBadge icon="❤️" name="热爱学习" state="unlocked" date="2024-01-20" />
            </div>
          </motion.div>
        )}

        {activeTab === "stats" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📊 学习统计</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-6">本月练习时长</h3>
                  <div className="flex items-end justify-between gap-2">
                    <ChartBar value={120} maxValue={150} label="120分" dayLabel="第1周" state="default" />
                    <ChartBar value={145} maxValue={150} label="145分" dayLabel="第2周" state="default" />
                    <ChartBar value={150} maxValue={150} label="150分" dayLabel="第3周" state="highlight" />
                    <ChartBar value={98} maxValue={150} label="98分" dayLabel="第4周" state="today" />
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">学习进度</h3>
                  <div className="space-y-4">
                    <SkillBar skillName="听力理解" score={85} maxScore={100} showPercentage />
                    <SkillBar skillName="口语表达" score={72} maxScore={100} showPercentage />
                    <SkillBar skillName="发音标准" score={82} maxScore={100} showPercentage />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                icon={<Calendar className="w-6 h-6" />}
                value="45"
                label="累计学习天数"
                color={tokens.color.primary.value}
              />
              <StatCard
                icon={<Clock className="w-6 h-6" />}
                value="28.5h"
                label="累计学习时长"
                color={tokens.color.success.value}
              />
              <StatCard
                icon={<BookOpen className="w-6 h-6" />}
                value="18"
                label="完成场景数"
                color={tokens.color.secondary.value}
              />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
