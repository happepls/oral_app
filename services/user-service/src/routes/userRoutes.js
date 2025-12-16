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

module.exports = router;