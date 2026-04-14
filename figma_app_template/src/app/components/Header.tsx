import { User, Menu } from "lucide-react";
import { motion } from "motion/react";
import designTokens from "../../imports/design-tokens.json";
import { animationConfig } from "../utils/animations";

interface HeaderProps {
  logoText?: string;
  navLinks?: { label: string; href: string; active?: boolean }[];
  userName?: string;
  userAvatar?: string;
  onMenuClick?: () => void;
}

export function Header({
  logoText = "Oral AI",
  navLinks = [],
  userName = "用户",
  userAvatar,
  onMenuClick,
}: HeaderProps) {
  const tokens = designTokens.global;

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={animationConfig.pageTransition}
      className="sticky top-0 z-50 w-full backdrop-blur-xl bg-white/80 border-b border-gray-200"
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Menu className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
              }}
            >
              <span className="text-white text-sm font-bold">O</span>
            </div>
            <span
              className="text-xl font-bold bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(135deg, ${tokens.color.primary.value}, ${tokens.color.secondary.value})`,
              }}
            >
              {logoText}
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        {navLinks.length > 0 && (
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link, index) => (
              <a
                key={index}
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  link.active
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}

        {/* User Avatar */}
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center overflow-hidden">
            {userAvatar ? (
              <img src={userAvatar} alt={userName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-white" />
            )}
          </div>
          <span className="hidden sm:block text-sm font-medium text-gray-700">
            {userName}
          </span>
        </div>
      </div>
    </motion.header>
  );
}