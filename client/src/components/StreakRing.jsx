import React from 'react';

/**
 * StreakRing — 连续学习进度环
 * 橙色渐变背景卡片 + SVG 进度环 + 打卡按钮
 */
export function StreakRing({ streak = 0, monthlyTarget = 30, checkedInToday = false, onCheckin }) {
  const pct = Math.min(100, Math.round((streak / monthlyTarget) * 100));
  // SVG stroke-dasharray: circumference 约100，用 pct 表示填充
  const dashFill = pct;

  return (
    <div
      className="rounded-3xl p-5 text-white relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #ff6b35, #f7931e)' }}
    >
      {/* 装饰光晕 */}
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl" />
      <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-white opacity-10 rounded-full blur-xl" />

      <div className="relative z-10 flex items-center justify-between">
        {/* 左侧：火焰 + 天数 */}
        <div className="flex items-center gap-3">
          <span className="text-4xl animate-pulse select-none">🔥</span>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold leading-none">{streak}</span>
              <span className="text-base font-medium opacity-80">天</span>
            </div>
            <p className="text-sm opacity-75 mt-0.5">连续学习</p>
          </div>
        </div>

        {/* 右侧：进度环 + 打卡 */}
        <div className="flex flex-col items-center gap-2">
          {/* SVG 进度环 */}
          <div className="relative w-16 h-16">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              {/* 背景轨道 */}
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="3"
              />
              {/* 填充轨道 */}
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${dashFill}, 100`}
                style={{ transition: 'stroke-dasharray 0.8s ease' }}
              />
            </svg>
            {/* 中心文字 */}
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
              {pct}%
            </span>
          </div>
          <p className="text-xs opacity-70 whitespace-nowrap">本月 {monthlyTarget} 天</p>

          {/* 打卡按钮 */}
          {!checkedInToday && onCheckin && (
            <button
              onClick={onCheckin}
              className="mt-1 px-3 py-1 rounded-full text-xs font-semibold transition-all"
              style={{ background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(4px)' }}
            >
              打卡 ✓
            </button>
          )}
          {checkedInToday && (
            <span className="mt-1 text-xs opacity-70">今日已打卡 ✓</span>
          )}
        </div>
      </div>
    </div>
  );
}
