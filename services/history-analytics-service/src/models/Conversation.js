const mongoose = require('mongoose');
const crypto = require('crypto');

const SpeechScoresSchema = new mongoose.Schema({
  pronunciation: { type: Number, required: true, min: 0, max: 100, validate: Number.isInteger },
  fluency: { type: Number, required: true, min: 0, max: 100, validate: Number.isInteger },
  intonation: { type: Number, required: true, min: 0, max: 100, validate: Number.isInteger },
}, { _id: false });

const AudioEvidenceSchema = new mongoose.Schema({
  status: { type: String, enum: ['clear', 'uncertain', 'unavailable'], required: true },
  heard_text: { type: String, maxlength: 4000, default: '' },
  uncertain_spans: {
    type: [{ type: String, maxlength: 240 }],
    default: [],
    validate: value => value.length <= 20,
  },
  speech_scores: { type: SpeechScoresSchema },
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    default: function messageIdDefault() {
      return this._id ? String(this._id) : crypto.randomUUID();
    },
  },
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, default: '' },
  audioUrl: { type: String },
  scenario: { type: String },
  task_id: { type: String },
  turn_id: { type: String },
  input_source: { type: String, enum: ['audio'] },
  audio_evidence: {
    type: AudioEvidenceSchema,
    validate: {
      validator: function validAudioEvidence(value) {
        if (!value) return true;
        if (this.input_source !== 'audio') return false;
        if (value.status !== 'clear' && value.speech_scores != null) return false;
        if (value.status === 'clear') return Boolean(value.heard_text.trim()) && value.uncertain_spans.length === 0;
        if (value.status === 'uncertain') return value.uncertain_spans.length > 0;
        return value.status === 'unavailable' && value.heard_text === '' && value.uncertain_spans.length === 0;
      },
      message: 'Invalid audio evidence state',
    },
  },
  timestamp: { type: Date, default: Date.now }
});

const ConversationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, unique: true },
  goalId: { type: String },
  summary: { type: String },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  topic: { type: String },
  messages: [MessageSchema],
  metrics: {
    fluencyScore: Number,
    vocabularyScore: Number,
    grammarScore: Number,
    feedback: String
  }
}, { timestamps: true });

ConversationSchema.index({ userId: 1, goalId: 1 });

module.exports = mongoose.model('Conversation', ConversationSchema);
