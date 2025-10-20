const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.post('/register', userController.register);
router.post('/login', userController.login);
router.post('/auth/google', userController.googleSignIn);
router.post('/verify', userController.verifyToken);

module.exports = router;
