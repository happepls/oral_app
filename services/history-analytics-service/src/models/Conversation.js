const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, required: true },
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

module.exports = mongoose.model('Conversation', ConversationSchema);
