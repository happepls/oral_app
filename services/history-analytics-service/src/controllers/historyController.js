const Conversation = require('../models/Conversation');

exports.saveConversation = async (req, res) => {
  try {
    console.log('saveConversation endpoint called');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { sessionId, userId, messages, topic, metrics, startTime, endTime } = req.body;
    
    // Validate required fields
    if (!sessionId) {
      console.log('Error: sessionId is required');
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }
    if (!userId) {
      console.log('Error: userId is required');
      return res.status(400).json({ success: false, message: 'userId is required' });
    }
    if (!messages || !Array.isArray(messages)) {
      console.log('Error: messages must be an array');
      return res.status(400).json({ success: false, message: 'messages must be an array' });
    }

    // Filter out empty messages (must have content OR audioUrl)
    // Relaxed check: allow '...' placeholders if they have audio, or just audio
    const validMessages = messages ? messages.filter(msg => 
        (msg.content && msg.content.trim().length > 0) || msg.audioUrl
    ) : [];

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

    console.log(`Successfully saved conversation for session ${sessionId}`);
    res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    console.error('Save Conversation Error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

exports.saveSessionMessages = async (req, res) => {
  try {
    console.log('saveSessionMessages endpoint called');
    console.log('Request params:', JSON.stringify(req.params, null, 2));
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { sessionId } = req.params;
    const { userId, messages } = req.body;

    console.log(`saveSessionMessages called with sessionId: ${sessionId}, userId: ${userId}`);
    console.log(`Messages count: ${messages ? messages.length : 0}`);

    if (!userId || !messages) {
      console.log(`Missing required fields - userId: ${userId}, messages: ${messages}`);
      return res.status(400).json({ 
        success: false, 
        message: 'userId and messages are required' 
      });
    }

    // Filter out empty messages
    const validMessages = messages.filter(msg => 
        (msg.content && msg.content.trim().length > 0) || msg.audioUrl
    );

    if (validMessages.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No valid messages to save' 
      });
    }

    let conversation = await Conversation.findOne({ sessionId });

    if (conversation) {
      // Append new messages to existing conversation
      conversation.messages.push(...validMessages);
      conversation.endTime = new Date();
      await conversation.save();
      console.log(`Appended ${validMessages.length} messages to existing session ${sessionId}`);
    } else {
      // Create new conversation
      conversation = new Conversation({
        sessionId,
        userId,
        messages: validMessages,
        startTime: new Date(),
        endTime: new Date()
      });
      await conversation.save();
      console.log(`Created new session ${sessionId} with ${validMessages.length} messages`);
    }

    res.status(201).json({ 
      success: true, 
      message: 'Messages saved successfully',
      data: { 
        sessionId,
        messageCount: conversation.messages.length
      }
    });
  } catch (error) {
    console.error('Save Session Messages Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server Error' 
    });
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
    console.log(`Looking for conversation with sessionId: ${sessionId}`);
    const conversation = await Conversation.findOne({ sessionId: sessionId });

    if (!conversation) {
      console.log(`Conversation not found for sessionId: ${sessionId}`);
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    console.log(`Found conversation with ${conversation.messages ? conversation.messages.length : 0} messages`);
    res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    console.error('Get Detail Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getSessionHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`Looking for session history with sessionId: ${sessionId}`);
    const conversation = await Conversation.findOne({ sessionId: sessionId });

    if (!conversation) {
      console.log(`No conversation found for sessionId: ${sessionId}, returning empty messages`);
      return res.status(200).json({ 
        success: true, 
        data: { messages: [] } 
      });
    }

    console.log(`Found conversation with ${conversation.messages ? conversation.messages.length : 0} messages for session ${sessionId}`);
    console.log(`First few messages:`, conversation.messages ? conversation.messages.slice(0, 3).map(m => ({role: m.role, content: m.content?.substring(0, 50)})) : 'No messages');
    res.status(200).json({ success: true, data: { messages: conversation.messages || [] } });
  } catch (error) {
    console.error('Get Session History Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.saveSummary = async (req, res) => {
  try {
    const { sessionId, userId, summary, feedback, proficiency_score_delta, goalId } = req.body;

    // Helper for syncing proficiency
    const syncProficiency = async (uid, delta) => {
        if (delta && delta !== 0) {
            try {
                console.log(`[Summary] Syncing proficiency delta ${delta} for user ${uid}`);
                const syncRes = await fetch(`http://user-service:3000/internal/users/${uid}/proficiency`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ delta })
                });
                if (!syncRes.ok) {
                    console.error(`[Summary] Sync failed: ${syncRes.status} ${await syncRes.text()}`);
                } else {
                    console.log(`[Summary] Sync success: ${await syncRes.text()}`);
                }
            } catch (syncError) {
                console.error('Failed to sync proficiency to user-service:', syncError);
            }
        }
    };

    let conversation = await Conversation.findOne({ sessionId });

    if (conversation) {
      conversation.summary = summary || conversation.summary;
      if (goalId) conversation.goalId = goalId;
      
      if (!conversation.metrics) conversation.metrics = {};
      if (feedback) conversation.metrics.feedback = feedback;
      if (proficiency_score_delta !== undefined) {
          conversation.metrics.proficiencyScoreDelta = proficiency_score_delta;
          await syncProficiency(userId || conversation.userId, proficiency_score_delta);
      }
      
      await conversation.save();
    } else {
      if (!userId) {
          return res.status(400).json({ success: false, message: 'UserId required to create conversation summary' });
      }
      
      // Sync first
      if (proficiency_score_delta !== undefined) {
          await syncProficiency(userId, proficiency_score_delta);
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

exports.getStats = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({ success: false, message: 'UserId is required' });
    }

    const totalSessions = await Conversation.countDocuments({ userId });
    
    // Aggregate for total duration and avg fluency
    const stats = await Conversation.aggregate([
      { $match: { userId: userId } },
      {
        $group: {
          _id: null,
          totalDurationMs: { $sum: { $subtract: ["$endTime", "$startTime"] } },
          avgFluency: { $avg: "$metrics.proficiencyScoreDelta" }
        }
      }
    ]);

    // Calculate Learning Streak or Distinct Days
    const distinctDays = await Conversation.aggregate([
        { $match: { userId: userId } },
        { 
            $project: { 
                dateStr: { $dateToString: { format: "%Y-%m-%d", date: "$startTime" } } 
            } 
        },
        { $group: { _id: "$dateStr" } },
        { $count: "count" }
    ]);

    const data = {
        totalSessions,
        totalDurationMinutes: stats.length > 0 ? Math.round((stats[0].totalDurationMs || 0) / 1000 / 60) : 0,
        averageScore: stats.length > 0 ? Math.round(stats[0].avgFluency || 0) : 0,
        learningDays: distinctDays.length > 0 ? distinctDays[0].count : 0,
        proficiency: 0 // Default
    };

    // Fetch real-time proficiency from user-service
    try {
        const userRes = await fetch(`http://user-service:3000/internal/users/${userId}`);
        const text = await userRes.text(); // Get raw text first for debugging
        console.log(`[Stats] User Service Response for ${userId}: ${text}`);
        
        if (userRes.ok) {
            const userData = JSON.parse(text);
            if (userData.success && userData.data) {
                data.proficiency = userData.data.proficiency || 0;
            }
        } else {
            console.error(`[Stats] User Service fetch failed: ${userRes.status}`);
        }
    } catch (e) {
        console.error('Failed to fetch user proficiency for stats:', e);
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get Stats Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};