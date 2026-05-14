export function GuajiAvatar({ size = 36, className = '' }) {
  return (
    <div
      className={`rounded-full overflow-hidden flex-shrink-0 ${className}`}
      style={{
        width: size, height: size,
        background: 'linear-gradient(135deg, #D4C4F0, #E8DFFB)',
      }}
    >
      <img
        src="/guaji-icon.png"
        alt="GuaJi"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        draggable={false}
      />
    </div>
  );
}
