const Conversation = require('../models/Conversation');

exports.saveConversation = async (req, res) => {
  try {
    const { sessionId, userId, messages, topic, metrics, startTime, endTime } = req.body;

    // Filter out empty messages
    const validMessages = messages ? messages.filter(msg => msg.content && msg.content.trim().length > 0) : [];

    let conversation = await Conversation.findOne({ sessionId });

    if (conversation) {
      // Update existing
      conversation.messages = validMessages.length > 0 ? validMessages : conversation.messages;
      conversation.metrics = metrics || conversation.metrics;
      conversation.endTime = endTime || conversation.endTime;
      conversation.topic = topic || conversation.topic;
      await conversation.save();
    } else {
      // Create new
      conversation = new Conversation({
        sessionId,
        userId,
        messages: validMessages,
        topic,
        metrics,
        startTime,
        endTime
      });
      await conversation.save();
    }

    res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    console.error('Save Conversation Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getUserHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const conversations = await Conversation.find({ userId })
      .sort({ startTime: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-messages'); // Exclude messages for list view to save bandwidth

    const count = await Conversation.countDocuments({ userId });

    res.status(200).json({
      success: true,
      data: conversations,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Get History Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getConversationDetail = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const conversation = await Conversation.findOne({ sessionId });

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    console.error('Get Detail Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.saveSummary = async (req, res) => {
  try {
    const { sessionId, userId, summary, feedback, proficiency_score_delta, goalId } = req.body;

    let conversation = await Conversation.findOne({ sessionId });

    if (conversation) {
      conversation.summary = summary || conversation.summary;
      if (goalId) conversation.goalId = goalId;
      
      if (!conversation.metrics) conversation.metrics = {};
      if (feedback) conversation.metrics.feedback = feedback;
      if (proficiency_score_delta !== undefined) conversation.metrics.proficiencyScoreDelta = proficiency_score_delta;
      
      await conversation.save();
    } else {
      if (!userId) {
          return res.status(400).json({ success: false, message: 'UserId required to create conversation summary' });
      }
      conversation = new Conversation({
        sessionId,
        userId,
        summary,
        goalId,
        metrics: {
            feedback,
            proficiencyScoreDelta: proficiency_score_delta
        }
      });
      await conversation.save();
    }

    res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    console.error('Save Summary Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

