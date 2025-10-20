const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { OAuth2Client } = require('google-auth-library');
const bcrypt = require('bcryptjs');


const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

exports.register = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // 1. Check if user already exists
    const userExists = await User.findByEmail(email);
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    // 2. Create new user
    const newUser = await User.create(username, email, password);

    // 3. Respond with success
    res.status(201).json({
      message: 'User registered successfully.',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      },
    });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // 3. Respond with token
    res.json({
      token: generateToken(user.id),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
};

exports.googleSignIn = async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { name, email, sub } = ticket.getPayload();

    const user = await User.findOrCreateFromGoogle({
      googleId: sub,
      email,
      name,
    });

    if (user) {
      res.json({
        token: generateToken(user.id),
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      });
    } else {
      res.status(400).json({ message: 'User not found and could not be created.' });
    }
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    res.status(401).json({ message: 'Invalid Google token' });
  }
};


exports.verifyToken = (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided or malformed token' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json({
            message: 'Token is valid',
            user: decoded,
        });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token', error: error.message });
    }
};