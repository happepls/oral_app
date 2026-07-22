const SCENARIO_TITLE_ZH = {
  'Business Introduction': '商务自我介绍',
  'Self Introduction': '自我介绍',
  'Self Introduction (Exam)': '考试自我介绍',
  'Airport Check-in': '机场值机',
  'Coffee Shop Order': '咖啡店点单',
  'Grocery Shopping': '超市购物',
  Directions: '问路',
  'Restaurant Dining': '餐厅用餐',
  'Restaurant Ordering': '餐厅点餐',
  'Hotel Reservation': '酒店预订',
  'Meeting Scheduling': '安排会议',
  'Project Status Update': '项目进度汇报',
  'Client Presentation': '客户演示',
  'Negotiation Basics': '谈判基础',
  'Public Transport': '公共交通',
  'Weekend Plans': '周末计划',
  'Hobbies Discussion': '兴趣交流',
  'Professional Small Talk': '职场闲聊',
  'Immigration Control': '入境检查',
  'Shopping Abroad': '海外购物',
  'Emergency Situations': '紧急情况',
  'Sightseeing Tours': '观光游览',
  'Cultural Small Talk': '文化交流',
  'Describing Pictures': '图片描述',
  'Opinion Questions': '观点表达',
  'Problem Solving': '问题解决',
  'Role-play Scenarios': '角色扮演',
  'Discussion & Debate': '讨论与辩论',
  'Long Turn Speaking': '长篇表达',
  'Pronunciation Practice': '发音练习',
  'Vocabulary Expansion': '词汇拓展',
  'Mock Exam Practice': '模拟考试',
};

// Localize only the display value. The original title remains untouched for
// conversation routing, history matching and target-language teaching.
export function getScenarioDisplayTitle(title, index, uiLanguage = 'zh') {
  const raw = String(title || '').trim();
  if (!uiLanguage.toLowerCase().startsWith('zh') || !raw) return raw;
  if (SCENARIO_TITLE_ZH[raw]) return SCENARIO_TITLE_ZH[raw];
  if (/\p{Script=Han}/u.test(raw)) return raw;
  return `练习场景 ${index + 1}`;
}
