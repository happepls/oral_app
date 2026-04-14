import React from 'react';

/**
 * DashScenarioCard — 场景轮播紧凑卡片
 * 用于 Dashboard 横向滚动区域
 */

const DIFFICULTY_CONFIG = {
  beginner:     { label: '初级', color: '#10B981' },
  intermediate: { label: '中级', color: '#F59E0B' },
  advanced:     { label: '高级', color: '#FB7250' },
};

export function DashScenarioCard({
  title,
  emoji = '💬',
  difficulty = 'intermediate',
  state = 'default',   // 'default' | 'active' | 'completed' | 'locked'
  isPremiumLock = false,
  progress = 0,
  onPress,
}) {
  const diff = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.intermediate;
  const isLocked = state === 'locked' || isPremiumLock;
  const isCompleted = state === 'completed';
  const isActive = state === 'active';

  let borderStyle = '1px solid #E5E7EB';
  if (isActive) borderStyle = '2px solid #637FF1';
  if (isCompleted) borderStyle = '2px solid #10B981';
  if (isPremiumLock) borderStyle = '1.5px dashed #F6B443';

  return (
    <button
      onClick={!isLocked ? onPress : undefined}
      className="flex flex-col items-center gap-2 rounded-2xl p-3 bg-white transition-all relative flex-shrink-0 snap-start"
      style={{
        minWidth: 96,
        maxWidth: 104,
        border: borderStyle,
        opacity: isLocked && !isPremiumLock ? 0.5 : 1,
        cursor: isLocked ? 'default' : 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      {/* 锁定遮罩 */}
      {isLocked && (
        <div className="absolute inset-0 rounded-2xl flex items-center justify-end p-1.5 pointer-events-none">
          {isPremiumLock ? (
            <span className="text-sm">👑</span>
          ) : (
            <span className="text-sm">🔒</span>
          )}
        </div>
      )}

      {/* 完成勾 */}
      {isCompleted && (
        <div
          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white"
          style={{ backgroundColor: '#10B981', fontSize: 9 }}
        >
          ✓
        </div>
      )}

      {/* Emoji 图标 */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
        style={{ backgroundColor: '#F3F4F6' }}
      >
        {emoji}
      </div>

      {/* 标题 */}
      <span
        className="text-center font-medium leading-tight"
        style={{ fontSize: 11, color: '#1F2937', maxWidth: 80, wordBreak: 'keep-all' }}
      >
        {title}
      </span>

      {/* 难度 badge */}
      {!isPremiumLock ? (
        <span
          className="rounded-full px-2 py-0.5 font-medium"
          style={{ fontSize: 9, backgroundColor: diff.color + '22', color: diff.color }}
        >
          {diff.label}
        </span>
      ) : (
        <span
          className="rounded-full px-2 py-0.5 font-semibold"
          style={{ fontSize: 9, backgroundColor: '#FEF3C7', color: '#D97706' }}
        >
          Pro
        </span>
      )}

      {/* 进度条（进行中时显示） */}
      {progress > 0 && progress < 100 && !isLocked && (
        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden mt-0.5">
          <div
            className="h-full rounded-full"
            style={{ width: `${progress}%`, backgroundColor: '#637FF1', transition: 'width 0.4s ease' }}
          />
        </div>
      )}
    </button>
  );
}
