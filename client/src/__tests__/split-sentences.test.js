// Unit tests for splitIntoSentences() in pages/Conversation.js.
//
// splitIntoSentences breaks AI text into individual sentences for the rolling
// caption. It splits on CJK and Latin terminal punctuation (。！？!?.), trims each
// fragment, and drops fragments with no readable content (no letter/digit). There
// is NO length-based merging — every sentence becomes its own caption line. To
// test without importing Conversation.js (heavy React module), the function is
// replicated VERBATIM below. If you change it there, mirror the change here.

// ---- replicated verbatim from client/src/pages/Conversation.js ----

function splitIntoSentences(text) {
  if (!text) return [];
  const raw = text.match(/[^。！？!?.]+[。！？!?.]?/g) || [text];
  return raw
    .map(s => s.trim())
    .filter(s => /[\p{L}\p{N}]/u.test(s)); // keep only fragments containing a letter or digit
}

// ---- end replicated body ----

describe('splitIntoSentences — empty / falsy input', () => {
  test('empty string → []', () => {
    expect(splitIntoSentences('')).toEqual([]);
  });

  test('null → []', () => {
    expect(splitIntoSentences(null)).toEqual([]);
  });

  test('undefined → []', () => {
    expect(splitIntoSentences(undefined)).toEqual([]);
  });

  test('whitespace-only → [] (trimmed fragments have no letter/digit)', () => {
    expect(splitIntoSentences('   \n  ')).toEqual([]);
  });

  test('punctuation-only → [] (no readable content)', () => {
    expect(splitIntoSentences('。！？...')).toEqual([]);
  });
});

describe('splitIntoSentences — CJK boundaries (。！？)', () => {
  test('splits Chinese on 。 ！ ？ and keeps terminators', () => {
    expect(splitIntoSentences('你好。今天怎么样？很好！')).toEqual([
      '你好。',
      '今天怎么样？',
      '很好！',
    ]);
  });

  test('single CJK sentence without trailing punctuation still returned', () => {
    expect(splitIntoSentences('你好世界')).toEqual(['你好世界']);
  });
});

describe('splitIntoSentences — Latin boundaries (. ! ?)', () => {
  test('splits English on . ! ? and trims surrounding space', () => {
    expect(splitIntoSentences('Hello. How are you? I am fine!')).toEqual([
      'Hello.',
      'How are you?',
      'I am fine!',
    ]);
  });

  test('trailing fragment without terminal punctuation is kept', () => {
    expect(splitIntoSentences('First. Second')).toEqual(['First.', 'Second']);
  });
});

describe('splitIntoSentences — mixed CJK + Latin', () => {
  test('mixed-language text splits at each terminal mark', () => {
    expect(splitIntoSentences('Hello！你好。Nice to meet you?')).toEqual([
      'Hello！',
      '你好。',
      'Nice to meet you?',
    ]);
  });

  test('numeric content survives the letter/digit filter', () => {
    expect(splitIntoSentences('Pay 100. 谢谢！')).toEqual(['Pay 100.', '谢谢！']);
  });

  test('produces one line per sentence with no length-based merging', () => {
    const out = splitIntoSentences('A. B. C. D.');
    expect(out).toEqual(['A.', 'B.', 'C.', 'D.']);
    expect(out).toHaveLength(4);
  });
});
