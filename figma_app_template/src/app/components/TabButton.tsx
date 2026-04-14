import { motion } from "motion/react";
import designTokens from "../../imports/design-tokens.json";

interface TabButtonProps {
  label: string;
  state?: "default" | "active";
  onClick?: () => void;
  icon?: React.ReactNode;
}

export function TabButton({ label, state = "default", onClick, icon }: TabButtonProps) {
  const tokens = designTokens.global;
  const isActive = state === "active";

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="px-5 py-2.5 rounded-full border font-medium text-sm transition-all flex items-center gap-2"
      style={{
        backgroundColor: isActive ? tokens.color.primary.value : "transparent",
        borderColor: isActive ? tokens.color.primary.value : "#E5E7EB",
        color: isActive ? "#FFFFFF" : "#6B7280",
      }}
    >
      {icon && <span>{icon}</span>}
      <span>{label}</span>
    </motion.button>
  );
}
