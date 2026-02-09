const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware'); // Import protect middleware

// Register and login routes
router.post('/register', userController.register);
router.post('/login', userController.login);

// Google auth route
router.post('/google', userController.googleSignIn);
router.post('/verify', userController.verifyToken);

// Protected route to get user profile
router.get('/profile', protect, userController.getProfile);
router.put('/profile', protect, userController.updateProfile);

// Goal routes
router.post('/goals', protect, userController.createGoal);
router.get('/goals/active', protect, userController.getActiveGoal);
router.put('/goals/:id/complete', protect, userController.completeGoal);

// Check-in routes
router.post('/checkin', protect, userController.checkin);
router.get('/checkin/history', protect, userController.getCheckinHistory);
router.get('/checkin/stats', protect, userController.getCheckinStats);

// Internal Routes (No auth middleware for simplicity in MVP, should use internal key in prod)
router.post('/internal/users/:id/proficiency', userController.updateProficiencyInternal);
router.post('/internal/users/:id/tasks/complete', userController.completeTaskInternal);
router.post('/internal/users/:id/tasks/score', userController.updateTaskScoreInternal);
router.get('/internal/users/:id', userController.getUserInternal);

module.exports = router;