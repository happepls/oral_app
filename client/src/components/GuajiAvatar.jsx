const MOOD_SVG = {
  happy: 'bird-expression-happy.svg',
  excited: 'bird-expression-excited.svg',
  confuse: 'bird-expression-confuse.svg',
  confused: 'bird-expression-confuse.svg',
  loving: 'bird-expression-loving.svg',
  proud: 'bird-expression-proud.svg',
  sleepy: 'bird-expression-sleepy.svg',
  surprised: 'bird-expression-surprised.svg',
  thinking: 'bird-expression-thinking.svg',
  winking: 'bird-expression-winking.svg',
  calm: 'bird-logo.svg',
};

export function GuajiAvatar({ mood = 'calm', size = 36, className = '' }) {
  const svgFile = MOOD_SVG[mood] || MOOD_SVG.calm;
  const svgPath = `${process.env.PUBLIC_URL}/assets/mascot/${svgFile}`;

  return (
    <div className={className} style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #C8C6E8, #DBD9F2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      <img
        src={svgPath}
        alt="avatar"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}
