const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const User = require('../models/user');
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

// Password reset (rate-limited; forgot 永远返回 200 防枚举)
router.post('/api/users/password/forgot', authRateLimiter, userController.forgotPassword);
router.post('/api/users/password/reset', authRateLimiter, userController.resetPassword);

// Phone (SMS) login — Twilio Verify
router.post('/api/users/phone/send-code', authRateLimiter, userController.sendPhoneCode);
router.post('/api/users/phone/login', authRateLimiter, userController.phoneLogin);

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

// Daily Recall state routes (backend-authoritative switch count + completion)
router.get('/api/users/recall/daily-state', protect, userController.getRecallDailyState);
router.post('/api/users/recall/switch', protect, userController.incrementRecallSwitch);
router.post('/api/users/recall/complete', protect, userController.markRecallCompleted);

// Onboarding Tour state routes (first-login guided tour completion flag)
router.get('/api/users/onboarding-tour', protect, userController.getOnboardingTour);
router.post('/api/users/onboarding-tour/complete', protect, userController.markOnboardingTourComplete);

// Daily practice time / progress
router.post('/api/users/practice-time', protect, userController.recordPracticeTime);
router.get('/api/users/daily-progress', protect, userController.getDailyProgress);

// Feedback
router.post('/api/users/feedback', protect, userController.submitFeedback);

// Promo code validation (server-side discount table; replaces hardcoded frontend codes)
router.post('/api/users/promo/validate', protect, userController.validatePromoCode);

// Achievements
router.get('/api/users/achievements', protect, async (req, res) => {
  try {
    const achievements = await User.getUserAchievements(req.user.id);
    const unlocked = achievements.filter(a => a.unlocked).length;
    res.json({ achievements, unlocked, total: achievements.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
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