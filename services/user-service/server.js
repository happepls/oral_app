const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables.');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const MIN_PASSWORD_LENGTH = 8;

app.use(cors());
app.use(express.json());

const validatePassword = (password) => {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, message: `密码长度至少为${MIN_PASSWORD_LENGTH}个字符` };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: '密码必须包含小写字母' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: '密码必须包含大写字母' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: '密码必须包含数字' };
  }
  return { valid: true };
};

const users = new Map();

// TODO: When migrating to PostgreSQL, implement password policy migration:
// 1. Add password_policy_version to user table
// 2. On login, check policy version and force password update if outdated
// 3. Consider adding last_password_change timestamp for periodic resets

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: '请填写所有必填字段' 
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ 
        success: false, 
        message: passwordValidation.message 
      });
    }

    if (users.has(email)) {
      return res.status(400).json({ 
        success: false, 
        message: '该邮箱已被注册' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = {
      id: Date.now().toString(),
      name,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      studyDays: 0,
      totalMinutes: 0,
      streak: 0
    };

    users.set(email, user);

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        user: userWithoutPassword,
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: '注册失败，请稍后重试' 
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: '请输入邮箱和密码' 
      });
    }

    const user = users.get(email);

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: '邮箱或密码错误' 
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: '邮箱或密码错误' 
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: userWithoutPassword,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: '登录失败，请稍后重试' 
    });
  }
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: '未授权访问' 
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        success: false, 
        message: '无效的访问令牌' 
      });
    }
    req.user = user;
    next();
  });
};

app.get('/api/user/profile', authenticateToken, (req, res) => {
  const user = Array.from(users.values()).find(u => u.id === req.user.userId);

  if (!user) {
    return res.status(404).json({ 
      success: false, 
      message: '用户不存在' 
    });
  }

  const { password: _, ...userWithoutPassword } = user;

  res.json({
    success: true,
    data: userWithoutPassword
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'user-service' });
});

app.listen(PORT, () => {
  console.log(`User service running on port ${PORT}`);
});
