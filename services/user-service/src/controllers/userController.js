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
  const { username, name, email, password } = req.body;

  try {
    // 1. Check if user already exists
    const userExists = await User.findByEmail(email);
    if (userExists) {
      return res.status(400).json({ 
        success: false,
        message: 'User with this email already exists.' 
      });
    }

    // 2. Create new user
    // Use name if username is not provided (for frontend compatibility)
    const userUsername = username || name;
    const newUser = await User.create(userUsername, email, password);

    // 3. Generate a token for the new user
    const token = generateToken(newUser.id);

    // 4. Respond with success and the token in the expected format
    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        token: token,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
        },
      },
    });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration.' 
    });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials.' 
      });
    }

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials.' 
      });
    }

    // 3. Respond with token in the expected format
    res.json({
      success: true,
      message: '登录成功',
      data: {
        token: generateToken(user.id),
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      },
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login.' 
    });
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
        success: true,
        message: 'Google登录成功',
        data: {
          token: generateToken(user.id),
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
          },
        },
      });
    } else {
      res.status(400).json({ 
        success: false,
        message: '用户未找到且无法创建' 
      });
    }
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    res.status(401).json({ 
      success: false,
      message: '无效的Google令牌' 
    });
  }
};


exports.verifyToken = (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
          success: false,
          message: '未提供令牌或令牌格式错误' 
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json({
            success: true,
            message: '令牌有效',
            data: {
              user: decoded
            }
        });
    } catch (error) {
        res.status(401).json({ 
          success: false,
          message: '无效令牌',
          error: error.message 
        });
    }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    // req.user is set by the protect middleware
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: '用户未找到' 
      });
    }
    
    // Remove password from user object
    const { password, ...userWithoutPassword } = user;
    
    res.json({
      success: true,
      message: '用户资料获取成功',
      data: {
        user: userWithoutPassword
      }
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({ 
      success: false,
      message: '获取用户资料时服务器错误' 
    });
  }
};