import React, { useState, useEffect } from 'react';

const AudioBar = ({ duration: propDuration, onClick, isActive = false, audioUrl, isOwnMessage = false }) => {
  const [actualDuration, setActualDuration] = useState(propDuration);

  // Calculate actual duration when audioUrl changes
  useEffect(() => {
    if (audioUrl && !propDuration) {
      const audio = new Audio();
      
      const onLoadedMetadata = () => {
        setActualDuration(audio.duration);
      };
      
      const onError = () => {
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
  const bars = Array.from({ length: numBars }, (_, i) => i);

  // Styles based on ownership
  const barColor = isOwnMessage ? 'bg-white/80' : 'bg-blue-400';
  const buttonClass = isOwnMessage 
    ? 'bg-white/20 hover:bg-white/30 text-white' 
    : 'bg-blue-100 hover:bg-blue-200 text-blue-700';
  const timeColor = isOwnMessage ? 'text-blue-100' : 'text-gray-500';

  return (
    <div className="flex items-center gap-2 w-full">
      <div 
        className={`flex items-center gap-0.5 flex-grow h-8 cursor-pointer ${isActive ? 'opacity-75' : ''}`}
        onClick={onClick}
      >
        {bars.map((bar) => (
          <div
            key={bar}
            className={`${barColor} rounded-sm flex-grow`}
            style={{
              height: `${20 + Math.random() * 20}px`, // Random heights for visualization
              minWidth: '2px',
              maxWidth: '8px',
            }}
          />
        ))}
      </div>
      <span className={`text-xs ${timeColor} min-w-[40px]`}>
        {displayDuration > 0 ? displayDuration.toFixed(1) + 's' : '--s'}
      </span>
      <button 
        className={`text-xs px-2 py-1 rounded ${buttonClass}`}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        重听
      </button>
    </div>
  );
};

export default AudioBar;