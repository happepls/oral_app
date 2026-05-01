export const PERSONA_MAP = {
  Tina: {
    name: 'Tina',
    letter: 'T',
    color: '#637FF1',
    bgGradient: 'linear-gradient(135deg, #637FF1, #8B9FF5)',
    desc: '温柔耐心的老师',
    subtitle: '适合初学者，循序渐进',
    emoji: '👩',
    isFree: true,
  },
  Serena: {
    name: 'Serena',
    letter: 'S',
    color: '#a47af6',
    bgGradient: 'linear-gradient(135deg, #a47af6, #c49dfa)',
    desc: '活泼幽默的学姐',
    subtitle: '鼓励式教学，轻松有趣',
    emoji: '👧',
    isFree: false,
  },
  Evan: {
    name: 'Evan',
    letter: 'E',
    color: '#10B981',
    bgGradient: 'linear-gradient(135deg, #10B981, #34D399)',
    desc: '沉稳专业的导师',
    subtitle: '逻辑清晰，系统教学',
    emoji: '👨',
    isFree: false,
  },
  Arda: {
    name: 'Arda',
    letter: 'A',
    color: '#F59E0B',
    bgGradient: 'linear-gradient(135deg, #F59E0B, #FBBF24)',
    desc: '随和风趣的朋友',
    subtitle: '轻松对话，像聊天一样',
    emoji: '🧑',
    isFree: false,
  },
};

export const DEFAULT_VOICE = 'Tina';

export const VOICE_OPTIONS = Object.values(PERSONA_MAP).map(p => ({
  id: p.name, name: p.name, desc: p.desc, subtitle: p.subtitle,
  emoji: p.emoji, color: p.color, bgGradient: p.bgGradient,
  letter: p.letter, isFree: p.isFree,
}));

export function getPersona(voiceId) {
  return PERSONA_MAP[voiceId] || PERSONA_MAP[DEFAULT_VOICE];
}
