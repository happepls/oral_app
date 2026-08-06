const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');
const { requireHistoryUser, requireInternalService } = require('../middleware/historyAuth');

router.post('/conversation', requireInternalService, historyController.saveConversation);
router.post('/summary', requireInternalService, historyController.saveSummary);
router.get('/stats/:userId', requireHistoryUser, historyController.getStats);
router.get('/user/:userId', requireHistoryUser, historyController.getUserHistory);
router.get('/session/:sessionId', requireHistoryUser, historyController.getConversationDetail);
router.get('/session/:sessionId/messages', requireHistoryUser, historyController.getSessionHistory);
router.post('/session/:sessionId/messages', requireInternalService, historyController.saveSessionMessages);
router.delete('/internal/users/:userId/goals/:goalId/conversations', requireInternalService, historyController.deleteGoalConversations);

// Proficiency metrics endpoints
router.post('/proficiency/:userId', requireInternalService, historyController.saveProficiencyMetrics);
router.get('/proficiency/:userId', requireHistoryUser, historyController.getProficiencyMetrics);

module.exports = router;
