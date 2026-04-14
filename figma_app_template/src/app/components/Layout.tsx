import { Outlet, NavLink } from "react-router";
import { Palette, MessageCircle, Mic, CreditCard, Loader2, Smartphone, LayoutGrid, User, Layout as LayoutIcon, LogIn, Home, HelpCircle, MessageSquare, Crown, Zap } from "lucide-react";

const navItems = [
  { path: "/design-tokens", label: "Design Tokens", icon: Palette, emoji: "🎨" },
  { path: "/message-bubble", label: "MessageBubble", icon: MessageCircle, emoji: "💬" },
  { path: "/voice-recorder", label: "VoiceRecorder", icon: Mic, emoji: "🎙️" },
  { path: "/scenario-card", label: "ScenarioCard", icon: CreditCard, emoji: "🃏" },
  { path: "/loading", label: "Loading", icon: Loader2, emoji: "⏳" },
  { path: "/mockups", label: "Mockups", icon: Smartphone, emoji: "📱" },
  { path: "/functional-components", label: "功能组件库", icon: LayoutGrid, emoji: "🧩" },
  { path: "/profile-mockup", label: "个人中心", icon: User, emoji: "👤" },
  { path: "/page-templates", label: "页面模板", icon: LayoutIcon, emoji: "📄" },
  { path: "/onboarding", label: "Onboarding 引导", icon: LogIn, emoji: "🚀" },
  { path: "/home", label: "首页示例", icon: Home, emoji: "🏠" },
  { path: "/help", label: "帮助中心", icon: HelpCircle, emoji: "❓" },
  { path: "/testimonials", label: "用户反馈", icon: MessageSquare, emoji: "💭" },
  { path: "/subscription", label: "订阅定价", icon: Crown, emoji: "👑" },
  { path: "/subscription/demo", label: "订阅限制演示", icon: Zap, emoji: "⚡" },
];

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900">📁 Oral AI</h1>
          <p className="text-sm text-gray-500 mt-1">Design System</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                }`
              }
            >
              <span className="text-xl">{item.emoji}</span>
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        
        <div className="p-4 border-t border-gray-200 text-xs text-gray-500">
          <p>Oral AI Design System v1.0</p>
          <p className="mt-1">© 2026 All rights reserved</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
