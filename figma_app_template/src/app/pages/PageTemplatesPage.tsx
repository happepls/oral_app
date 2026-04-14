import { useState } from "react";
import { Header } from "../components/Header";
import { UserCard } from "../components/UserCard";
import { SectionHeader } from "../components/SectionHeader";
import { GoalSet } from "../components/GoalSet";
import { VoiceSet } from "../components/VoiceSet";
import { LanguageSelector } from "../components/LanguageSelector";
import { LevelSelector } from "../components/LevelSelector";
import { InterestAreaSelector } from "../components/InterestAreaSelector";
import { Target, Volume2, TrendingUp, Globe, Award, Compass } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

export function PageTemplatesPage() {
  const tokens = designTokens.global;
  const [selectedGoal, setSelectedGoal] = useState(10);
  const [selectedVoice, setSelectedVoice] = useState("voice-1");
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [selectedLevel, setSelectedLevel] = useState("intermediate");
  const [selectedInterests, setSelectedInterests] = useState<string[]>(["travel", "daily"]);

  const navLinks = [
    { label: "首页", href: "#", active: true },
    { label: "练习", href: "#" },
    { label: "我的", href: "#" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Demo Header */}
      <Header
        logoText="Oral AI"
        navLinks={navLinks}
        userName="学习者小明"
        onMenuClick={() => console.log("Menu clicked")}
      />

      {/* Page Content */}
      <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
        {/* Page Title with Link to Interactive Page */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">📱 页面模板组件</h1>
          <p className="text-lg text-gray-600 mb-4">
            展示 Header、UserCard、SectionHeader、GoalSet、VoiceSet 等页面级组件
          </p>
        </div>

        {/* Header Component Demo */}
        <section>
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">1. Header 导航栏</h2>
            <p className="text-gray-600">
              顶部导航栏，包含 Logo、导航链接、用户头像，支持移动端菜单
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="text-sm text-gray-500 mb-4">
              💡 固定在页面顶部，带毛玻璃模糊效果
            </div>
            <div className="bg-gray-100 rounded-xl p-4">
              <code className="text-xs text-gray-700">
                {`<Header logoText="Oral AI" navLinks={[...]} userName="用户名" />`}
              </code>
            </div>
          </div>
        </section>

        {/* UserCard Component Demo */}
        <section>
          <SectionHeader
            title="2. UserCard 用户信息卡片"
            subtitle="展示用户头像、姓名、等级和连续学习天数"
            icon={<TrendingUp className="w-6 h-6" />}
          />
          
          <div className="space-y-4">
            <UserCard
              userName="学习者小明"
              userLevel="中级学员 · Lv.8"
              streakDays={12}
              variant="default"
            />
            
            <UserCard
              userName="学习者小红"
              userLevel="初级学员 · Lv.3"
              streakDays={5}
              variant="compact"
            />
          </div>
        </section>

        {/* SectionHeader Component Demo */}
        <section>
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">3. SectionHeader 区块标题</h2>
            <p className="text-gray-600">
              页面区块的标题组件，支持副标题、图标和右侧操作链接
            </p>
          </div>
          
          <div className="space-y-6 bg-white border border-gray-200 rounded-2xl p-8">
            <SectionHeader
              title="最近活动"
              actionLabel="查看全部"
              onActionClick={() => alert("查看全部")}
            />
            
            <SectionHeader
              title="学习统计"
              subtitle="本周学习数据概览"
              icon={<TrendingUp className="w-6 h-6" />}
            />
            
            <SectionHeader
              title="练习目标"
              icon={<Target className="w-6 h-6" />}
              actionLabel="修改目标"
              onActionClick={() => alert("修改目标")}
            />
          </div>
        </section>

        {/* GoalSet Component Demo */}
        <section>
          <SectionHeader
            title="4. GoalSet 练习目标设定"
            subtitle="让用户选择每日学习时长目标"
            icon={<Target className="w-6 h-6" />}
          />
          
          <GoalSet
            title="设定每日练习目标"
            subtitle="选择适合你的每日学习时长"
            defaultValue={selectedGoal}
            onChange={(value) => {
              setSelectedGoal(value);
              console.log("Selected goal:", value);
            }}
          />
          
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm text-blue-900">
              当前选择：<strong>每天 {selectedGoal} 分钟</strong>
            </p>
          </div>
        </section>

        {/* VoiceSet Component Demo */}
        <section>
          <SectionHeader
            title="5. VoiceSet 口语导师音色设定"
            subtitle="选择不同的AI导师音色进行练习"
            icon={<Volume2 className="w-6 h-6" />}
          />
          
          <VoiceSet
            title="选择口语导师音色"
            subtitle="不同音色适合不同练习场景"
            defaultVoiceId={selectedVoice}
            onChange={(voiceId) => {
              setSelectedVoice(voiceId);
              console.log("Selected voice:", voiceId);
            }}
          />
          
          <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-xl">
            <p className="text-sm text-purple-900">
              当前选择：<strong>{selectedVoice}</strong>
            </p>
          </div>
        </section>

        {/* LanguageSelector Component Demo */}
        <section>
          <SectionHeader
            title="6. LanguageSelector 语言选择器"
            subtitle="选择练习的语言"
            icon={<Globe className="w-6 h-6" />}
          />
          
          <LanguageSelector
            title="选择练习语言"
            subtitle="选择你想要练习的语言"
            selectedLanguage={selectedLanguage}
            onChange={(language) => {
              setSelectedLanguage(language);
              console.log("Selected language:", language);
            }}
          />
          
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm text-green-900">
              当前选择：<strong>{selectedLanguage}</strong>
            </p>
          </div>
        </section>

        {/* LevelSelector Component Demo */}
        <section>
          <SectionHeader
            title="7. LevelSelector 级别选择器"
            subtitle="选择练习的难度级别"
            icon={<Award className="w-6 h-6" />}
          />
          
          <LevelSelector
            title="选择练习级别"
            subtitle="选择适合你的练习难度级别"
            selectedLevel={selectedLevel}
            onChange={(level) => {
              setSelectedLevel(level);
              console.log("Selected level:", level);
            }}
          />
          
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
            <p className="text-sm text-yellow-900">
              当前选择：<strong>{selectedLevel}</strong>
            </p>
          </div>
        </section>

        {/* InterestAreaSelector Component Demo */}
        <section>
          <SectionHeader
            title="8. InterestAreaSelector 兴趣领域选择器"
            subtitle="选择练习的兴趣领域"
            icon={<Compass className="w-6 h-6" />}
          />
          
          <InterestAreaSelector
            title="选择练习兴趣领域"
            subtitle="选择你感兴趣的练习领域"
            selectedAreas={selectedInterests}
            onChange={(interests) => {
              setSelectedInterests(interests);
              console.log("Selected interests:", interests);
            }}
          />
          
          <div className="mt-4 p-4 bg-pink-50 border border-pink-200 rounded-xl">
            <p className="text-sm text-pink-900">
              当前选择：<strong>{selectedInterests.join(", ")}</strong>
            </p>
          </div>
        </section>

        {/* Component Props Reference */}
        <section className="bg-white border border-gray-200 rounded-2xl p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">📋 组件属性参考</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Header</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 font-mono">
                logoText?: string<br />
                navLinks?: {`{ label, href, active? }[]`}<br />
                userName?: string<br />
                userAvatar?: string<br />
                onMenuClick?: () =&gt; void
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">UserCard</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 font-mono">
                userName?: string<br />
                userLevel?: string<br />
                userAvatar?: string<br />
                streakDays?: number<br />
                variant?: "default" | "compact"
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">SectionHeader</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 font-mono">
                title: string<br />
                subtitle?: string<br />
                actionLabel?: string<br />
                onActionClick?: () =&gt; void<br />
                icon?: ReactNode
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">GoalSet</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 font-mono">
                title?: string<br />
                subtitle?: string<br />
                options?: {`{ value, label, description, icon }[]`}<br />
                defaultValue?: number<br />
                onChange?: (value: number) =&gt; void
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">VoiceSet</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 font-mono">
                title?: string<br />
                subtitle?: string<br />
                voices?: {`{ id, name, gender, accent, description, avatar }[]`}<br />
                defaultVoiceId?: string<br />
                onChange?: (voiceId: string) =&gt; void
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">LanguageSelector</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 font-mono">
                title?: string<br />
                subtitle?: string<br />
                languages?: {`{ code, name }[]`}<br />
                defaultLanguage?: string<br />
                onChange?: (language: string) =&gt; void
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">LevelSelector</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 font-mono">
                title?: string<br />
                subtitle?: string<br />
                levels?: {`{ value, label, description }[]`}<br />
                defaultLevel?: string<br />
                onChange?: (level: string) =&gt; void
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">InterestAreaSelector</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 font-mono">
                title?: string<br />
                subtitle?: string<br />
                interests?: {`{ id, name, description, icon }[]`}<br />
                defaultInterests?: string[]<br />
                onChange?: (interests: string[]) =&gt; void
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}