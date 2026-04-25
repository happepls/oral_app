const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, internalAuthWithNetworkSkip } = require('../middleware/enhancedAuthMiddleware'); // Updated to enhanced auth
const {
  authRateLimiter,
  validateRegistration,
  validateLogin,
  handleValidationErrors
} = require('../middleware/securityMiddleware');

// Register and login routes with rate limiting and validation
router.post('/api/users/register', authRateLimiter, validateRegistration, handleValidationErrors, userController.register);
router.post('/api/users/login', authRateLimiter, validateLogin, handleValidationErrors, userController.login);

// Google auth route
router.post('/api/users/google', authRateLimiter, userController.googleSignIn);
router.post('/api/users/verify', userController.verifyToken);

// Logout and token migration routes
router.post('/api/users/logout', userController.logout);
router.post('/api/users/token-migrate', userController.tokenMigrate);

// Protected route to get user profile
router.get('/api/users/profile', protect, userController.getProfile);
router.put('/api/users/profile', protect, userController.updateProfile);

// Goal routes
router.post('/api/users/goals', protect, userController.createGoal);
router.get('/api/users/goals', protect, userController.getUserGoals);
router.get('/api/users/goals/active', protect, userController.getActiveGoal);
router.get('/api/users/goals/current-task', protect, userController.getCurrentTask);
router.get('/api/users/goals/next-task', protect, userController.getNextPendingTask);
router.put('/api/users/goals/:id/complete', protect, userController.completeGoal);
router.put('/api/users/goals/:id/activate', protect, userController.switchGoal);
router.post('/api/users/goals/reset-task', protect, userController.resetTask);

// Daily scenario count (for enforcing per-day scenario limits)
router.get('/api/users/daily-scenario-count', protect, userController.getDailyScenarioCount);

// Task confirm-complete: user (or AI on behalf of user via Bearer token) confirms switching to next task
router.post('/api/users/tasks/:id/confirm-complete', protect, userController.confirmCompleteTask);

// Check-in routes
router.post('/api/users/checkin', protect, userController.checkin);
router.get('/api/users/checkin/history', protect, userController.getCheckinHistory);
router.get('/api/users/checkin/stats', protect, userController.getCheckinStats);

// Daily QA pass routes
router.get('/api/users/daily-qa-pass', protect, userController.getDailyQAPassStatus);
router.post('/api/users/internal/users/:id/daily-qa-pass', internalAuthWithNetworkSkip, userController.recordDailyQAPassInternal);

// Internal Routes (Protected with internalAuthWithNetworkSkip for service-to-service communication)
// Uses network-based skip for Docker internal network (172.x.x.x) for backward compatibility
router.post('/api/users/internal/users/:id/proficiency', internalAuthWithNetworkSkip, userController.updateProficiencyInternal);
router.post('/api/users/internal/users/:id/tasks/complete', internalAuthWithNetworkSkip, userController.completeTaskInternal);
router.post('/api/users/internal/users/:id/tasks/score', internalAuthWithNetworkSkip, userController.updateTaskScoreInternal);
router.get('/api/users/internal/users/:id', internalAuthWithNetworkSkip, userController.getUserInternal);

// Task keywords routes (internal, protected with network skip)
router.get('/api/users/tasks/:taskId/keywords', internalAuthWithNetworkSkip, userController.getTaskKeywords);
router.post('/api/users/tasks/:taskId/keywords', internalAuthWithNetworkSkip, userController.generateTaskKeywords);
router.post('/api/users/internal/users/:id/tasks/generate-keywords', internalAuthWithNetworkSkip, userController.generateTaskKeywordsInternal);

module.exports = router;