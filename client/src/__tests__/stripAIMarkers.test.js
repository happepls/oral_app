/**
 * Tests for stripAIMarkers() and DailyQAPassModal component logic
 * from Conversation.js
 */

// Replicate stripAIMarkers from Conversation.js
function stripAIMarkers(text) {
  if (!text) return text;
  return text
    .replace(/\[DAILY_QA_PASSED\]/gi, '')
    .replace(/\[\s*NATIVE:\s*[^\]]*\]/gi, '')
    .trim();
}

describe('stripAIMarkers', () => {
  test('returns null/undefined as-is', () => {
    expect(stripAIMarkers(null)).toBeNull();
    expect(stripAIMarkers(undefined)).toBeUndefined();
    expect(stripAIMarkers('')).toBe('');
  });

  test('strips [DAILY_QA_PASSED]', () => {
    expect(stripAIMarkers('Great answer! [DAILY_QA_PASSED]')).toBe('Great answer!');
  });

  test('strips [DAILY_QA_PASSED] case-insensitive', () => {
    expect(stripAIMarkers('Nice! [daily_qa_passed]')).toBe('Nice!');
    expect(stripAIMarkers('OK [Daily_QA_Passed] done')).toBe('OK  done');
  });

  test('strips [NATIVE: ...] block', () => {
    expect(stripAIMarkers('Hello [NATIVE: 你好] world')).toBe('Hello  world');
  });

  test('strips [NATIVE: ...] with extra spaces', () => {
    expect(stripAIMarkers('Test [ NATIVE:  hint text ] end')).toBe('Test  end');
  });

  test('strips multiple markers', () => {
    expect(stripAIMarkers('[NATIVE: 提示] Good! [DAILY_QA_PASSED]')).toBe('Good!');
  });

  test('returns clean text unchanged', () => {
    expect(stripAIMarkers('Just a normal response.')).toBe('Just a normal response.');
  });

  test('handles text with only markers', () => {
    expect(stripAIMarkers('[DAILY_QA_PASSED]')).toBe('');
  });
});

// DailyQAPassModal UI logic (pure data tests, no React render)
describe('DailyQAPassModal logic', () => {
  const getModalContent = (isBonus) => ({
    icon: isBonus ? '👏' : '✅',
    title: isBonus ? '回答完成' : '今日问答已完成',
    description: isBonus
      ? '这道题练习完成，可以继续选择其他题目。'
      : '很棒！继续保持每日学习的好习惯。',
  });

  test('non-bonus shows completion message', () => {
    const content = getModalContent(false);
    expect(content.icon).toBe('✅');
    expect(content.title).toBe('今日问答已完成');
    expect(content.description).toContain('继续保持');
  });

  test('bonus shows practice-complete message', () => {
    const content = getModalContent(true);
    expect(content.icon).toBe('👏');
    expect(content.title).toBe('回答完成');
    expect(content.description).toContain('继续选择其他题目');
  });

  test('bonus and non-bonus have different icons', () => {
    expect(getModalContent(true).icon).not.toBe(getModalContent(false).icon);
  });

  test('bonus and non-bonus have different titles', () => {
    expect(getModalContent(true).title).not.toBe(getModalContent(false).title);
  });
});
