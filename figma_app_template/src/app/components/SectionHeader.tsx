import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import designTokens from "../../imports/design-tokens.json";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionClick?: () => void;
  icon?: React.ReactNode;
}

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onActionClick,
  icon,
}: SectionHeaderProps) {
  const tokens = designTokens.global;

  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      {/* Left Side - Title */}
      <div className="flex items-center gap-3">
        {icon && (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${tokens.color.primary.value}15` }}
          >
            <div style={{ color: tokens.color.primary.value }}>{icon}</div>
          </div>
        )}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
      </div>

      {/* Right Side - Action Link */}
      {actionLabel && (
        <motion.button
          whileHover={{ x: 4 }}
          onClick={onActionClick}
          className="flex items-center gap-1 text-sm font-medium transition-colors group"
          style={{ color: tokens.color.primary.value }}
        >
          <span>{actionLabel}</span>
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </motion.button>
      )}
    </div>
  );
}
