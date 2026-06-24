// ── 共享语言列表（单一事实来源 / SSOT）──
//
// 这里是「母语」与「目标语言」共用的语言全集（29 种，Qwen3.5-Omni full support）。
// 之前 GoalSetting（目标语言，29 种）、Onboarding（母语，29 种）、Profile（母语，9 种）
// 各自维护一份，导致 Profile 母语下拉选项远少于 goal-setting，三处不一致。
// 现统一为本文件，避免漂移。
//
// 字段说明：
//   value   — 后端/AI 识别用的英文规范名（写入 native_language / target_language）
//   label   — 该语言的「本地名」自称（母语下拉更友好：日本語 / 한국어 / العربية）
//   labelZh — 中文译名（GoalSetting「选择你想练习的外语」用，面向中文界面用户）
//   flag    — 旗帜 emoji
//
// 新增语言：在此追加一项即可，三处下拉自动同步。
export const LANGUAGES = [
  { value: 'Chinese',      label: '中文',             labelZh: '中文（普通话）', flag: '🇨🇳' },
  { value: 'English',      label: 'English',          labelZh: '英语',           flag: '🇺🇸' },
  { value: 'Japanese',     label: '日本語',            labelZh: '日语',           flag: '🇯🇵' },
  { value: 'Korean',       label: '한국어',            labelZh: '韩语',           flag: '🇰🇷' },
  { value: 'French',       label: 'Français',         labelZh: '法语',           flag: '🇫🇷' },
  { value: 'Spanish',      label: 'Español',          labelZh: '西班牙语',       flag: '🇪🇸' },
  { value: 'German',       label: 'Deutsch',          labelZh: '德语',           flag: '🇩🇪' },
  { value: 'Portuguese',   label: 'Português',        labelZh: '葡萄牙语',       flag: '🇧🇷' },
  { value: 'Russian',      label: 'Русский',          labelZh: '俄语',           flag: '🇷🇺' },
  { value: 'Italian',      label: 'Italiano',         labelZh: '意大利语',       flag: '🇮🇹' },
  { value: 'Thai',         label: 'ภาษาไทย',          labelZh: '泰语',           flag: '🇹🇭' },
  { value: 'Indonesian',   label: 'Bahasa Indonesia', labelZh: '印度尼西亚语',   flag: '🇮🇩' },
  { value: 'Arabic',       label: 'العربية',           labelZh: '阿拉伯语',       flag: '🇸🇦' },
  { value: 'Vietnamese',   label: 'Tiếng Việt',       labelZh: '越南语',         flag: '🇻🇳' },
  { value: 'Turkish',      label: 'Türkçe',           labelZh: '土耳其语',       flag: '🇹🇷' },
  { value: 'Finnish',      label: 'Suomi',            labelZh: '芬兰语',         flag: '🇫🇮' },
  { value: 'Polish',       label: 'Polski',           labelZh: '波兰语',         flag: '🇵🇱' },
  { value: 'Hindi',        label: 'हिन्दी',             labelZh: '印地语',         flag: '🇮🇳' },
  { value: 'Dutch',        label: 'Nederlands',       labelZh: '荷兰语',         flag: '🇳🇱' },
  { value: 'Czech',        label: 'Čeština',          labelZh: '捷克语',         flag: '🇨🇿' },
  { value: 'Urdu',         label: 'اردو',              labelZh: '乌尔都语',       flag: '🇵🇰' },
  { value: 'Filipino',     label: 'Tagalog',          labelZh: '他加禄语',       flag: '🇵🇭' },
  { value: 'Swedish',      label: 'Svenska',          labelZh: '瑞典语',         flag: '🇸🇪' },
  { value: 'Danish',       label: 'Dansk',            labelZh: '丹麦语',         flag: '🇩🇰' },
  { value: 'Hebrew',       label: 'עברית',             labelZh: '希伯来语',       flag: '🇮🇱' },
  { value: 'Icelandic',    label: 'Íslenska',         labelZh: '冰岛语',         flag: '🇮🇸' },
  { value: 'Malay',        label: 'Bahasa Melayu',    labelZh: '马来语',         flag: '🇲🇾' },
  { value: 'Norwegian',    label: 'Norsk',            labelZh: '挪威语',         flag: '🇳🇴' },
  { value: 'Persian',      label: 'فارسی',             labelZh: '波斯语',         flag: '🇮🇷' },
];

export default LANGUAGES;
