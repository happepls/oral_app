const test = require('node:test');
const assert = require('node:assert/strict');
const Conversation = require('../src/models/Conversation');
const controller = require('../src/controllers/historyController');

const evidence = {
  status: 'clear', heard_text: '予約システムです。', uncertain_spans: [],
  speech_scores: { pronunciation: 85, fluency: 80, intonation: 75 },
};
function response() {
  return { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
}

test('evidence survives Mongo schema, delayed ASR saves, audio patches and browser snapshots', async () => {
  const original = Conversation.findOne;
  const doc = new Conversation({ userId: 'synthetic', sessionId: 'evidence-test', messages: [] });
  doc.save = async () => doc;
  Conversation.findOne = async () => doc;
  async function save(message) {
    const res = response();
    await controller.saveSessionMessages({ params: { sessionId: doc.sessionId },
      body: { userId: doc.userId, messages: [{ id: 'asr-1', role: 'user', content: 'display ASR', ...message }] } }, res);
    assert.equal(res.code, 201);
  }
  try {
    await save({ input_source: 'audio', audio_evidence: evidence });
    await save({ input_source: 'audio' });
    await save({ audioUrl: 'https://example.test/synthetic.wav' });
    await save({});
    assert.equal(doc.validateSync(), undefined);
    const restored = new Conversation(doc.toObject());
    assert.deepEqual(restored.messages[0].audio_evidence.toObject(), evidence);
    assert.equal(restored.messages[0].content, 'display ASR');
    assert.equal(restored.messages[0].input_source, 'audio');
    assert.equal(restored.messages.length, 1);
  } finally { Conversation.findOne = original; }
});

test('malformed acoustic scores retain audio marker but cannot become trusted evidence', async () => {
  const original = Conversation.findOne;
  const doc = new Conversation({ userId: 'synthetic', sessionId: 'invalid-evidence', messages: [] });
  doc.save = async () => doc;
  Conversation.findOne = async () => doc;
  try {
    const res = response();
    await controller.saveSessionMessages({ params: { sessionId: doc.sessionId }, body: {
      userId: doc.userId, messages: [{ id: 'asr-invalid', role: 'user', content: 'raw', input_source: 'audio',
        audio_evidence: { ...evidence, speech_scores: { ...evidence.speech_scores, fluency: '80' } } }],
    } }, res);
    assert.equal(res.code, 201);
    assert.equal(doc.messages[0].input_source, 'audio');
    assert.equal(doc.messages[0].audio_evidence, undefined);
  } finally { Conversation.findOne = original; }
});
