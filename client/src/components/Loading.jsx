import { motion } from "motion/react";
import designTokens from "../imports/design-tokens.json";

export function Loading({ variant = "spinner", size = "md", text }) {
  const tokens = designTokens.global;

  const sizes = {
    sm: { container: 24, element: 16, border: 2 },
    md: { container: 48, element: 32, border: 3 },
    lg: { container: 64, element: 48, border: 4 },
    xl: { container: 80, element: 64, border: 5 },
  };

  const currentSize = sizes[size] || sizes.md;

  if (variant === "spinner") {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        <motion.div
          className="rounded-full"
          style={{
            width: currentSize.container,
            height: currentSize.container,
            border: `${currentSize.border}px solid transparent`,
            borderTopColor: tokens.color.primary.value,
            borderRightColor: tokens.color.primary.value,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        {text && <p className="text-sm text-gray-600">{text}</p>}
      </div>
    );
  }

  if (variant === "dots") {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="rounded-full"
              style={{
                width: currentSize.element / 3,
                height: currentSize.element / 3,
                backgroundColor: tokens.color.primary.value,
              }}
              animate={{ y: [0, -(currentSize.element / 3), 0] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
            />
          ))}
        </div>
        {text && <p className="text-sm text-gray-600">{text}</p>}
      </div>
    );
  }

  if (variant === "pulse") {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        <motion.div
          className="rounded-full"
          style={{
            width: currentSize.container,
            height: currentSize.container,
            backgroundColor: tokens.color.primary.value,
          }}
          animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
        {text && <p className="text-sm text-gray-600">{text}</p>}
      </div>
    );
  }

  if (variant === "bars") {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="rounded-full"
              style={{
                width: currentSize.element / 6,
                height: currentSize.element,
                backgroundColor: tokens.color.primary.value,
              }}
              animate={{ scaleY: [0.3, 1, 0.3] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
            />
          ))}
        </div>
        {text && <p className="text-sm text-gray-600">{text}</p>}
      </div>
    );
  }

  return null;
}

export function Skeleton({ variant = "text", width, height, className = "" }) {
  const baseStyles = {
    backgroundColor: "#E5E7EB",
    borderRadius: variant === "circular" ? "50%" : "4px",
    width: width || (variant === "circular" ? "48px" : "100%"),
    height: height || (variant === "circular" ? "48px" : variant === "text" ? "16px" : "100px"),
  };

  return (
    <motion.div
      className={className}
      style={{
        ...baseStyles,
        backgroundImage: "linear-gradient(90deg, #E5E7EB 0%, #F3F4F6 50%, #E5E7EB 100%)",
        backgroundSize: "200% 100%",
      }}
      animate={{ backgroundPosition: ["0% 0%", "100% 0%"] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden" style={{ width: "320px" }}>
      <Skeleton variant="rectangular" height="200px" className="rounded-none" />
      <div className="p-5 space-y-4">
        <Skeleton variant="text" height="20px" width="80%" />
        <div className="space-y-2">
          <Skeleton variant="text" height="14px" width="100%" />
          <Skeleton variant="text" height="14px" width="90%" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton variant="text" height="14px" width="60px" />
          <Skeleton variant="text" height="14px" width="50px" />
        </div>
        <Skeleton variant="rectangular" height="36px" width="100%" className="rounded-lg" />
      </div>
    </div>
  );
}
