import React, { useState, useEffect, useMemo } from 'react';

const AudioBar = ({ duration: propDuration, onClick, isActive = false, audioUrl, isOwnMessage = false }) => {
  const [actualDuration, setActualDuration] = useState(propDuration);

  // Calculate actual duration when audioUrl changes
  useEffect(() => {
    if (audioUrl && !propDuration) {
      const audio = new Audio();

      const onLoadedMetadata = () => {
        setActualDuration(audio.duration);
      };

      const onError = (e) => {
        console.error('Audio loading error:', e);
        // Fallback to propDuration if metadata fails to load
        setActualDuration(propDuration || 0);
      };

      audio.addEventListener('loadedmetadata', onLoadedMetadata);
      audio.addEventListener('error', onError);

      audio.src = audioUrl;

      // Cleanup
      return () => {
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('error', onError);
        audio.src = '';
      };
    } else {
      setActualDuration(propDuration);
    }
  }, [audioUrl, propDuration]);

  // Determine final duration to use
  const displayDuration = actualDuration > 0 ? actualDuration : propDuration;

  // Generate bars based on duration (each bar represents ~0.5 seconds)
  const numBars = Math.min(Math.ceil(displayDuration / 0.5), 50); // Limit to 50 bars max
  // Memoize heights so waveform doesn't flicker on every re-render
  const barHeights = useMemo(
    () => Array.from({ length: numBars }, () => 20 + Math.random() * 20),
    [numBars]
  );

  // Styles based on ownership
  const barColor = isOwnMessage ? 'bg-white/80' : 'bg-blue-400';
  const timeColor = isOwnMessage ? 'text-blue-100' : 'text-gray-500';
  const btnBg = isOwnMessage
    ? 'bg-white/20 hover:bg-white/35 text-white'
    : 'bg-blue-500 hover:bg-blue-600 text-white';

  return (
    <div className="flex items-center gap-2 w-full">
      {/* Play/Pause circular button */}
      <button
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-colors ${btnBg}`}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        aria-label={isActive ? '暂停' : '播放'}
      >
        <span className="material-symbols-outlined text-base leading-none">
          {isActive ? 'pause' : 'play_arrow'}
        </span>
      </button>
      {/* Waveform bars */}
      <div
        className={`flex items-center gap-0.5 flex-grow h-8 cursor-pointer ${isActive ? 'opacity-75' : ''}`}
        onClick={onClick}
      >
        {barHeights.map((height, bar) => (
          <div
            key={bar}
            className={`${barColor} rounded-sm flex-grow`}
            style={{
              height: `${height}px`,
              minWidth: '2px',
              maxWidth: '8px',
            }}
          />
        ))}
      </div>
      <span className={`text-xs ${timeColor} min-w-[32px] text-right`}>
        {displayDuration > 0 ? displayDuration.toFixed(1) + 's' : '--s'}
      </span>
    </div>
  );
};

export default AudioBar;