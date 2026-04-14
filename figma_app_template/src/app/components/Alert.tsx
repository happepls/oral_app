import { Info, CheckCircle, AlertTriangle, XCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import designTokens from "../../imports/design-tokens.json";

interface AlertProps {
  type?: "info" | "success" | "warning" | "error";
  title?: string;
  message: string;
  closable?: boolean;
  onClose?: () => void;
}

export function Alert({ type = "info", title, message, closable = false, onClose }: AlertProps) {
  const tokens = designTokens.global;

  const config = {
    info: {
      icon: Info,
      bgColor: "#EFF6FF",
      borderColor: "#3B82F6",
      textColor: "#1E40AF",
      iconColor: "#3B82F6",
    },
    success: {
      icon: CheckCircle,
      bgColor: "#F0FDF4",
      borderColor: tokens.color.success.value,
      textColor: "#166534",
      iconColor: tokens.color.success.value,
    },
    warning: {
      icon: AlertTriangle,
      bgColor: "#FFFBEB",
      borderColor: tokens.color.warning.value,
      textColor: "#92400E",
      iconColor: tokens.color.warning.value,
    },
    error: {
      icon: XCircle,
      bgColor: "#FEF2F2",
      borderColor: tokens.color.error.value,
      textColor: "#991B1B",
      iconColor: tokens.color.error.value,
    },
  };

  const currentConfig = config[type];
  const Icon = currentConfig.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="border rounded-xl px-5 py-4 flex items-start gap-3 relative"
      style={{
        borderRadius: tokens.radius.md.value,
        backgroundColor: currentConfig.bgColor,
        borderColor: currentConfig.borderColor,
      }}
    >
      {/* Icon */}
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: currentConfig.iconColor }} />

      {/* Content */}
      <div className="flex-1">
        {title && (
          <h4 className="font-semibold mb-1" style={{ color: currentConfig.textColor }}>
            {title}
          </h4>
        )}
        <p className="text-sm" style={{ color: currentConfig.textColor }}>
          {message}
        </p>
      </div>

      {/* Close Button */}
      {closable && (
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors"
        >
          <X className="w-4 h-4" style={{ color: currentConfig.textColor }} />
        </button>
      )}
    </motion.div>
  );
}
