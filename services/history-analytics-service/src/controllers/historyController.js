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
    const validMessages = messages ? messages.filter(msg =>
        (msg.content && msg.content.trim().length > 0) || msg.audioUrl
    ) : [];

    let conversation = await Conversation.findOne({ sessionId });

    if (conversation) {
      // APPEND new messages to existing conversation (not replace!)
      if (validMessages.length > 0) {
        // Get the last message from existing conversation to check for duplicates
        const lastExistingMsg = conversation.messages[conversation.messages.length - 1];
        const newMsg = validMessages[validMessages.length - 1];
        
        // Only append if this is a new message (check by content + role combination)
        const isDuplicate = lastExistingMsg && 
                           lastExistingMsg.role === newMsg.role && 
                           lastExistingMsg.content === newMsg.content;
        
        if (!isDuplicate) {
          conversation.messages.push(...validMessages);
          console.log(`Appended ${validMessages.length} messages to session ${sessionId}, total: ${conversation.messages.length}`);
        } else {
          console.log(`Duplicate message detected, skipping append for session ${sessionId}`);
        }
      }
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
        startTime: startTime || new Date(),
        endTime
      });
      await conversation.save();
      console.log(`Created new session ${sessionId} with ${validMessages.length} messages`);
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
      console.log(`Conversation not found for sessionId: ${sessionId}, returning empty conversation object`);
      // Return an empty conversation object instead of creating one with null userId
      return res.status(200).json({
        success: true,
        data: {
          sessionId,
          messages: [],
          startTime: new Date()
        }
      });
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
      console.log(`No conversation found for sessionId: ${sessionId}, creating new empty conversation`);
      // Create a new conversation record with empty messages
      const newConversation = new Conversation({
        sessionId,
        userId: null, // userId might not be available at this point
        messages: [],
        startTime: new Date()
      });
      await newConversation.save();
      
      console.log(`Created new conversation record for session ${sessionId}`);
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

// Proficiency metrics persistence
exports.saveProficiencyMetrics = async (req, res) => {
  try {
    const { userId } = req.params;
    const { language_accuracy, complexity_score, engagement_level, improvement_suggestions, total_interactions, cumulative_accuracy, cumulative_complexity, total_proficiency } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'UserId is required' });
    }

    // Validate metrics
    if (typeof language_accuracy !== 'number' || typeof complexity_score !== 'number') {
      return res.status(400).json({ success: false, message: 'Invalid metrics format' });
    }

    // Clamp values to valid ranges
    const clampedAccuracy = Math.max(0, Math.min(1, language_accuracy));
    const clampedComplexity = Math.max(0, Math.min(1, complexity_score));

    const metrics = {
      language_accuracy: clampedAccuracy,
      complexity_score: clampedComplexity,
      engagement_level: engagement_level || 'normal',
      improvement_suggestions: Array.isArray(improvement_suggestions) ? improvement_suggestions.slice(0, 10) : [],
      total_interactions: total_interactions || 0,
      cumulative_accuracy: cumulative_accuracy || 0,
      cumulative_complexity: cumulative_complexity || 0,
      total_proficiency: total_proficiency || 0,
      last_updated: new Date()
    };

    // Use MongoDB to store proficiency metrics
    const ProficiencyMetrics = require('../models/ProficiencyMetrics');

    await ProficiencyMetrics.findOneAndUpdate(
      { userId },
      metrics,
      { upsert: true, new: true }
    );

    console.log(`Saved proficiency metrics for user ${userId}:`, {
      accuracy: Math.round(clampedAccuracy * 100) + '%',
      complexity: Math.round(clampedComplexity * 100) + '%',
      interactions: metrics.total_interactions,
      total_proficiency: metrics.total_proficiency
    });

    res.status(200).json({
      success: true,
      data: metrics,
      message: 'Proficiency metrics saved successfully'
    });
  } catch (error) {
    console.error('Save Proficiency Metrics Error:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

exports.getProficiencyMetrics = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'UserId is required' });
    }

    const ProficiencyMetrics = require('../models/ProficiencyMetrics');

    let metrics = await ProficiencyMetrics.findOne({ userId });

    // Return default metrics if none found
    if (!metrics) {
      metrics = {
        language_accuracy: 0,
        complexity_score: 0,
        engagement_level: 'normal',
        improvement_suggestions: [],
        total_interactions: 0,
        cumulative_accuracy: 0,
        cumulative_complexity: 0,
        total_proficiency: 0,
        last_updated: new Date()
      };
    }

    res.status(200).json({
      success: true,
      data: metrics,
      message: 'Proficiency metrics retrieved successfully'
    });
  } catch (error) {
    console.error('Get Proficiency Metrics Error:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};