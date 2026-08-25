const mongoose = require('mongoose');
const crypto = require('crypto');

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
