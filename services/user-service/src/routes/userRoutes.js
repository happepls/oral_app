const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/enhancedAuthMiddleware'); // Updated to enhanced auth
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
router.post('/api/users/google', userController.googleSignIn);
router.post('/api/users/verify', userController.verifyToken);

// Protected route to get user profile
router.get('/api/users/profile', protect, userController.getProfile);
router.put('/api/users/profile', protect, userController.updateProfile);

// Goal routes
router.post('/api/users/goals', protect, userController.createGoal);
router.get('/api/users/goals/active', protect, userController.getActiveGoal);
router.get('/api/users/goals/current-task', protect, userController.getCurrentTask);
router.get('/api/users/goals/next-task', protect, userController.getNextPendingTask);
router.put('/api/users/goals/:id/complete', protect, userController.completeGoal);
router.post('/api/users/goals/reset-task', protect, userController.resetTask);

// Check-in routes
router.post('/api/users/checkin', protect, userController.checkin);
router.get('/api/users/checkin/history', protect, userController.getCheckinHistory);
router.get('/api/users/checkin/stats', protect, userController.getCheckinStats);

// Internal Routes (No auth middleware for simplicity in MVP, should use internal key in prod)
router.post('/api/users/internal/users/:id/proficiency', userController.updateProficiencyInternal);
router.post('/api/users/internal/users/:id/tasks/complete', userController.completeTaskInternal);
router.post('/api/users/internal/users/:id/tasks/score', userController.updateTaskScoreInternal);
router.get('/api/users/internal/users/:id', userController.getUserInternal);

// Task keywords routes (internal, no auth for now)
router.get('/api/users/tasks/:taskId/keywords', userController.getTaskKeywords);
router.post('/api/users/tasks/:taskId/keywords', userController.generateTaskKeywords);
router.post('/api/users/internal/users/:id/tasks/generate-keywords', userController.generateTaskKeywordsInternal);

module.exports = router;