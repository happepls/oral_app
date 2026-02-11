const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');

router.post('/conversation', historyController.saveConversation);
router.post('/summary', historyController.saveSummary);
router.get('/stats/:userId', historyController.getStats);
router.get('/user/:userId', historyController.getUserHistory);
router.get('/session/:sessionId', historyController.getConversationDetail);
router.get('/session/:sessionId/messages', historyController.getSessionHistory);
router.post('/session/:sessionId/messages', historyController.saveSessionMessages);

module.exports = router;