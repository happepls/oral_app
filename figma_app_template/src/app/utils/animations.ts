/**
 * 标准化的动画时间配置
 * 
 * 根据设计规范定义所有动画的时长和缓动函数
 */

export const animationConfig = {
  // 按钮悬停动画
  buttonHover: {
    duration: 0.2, // 200ms
    ease: "easeOut",
  },

  // 卡片悬停动画
  cardHover: {
    duration: 0.25, // 250ms
    ease: [0.4, 0, 0.2, 1], // cubic-bezier
  },

  // 页面过渡动画
  pageTransition: {
    duration: 0.3, // 300ms
    ease: "easeInOut",
  },

  // 加载旋转动画
  spinner: {
    duration: 1, // 1000ms
    ease: "linear",
    repeat: Infinity,
  },

  // 脉冲动画
  pulse: {
    duration: 1.5, // 1500ms
    ease: "easeInOut",
    repeat: Infinity,
  },

  // 骨架屏 shimmer 动画
  shimmer: {
    duration: 1.8, // 1800ms
    ease: "linear",
    repeat: Infinity,
  },

  // 淡入淡出
  fade: {
    duration: 0.3,
    ease: "easeInOut",
  },

  // 缩放动画
  scale: {
    duration: 0.2,
    ease: "easeOut",
  },

  // 滑动动画
  slide: {
    duration: 0.3,
    ease: "easeInOut",
  },
} as const;

/**
 * 预定义的 Motion 变体配置
 */
export const motionVariants = {
  // 淡入效果
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: animationConfig.fade,
  },

  // 从下往上滑入
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: animationConfig.slide,
  },

  // 从左往右滑入
  slideInFromLeft: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: animationConfig.pageTransition,
  },

  // 从右往左滑入
  slideInFromRight: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: animationConfig.pageTransition,
  },

  // 缩放进入
  scaleIn: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
    transition: animationConfig.pageTransition,
  },

  // 按钮悬停效果
  buttonHover: {
    whileHover: { scale: 1.05 },
    whileTap: { scale: 0.95 },
    transition: animationConfig.buttonHover,
  },

  // 卡片悬停效果
  cardHover: {
    whileHover: { y: -4, scale: 1.02 },
    transition: animationConfig.cardHover,
  },
} as const;
