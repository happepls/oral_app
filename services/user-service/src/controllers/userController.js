const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/user');
const { OAuth2Client } = require('google-auth-library');
const bcrypt = require('bcryptjs');
const { publishNotification } = require('../utils/notificationPublisher');
const redis = require('../utils/redisClient');
const { sendEmail } = require('../utils/mailer');
const twilioVerify = require('../utils/twilioVerify');
const aliyunSms = require('../utils/aliyunSms');

// 简单 E.164 校验：+ 开头，2-15 位数字
function _isValidPhone(p) {
  return typeof p === 'string' && /^\+[1-9]\d{1,14}$/.test(p.trim());
}

// 短信通道路由：+86（中国大陆）走阿里云，其他走 Twilio。
// Twilio 不支持中国大陆号（监管限制 error 60220），阿里云不支持国际号（需国际短信资质）。
function _smsProvider(phone) {
  return /^\+86/.test(phone.trim()) ? aliyunSms : twilioVerify;
}

// 密码重置 token 配置
const RESET_TOKEN_TTL_SECONDS = 30 * 60; // 30 分钟
const RESET_TOKEN_PREFIX = 'pwreset:';
function _hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}


const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
if (!process.env.GOOGLE_CLIENT_ID) {
  console.warn('[userController] GOOGLE_CLIENT_ID is not set — Google Sign-In will fail');
}

// Enhanced JWT configuration (matching enhancedAuthMiddleware.js)
const JWT_CONFIG = {
  accessTokenExpiry: '7d', // 7-day token — users stay logged in across daily sessions
  refreshTokenExpiry: '30d', // Longer-lived refresh tokens
  algorithm: 'HS256',
  issuer: 'oral-app',
  audience: 'oral-app-users'
};

// Cookie options for httpOnly JWT cookie
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

// ===== Promo codes (server-side source of truth) =====
// Moved off the frontend so the discount table can't be read/tampered from JS.
// Keyed by uppercase code; `discount` is a percentage off.
const PROMO_CODES = {
  WELCOME20: { code: 'WELCOME20', discount: 20, description: '新用户8折优惠' },
  ANNUAL50: { code: 'ANNUAL50', discount: 50, description: '年度订阅5折特惠' },
};

// Pure validator — no I/O, easy to unit test. Returns the promo object on a
// valid code, or null when the code is missing/unknown.
const validatePromo = (rawCode) => {
  if (typeof rawCode !== 'string') return null;
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  return PROMO_CODES[code] || null;
};

// Helper to generate JWT with proper configuration
const generateToken = (id) => {
  return jwt.sign(
    { 
      id: id,
      type: 'access',
      iat: Math.floor(Date.now() / 1000)
    },
    process.env.JWT_SECRET,
    {
      expiresIn: JWT_CONFIG.accessTokenExpiry,
      algorithm: JWT_CONFIG.algorithm,
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience
    }
  );
};

exports.register = async (req, res) => {
  console.log('Register endpoint hit');
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

    // 4. Set httpOnly cookie and respond
    res.cookie('accessToken', token, COOKIE_OPTIONS);
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
    if (error.code === '23505') {
      const detail = error.detail || '';
      if (detail.includes('username')) {
        return res.status(400).json({
          success: false,
          message: '该用户名已被使用，请换一个'
        });
      }
      if (detail.includes('email')) {
        return res.status(400).json({
          success: false,
          message: '该邮箱已被注册'
        });
      }
      return res.status(400).json({
        success: false,
        message: '用户信息重复，请检查后重试'
      });
    }
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
    if (!user.password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials.' 
      });
    }

    // 3. Set httpOnly cookie and respond
    const userWithoutPassword = { ...user };
    delete userWithoutPassword.password;

    const token = generateToken(user.id);
    res.cookie('accessToken', token, COOKIE_OPTIONS);
    res.json({
      success: true,
      message: '登录成功',
      data: {
        token: token,
        user: userWithoutPassword,
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
      // Remove password if it exists
      const userWithoutPassword = { ...user };
      delete userWithoutPassword.password;

      const jwtToken = generateToken(user.id);
      res.cookie('accessToken', jwtToken, COOKIE_OPTIONS);
      res.json({
        success: true,
        message: 'Google登录成功',
        data: {
          token: jwtToken,
          user: userWithoutPassword,
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
    // Cookie-first, then Bearer header fallback
    const token = req.cookies?.accessToken ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

    if (!token) {
        return res.status(401).json({
          success: false,
          message: '未提供令牌或令牌格式错误'
        });
    }

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

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;
    
    // Prevent updating sensitive fields via this endpoint if necessary
    // (Model already filters, but good to be explicit or careful)

    const updatedUser = await User.update(userId, updates);

    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message: '没有可更新的字段或用户不存在'
      });
    }

    res.json({
      success: true,
      message: '用户资料更新成功',
      data: {
        user: updatedUser
      }
    });

  } catch (error) {
    console.error('Update Profile Error:', error.message);
    if (error.detail) console.error('Error Detail:', error.detail);
    // username UNIQUE 冲突（手机号用户改名撞名）→ 409 友好提示
    // 注：db wrapper 可能不透传 pg error.code，故同时认 code 与 message/detail 文本
    const errText = `${error.code || ''} ${error.detail || ''} ${error.message || ''}`;
    if (/23505|duplicate key|users_username_key/i.test(errText) && /username/i.test(errText)) {
      return res.status(409).json({
        success: false,
        message: '该用户名已被占用，请换一个'
      });
    }
    res.status(500).json({
      success: false,
      message: '更新用户资料时服务器错误'
    });
  }
};

exports.createGoal = async (req, res) => {
    try {
        const userId = req.user.id;
        const goalData = req.body;
        
        const newGoal = await User.createGoal(userId, goalData);
        
        res.status(201).json({
            success: true,
            message: '目标创建成功',
            data: {
                goal: newGoal
            }
        });
    } catch (error) {
        console.error('Create Goal Error:', error);
        res.status(500).json({
            success: false,
            message: '创建目标时服务器错误'
        });
    }
};

exports.getActiveGoal = async (req, res) => {
    try {
        const userId = req.user.id;
        const goal = await User.getActiveGoal(userId);

        res.json({
            success: true,
            data: {
                goal: goal
            }
        });
    } catch (error) {
        console.error('Get Active Goal Error:', error);
        res.status(500).json({
            success: false,
            message: '获取当前目标时服务器错误'
        });
    }
};

exports.getCurrentTask = async (req, res) => {
    try {
        const userId = req.user.id;
        const goal = await User.getActiveGoal(userId);

        if (!goal || !goal.scenarios) {
            return res.json({
                success: true,
                data: {
                    task: null,
                    scenario: null,
                    progress: 0
                }
            });
        }

        // Find the first incomplete task
        let currentTask = null;
        let currentScenario = null;

        for (const scenario of goal.scenarios) {
            if (scenario.tasks && Array.isArray(scenario.tasks)) {
                const incompleteTask = scenario.tasks.find(t => t.status !== 'completed');
                if (incompleteTask) {
                    currentTask = incompleteTask;
                    currentScenario = scenario;
                    break;
                }
            }
        }

        res.json({
            success: true,
            data: {
                task: currentTask,
                scenario: currentScenario,
                progress: currentTask ? currentTask.progress : 0,
                goalId: goal.id
            }
        });
    } catch (error) {
        console.error('Get Current Task Error:', error);
        res.status(500).json({
            success: false,
            message: '获取当前任务时服务器错误'
        });
    }
};

// Get next pending task for a specific scenario
exports.getNextPendingTask = async (req, res) => {
    try {
        const userId = req.user.id;
        const { scenario_title } = req.query;

        if (!scenario_title) {
            return res.status(400).json({
                success: false,
                message: '缺少场景标题参数'
            });
        }

        const goal = await User.getActiveGoal(userId);

        if (!goal || !goal.scenarios) {
            return res.json({
                success: true,
                data: {
                    task: null,
                    scenario: null,
                    allCompleted: true
                }
            });
        }

        // Find the scenario
        const scenario = goal.scenarios.find(s => 
            s.title.toLowerCase() === scenario_title.toLowerCase() ||
            s.title.toLowerCase().includes(scenario_title.toLowerCase()) ||
            scenario_title.toLowerCase().includes(s.title.toLowerCase())
        );

        if (!scenario) {
            return res.json({
                success: true,
                data: {
                    task: null,
                    scenario: null,
                    message: '未找到该场景'
                }
            });
        }

        // Find the first incomplete task in this scenario
        const incompleteTask = scenario.tasks && Array.isArray(scenario.tasks)
            ? scenario.tasks.find(t => t.status !== 'completed')
            : null;

        res.json({
            success: true,
            data: {
                task: incompleteTask,
                scenario: scenario,
                allCompleted: !incompleteTask,
                goalId: goal.id
            }
        });
    } catch (error) {
        console.error('Get Next Pending Task Error:', error);
        res.status(500).json({
            success: false,
            message: '获取下一个任务时服务器错误'
        });
    }
};

// Reset task progress (for retry functionality)
exports.resetTask = async (req, res) => {
    try {
        const userId = req.user.id;
        const { task_id, scenario_title } = req.body;

        const db = require('../models/db');

        if (task_id) {
            // Reset single task by ID
            await db.query(
                `UPDATE user_tasks
                 SET score = 0, status = 'pending', interaction_count = 0, feedback = NULL, completed_at = NULL, updated_at = NOW()
                 WHERE id = $1 AND user_id = $2`,
                [task_id, userId]
            );
            res.json({ success: true, message: '任务进度已重置' });
        } else if (scenario_title) {
            // Reset all tasks in a specific scenario
            await db.query(
                `UPDATE user_tasks
                 SET score = 0, status = 'pending', interaction_count = 0, feedback = NULL, completed_at = NULL, updated_at = NOW()
                 WHERE user_id = $1 AND scenario_title = $2`,
                [userId, scenario_title]
            );
            res.json({ success: true, message: '场景任务已重置' });
        } else {
            return res.status(400).json({
                success: false,
                message: '需要提供任务ID或场景标题'
            });
        }
    } catch (error) {
        console.error('Reset Task Error:', error);
        res.status(500).json({
            success: false,
            message: '重置任务时服务器错误'
        });
    }
};

exports.getUserGoals = async (req, res) => {
    try {
        const goals = await User.getUserGoals(req.user.id);
        res.json({ success: true, goals });
    } catch (error) {
        console.error('Get User Goals Error:', error);
        res.status(500).json({ success: false, message: '获取目标列表时服务器错误' });
    }
};

exports.switchGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const goal = await User.switchActiveGoal(req.user.id, parseInt(id));
        if (!goal) return res.status(404).json({ success: false, message: '目标未找到' });
        res.json({ success: true, goal });
    } catch (error) {
        console.error('Switch Goal Error:', error);
        res.status(500).json({ success: false, message: '切换目标时服务器错误' });
    }
};

exports.completeGoal = async (req, res) => {

    try {

        const userId = req.user.id;

        const goalId = req.params.id;

        

        const completedGoal = await User.completeGoal(goalId, userId);

        

        if (!completedGoal) {

             return res.status(404).json({

                success: false,

                message: '目标未找到或已完成'

            });

        }



        res.json({

            success: true,

            message: '目标已完成',

            data: {

                goal: completedGoal

            }

        });

    } catch (error) {

        console.error('Complete Goal Error:', error);

        res.status(500).json({

            success: false,

            message: '完成目标时服务器错误'

        });

    }

};



exports.updateProficiencyInternal = async (req, res) => {



    try {



        console.log(`[User] Internal Update Proficiency: ID=${req.params.id}, Body=${JSON.stringify(req.body)}`);



        const userId = req.params.id;



        const { delta } = req.body;



        



        const updatedGoal = await User.updateProficiency(userId, delta);





        

        if (!updatedGoal) {

            return res.status(404).json({ success: false, message: 'No active goal found' });

        }

        publishNotification(userId, 'proficiency_update', { delta, current_proficiency: updatedGoal.current_proficiency });

        res.json({ success: true, data: { goal: updatedGoal } });

    } catch (error) {

        console.error('Update Proficiency Error:', error);

        res.status(500).json({ success: false, message: 'Server Error' });

    }

};

exports.confirmCompleteTask = async (req, res) => {
    try {
        const userId = req.user?.id;
        const taskId = req.params.id;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (!taskId) return res.status(400).json({ success: false, message: 'task id required' });

        console.log(`[User] Confirm-Complete Task: User=${userId}, Task=${taskId}`);

        const result = await User.confirmCompleteTaskById(userId, taskId);
        if (result.error === 'not_found') {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }
        if (result.error === 'not_ready') {
            return res.status(400).json({
                success: false,
                message: 'Task score is below completion threshold (score>=9 required)',
                data: { score: result.task?.score || 0 },
            });
        }
        if (result.error === 'already_completed') {
            return res.json({
                success: true,
                message: 'Task already completed',
                data: { completed_task: result.task, next_task: null },
            });
        }

        return res.json({
            success: true,
            data: {
                completed_task: result.completed_task,
                next_task: result.next_task,
                current_proficiency: result.current_proficiency,
            },
        });
    } catch (error) {
        console.error('Confirm-Complete Task Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.completeTaskInternal = async (req, res) => {
    try {
        const userId = req.params.id;
        const { scenario, task } = req.body;

        console.log(`[User] Internal Complete Task: User=${userId}, Scenario=${scenario}, Task=${task}`);

        if (!scenario || !task) {
            return res.status(400).json({ success: false, message: 'Scenario and Task required' });
        }

        const updatedGoal = await User.completeTask(userId, scenario, task);

        if (!updatedGoal) {
            console.log('[User] Task completion skipped (not found or no active goal)');
            return res.json({ success: true, message: 'No update' });
        }

        publishNotification(userId, 'task_completed', { scenario, task });

        res.json({ success: true, data: { goal: updatedGoal } });

    } catch (error) {
        console.error('Complete Task Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.updateTaskScoreInternal = async (req, res) => {
    try {
        const userId = req.params.id;
        const { scenario, task, scoreDelta, feedback } = req.body;

        console.log(`[User] Internal Update Task Score: User=${userId}, Scenario=${scenario}, Task=${task}, Delta=${scoreDelta}`);

        if (!scenario || !task || scoreDelta === undefined) {
            return res.status(400).json({ success: false, message: 'Scenario, Task, and scoreDelta required' });
        }

        const result = await User.updateTaskScore(userId, scenario, task, scoreDelta, feedback);

        if (!result) {
            console.log('[User] Task score update skipped (not found or no active goal)');
            return res.json({ success: true, message: 'No update', taskCompleted: false });
        }

        publishNotification(userId, 'task_score_updated', {
            scenario, task, newScore: result.newScore, taskCompleted: result.taskCompleted
        });

        res.json({
            success: true,
            data: { goal: result.goal },
            taskCompleted: result.taskCompleted,
            newScore: result.newScore,
            taskName: result.taskName
        });

    } catch (error) {
        console.error('Update Task Score Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Internal: persist a scenario cover image URL into user_goals.scenarios[i].image_url.
// Called by ai-omni after re-hosting the generated cover to COS. Internal network
// skips JWT (internalAuthWithNetworkSkip). Idempotent + best-effort (cosmetic).
// Cover image URLs must originate from our own COS or the DashScope OSS that
// the t2i pipeline uses — hardening against a compromised internal caller
// persisting an arbitrary URL into the cosmetic scenarios JSONB.
const ALLOWED_IMAGE_URL_HOSTS = [
    /\.myqcloud\.com$/i,
    /\.aliyuncs\.com$/i,
    /(^|\.)dashscope(-intl)?\.aliyuncs\.com$/i,
];
function isAllowedImageUrl(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
        return ALLOWED_IMAGE_URL_HOSTS.some((re) => re.test(u.hostname));
    } catch {
        return false;
    }
}

exports.updateScenarioImageInternal = async (req, res) => {
    try {
        const goalId = req.params.goalId;
        const { scenario_title, image_url, user_id } = req.body || {};
        if (!goalId || !scenario_title || !image_url) {
            return res.status(400).json({ success: false, message: 'goalId, scenario_title, image_url required' });
        }
        if (!isAllowedImageUrl(image_url)) {
            return res.status(400).json({ success: false, message: 'image_url host not allowed' });
        }
        const updated = await User.updateScenarioImage(goalId, scenario_title, image_url, user_id || null);
        if (!updated) {
            console.log(`[User] Scenario image write-back skipped (goal=${goalId}, scenario not found)`);
            return res.json({ success: true, updated: false });
        }
        console.log(`[User] Scenario image persisted: goal=${goalId}, scenario='${scenario_title}'`);
        res.json({ success: true, updated: true });
    } catch (error) {
        console.error('updateScenarioImageInternal error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.getUserInternal = async (req, res) => {

    try {

        const userId = req.params.id;

        const user = await User.findById(userId);

        if (!user) return res.status(404).json({ success: false });



        // Attach active goal proficiency for convenience

        const activeGoal = await User.getActiveGoal(userId);

        const userData = { ...user };

        delete userData.password;

        userData.proficiency = activeGoal ? activeGoal.current_proficiency : (user.points || 0);



        res.json({ success: true, data: userData });

    } catch (error) {

        console.error('Get User Internal Error:', error);

        res.status(500).json({ success: false });

    }

};

// ===== Daily Check-in APIs =====

exports.checkin = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await User.checkin(userId);
        
        if (result.alreadyCheckedIn) {
            return res.json({
                success: true,
                message: '今日已打卡',
                alreadyCheckedIn: true,
                checkin: result.checkin
            });
        }
        
        res.json({
            success: true,
            message: '打卡成功！',
            alreadyCheckedIn: false,
            checkin: result.checkin,
            pointsEarned: result.checkin.points_earned,
            streak: result.checkin.streak_count
        });
    } catch (error) {
        console.error('Checkin Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.getCheckinHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const days = parseInt(req.query.days) || 30;
        
        const history = await User.getCheckinHistory(userId, days);
        
        res.json({ success: true, data: history });
    } catch (error) {
        console.error('Get Checkin History Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.getCheckinStats = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const stats = await User.getCheckinStats(userId);
        
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Get Checkin Stats Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
// ===== Task Keywords Endpoints =====

/**
 * Get keywords for a task (internal service call, no auth)
 */
exports.getTaskKeywords = async (req, res) => {
    try {
        const { taskId } = req.params;
        
        if (!taskId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Task ID required' 
            });
        }

        const keywords = await User.getTaskKeywords(taskId);
        
        res.json({ 
            success: true, 
            data: { 
                taskId,
                keywords 
            } 
        });
    } catch (error) {
        console.error('Get Task Keywords Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

/**
 * Generate and save keywords for a task
 */
exports.generateTaskKeywords = async (req, res) => {
    try {
        const { taskId, taskDescription, scenarioTitle, targetLanguage } = req.body;
        
        if (!taskId || !taskDescription) {
            return res.status(400).json({ 
                success: false, 
                message: 'Task ID and description required' 
            });
        }

        // Generate keywords using AI
        const keywords = await User.generateTaskKeywords(
            taskDescription, 
            scenarioTitle || 'General', 
            targetLanguage || 'English'
        );

        // Save to database
        await User.saveTaskKeywords(taskId, keywords);
        
        res.json({ 
            success: true, 
            data: { 
                taskId,
                keywords,
                generated: true
            } 
        });
    } catch (error) {
        console.error('Generate Task Keywords Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Logout — clear httpOnly cookie
exports.logout = (req, res) => {
  // Clear the current Path=/api cookie plus any legacy cookies set under
  // Path=/ by older builds — duplicate accessToken cookies (different paths)
  // otherwise shadow the fresh one on /api/ai routes, causing stale-token 401s.
  res.clearCookie('accessToken', { path: '/api' });
  res.clearCookie('accessToken', { path: '/' });
  res.json({ success: true, message: '已登出' });
};

// Token migration — read old Bearer token, verify, set as httpOnly cookie
exports.tokenMigrate = (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(400).json({ success: false, message: '未提供有效的Bearer令牌' });
  }

  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    res.cookie('accessToken', token, COOKIE_OPTIONS);
    res.json({ success: true, message: '令牌迁移成功' });
  } catch (error) {
    res.status(401).json({ success: false, message: '无效令牌，无法迁移' });
  }
};

// ===== Daily QA Pass APIs =====

exports.getDailyQAPassStatus = async (req, res) => {
    try {
        const result = await User.getDailyQAPassStatus(req.user.id);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('getDailyQAPassStatus error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

exports.recordDailyQAPassInternal = async (req, res) => {
    try {
        const { id } = req.params;
        const rawText = req.body.question_text || '';
        const question_text = typeof rawText === 'string' ? rawText.slice(0, 2000) : '';
        const result = await User.recordDailyQAPass(id, question_text);
        publishNotification(id, 'daily_qa_completed', { passed: true });
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('recordDailyQAPassInternal error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// ===== Daily Recall State APIs =====
// Backend-authoritative per-user/per-day switch count + completion state.
// Replaces the previous localStorage (`recall_switches_*` / `recall_completed_*`)
// so the free-tier daily switch limit cannot be reset by clearing the browser.

exports.getRecallDailyState = async (req, res) => {
    try {
        const db = require('../models/db');
        const result = await db.query(
            `SELECT switch_count, completed
             FROM recall_daily_state
             WHERE user_id = $1 AND state_date = CURRENT_DATE
             LIMIT 1`,
            [req.user.id]
        );
        const row = result.rows[0];
        res.json({
            success: true,
            data: {
                switch_count: row ? row.switch_count : 0,
                completed: row ? row.completed : false,
            },
        });
    } catch (error) {
        console.error('getRecallDailyState error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

exports.incrementRecallSwitch = async (req, res) => {
    try {
        const db = require('../models/db');
        // Idempotent per-day row: first switch inserts with count=1, subsequent
        // switches bump the existing row's count. UNIQUE(user_id, state_date)
        // anchors the conflict target.
        const result = await db.query(
            `INSERT INTO recall_daily_state (user_id, state_date, switch_count)
             VALUES ($1, CURRENT_DATE, 1)
             ON CONFLICT (user_id, state_date)
             DO UPDATE SET switch_count = recall_daily_state.switch_count + 1,
                           updated_at = NOW()
             RETURNING switch_count`,
            [req.user.id]
        );
        res.json({ success: true, data: { switch_count: result.rows[0].switch_count } });
    } catch (error) {
        console.error('incrementRecallSwitch error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

exports.markRecallCompleted = async (req, res) => {
    try {
        const db = require('../models/db');
        await db.query(
            `INSERT INTO recall_daily_state (user_id, state_date, completed)
             VALUES ($1, CURRENT_DATE, TRUE)
             ON CONFLICT (user_id, state_date)
             DO UPDATE SET completed = TRUE,
                           updated_at = NOW()`,
            [req.user.id]
        );
        res.json({ success: true, data: { completed: true } });
    } catch (error) {
        console.error('markRecallCompleted error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// ===== Onboarding Tour State APIs =====
// Backend-authoritative first-login guided tour completion flag. localStorage
// mirrors this value for optimistic flicker-free reads; the backend is the
// source of truth so the tour cannot re-appear after clearing the browser.

exports.getOnboardingTour = async (req, res) => {
    try {
        const db = require('../models/db');
        const result = await db.query(
            `SELECT onboarding_tour_completed FROM users WHERE id = $1 LIMIT 1`,
            [req.user.id]
        );
        const row = result.rows[0];
        res.json({
            success: true,
            data: { completed: row ? !!row.onboarding_tour_completed : false },
        });
    } catch (error) {
        console.error('getOnboardingTour error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

exports.markOnboardingTourComplete = async (req, res) => {
    try {
        const db = require('../models/db');
        // Idempotent: flipping an already-TRUE flag is a no-op.
        await db.query(
            `UPDATE users SET onboarding_tour_completed = TRUE, updated_at = NOW()
             WHERE id = $1`,
            [req.user.id]
        );
        res.json({ success: true, data: { completed: true } });
    } catch (error) {
        console.error('markOnboardingTourComplete error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// ===== Daily Scenario Count =====
exports.getDailyScenarioCount = async (req, res) => {
    try {
        const userId = req.user.id;
        // Count distinct scenarios completed today (server timezone: UTC)
        const result = await db.query(
            `SELECT COUNT(DISTINCT scenario_title) AS count
             FROM user_tasks
             WHERE user_id = $1
               AND status = 'completed'
               AND completed_at >= CURRENT_DATE`,
            [userId]
        );
        const count = parseInt(result.rows[0]?.count || '0', 10);
        res.json({ success: true, data: { count } });
    } catch (error) {
        console.error('getDailyScenarioCount error:', error);
        res.status(500).json({ success: false });
    }
};

// ===== Password Reset =====

// POST /api/users/password/forgot — 发起密码重置
// 防枚举：无论邮箱是否存在都返回 200 + 同一文案。仅当存在且为本地账号时
// 才生成 token、存 hash、发邮件。
exports.forgotPassword = async (req, res) => {
    const { email } = req.body || {};
    const genericOk = { success: true, message: '若该邮箱已注册，我们已发送密码重置邮件。' };
    try {
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ success: false, message: '请输入邮箱地址。' });
        }
        const user = await User.findByEmail(email.trim().toLowerCase());
        // 邮箱不存在，或是 Google-only 账号（无本地密码）→ 静默成功，不泄露
        if (!user || !user.id) {
            return res.json(genericOk);
        }

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = _hashResetToken(token);
        try {
            await redis.setex(`${RESET_TOKEN_PREFIX}${tokenHash}`, RESET_TOKEN_TTL_SECONDS, String(user.id));
        } catch (e) {
            console.error('[forgotPassword] redis setex failed:', e.message);
            return res.status(500).json({ success: false, message: '服务暂时不可用，请稍后再试。' });
        }

        const baseUrl = process.env.PASSWORD_RESET_BASE_URL || 'http://localhost:5001';
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;
        const html =
            `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">` +
            `<h2>重置您的密码</h2>` +
            `<p>我们收到了重置 Guaji AI 账户密码的请求。点击下方按钮设置新密码（链接 30 分钟内有效）：</p>` +
            `<p><a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#637FF1;color:#fff;border-radius:8px;text-decoration:none">重置密码</a></p>` +
            `<p style="color:#888;font-size:13px">若按钮无法点击，请复制此链接到浏览器：<br>${resetUrl}</p>` +
            `<p style="color:#888;font-size:13px">如果不是您本人操作，请忽略此邮件，您的密码不会被更改。</p></div>`;

        const result = await sendEmail({
            to: user.email,
            subject: 'Guaji AI 密码重置',
            html,
            text: `重置您的 Guaji AI 密码（30 分钟内有效）：${resetUrl}`,
        });

        if (!result.sent) {
            // 开发期/未配置 Resend：把链接打到日志，方便本地走通流程。
            // 生产配好 RESEND_API_KEY 后此分支不会触发。
            console.warn(`[forgotPassword] 邮件未发送 (${result.reason})。重置链接(仅日志): ${resetUrl}`);
        }
        return res.json(genericOk);
    } catch (error) {
        console.error('forgotPassword error:', error);
        // 仍返回通用成功，避免泄露内部错误/邮箱存在性
        return res.json(genericOk);
    }
};

// POST /api/users/password/reset — 用 token 设置新密码
exports.resetPassword = async (req, res) => {
    const { token, password } = req.body || {};
    try {
        if (!token || !password) {
            return res.status(400).json({ success: false, message: '缺少 token 或新密码。' });
        }
        if (typeof password !== 'string' || password.length < 6) {
            return res.status(400).json({ success: false, message: '密码至少需要 6 位。' });
        }
        const tokenHash = _hashResetToken(token);
        const key = `${RESET_TOKEN_PREFIX}${tokenHash}`;
        let userId = null;
        try {
            userId = await redis.get(key);
        } catch (e) {
            console.error('[resetPassword] redis get failed:', e.message);
            return res.status(500).json({ success: false, message: '服务暂时不可用，请稍后再试。' });
        }
        if (!userId) {
            return res.status(400).json({ success: false, message: '重置链接无效或已过期，请重新申请。' });
        }

        await User.updateLocalPassword(userId, password);
        // 一次性：用完即删
        try { await redis.del(key); } catch (_) {}

        return res.json({ success: true, message: '密码已重置，请用新密码登录。' });
    } catch (error) {
        console.error('resetPassword error:', error);
        return res.status(500).json({ success: false, message: '重置失败，请稍后再试。' });
    }
};

// ===== Phone (SMS) Login — Twilio Verify =====

// POST /api/users/phone/send-code — 发送短信验证码
exports.sendPhoneCode = async (req, res) => {
    const { phone } = req.body || {};
    try {
        if (!_isValidPhone(phone)) {
            return res.status(400).json({ success: false, message: '请输入有效的手机号（含国家码，如 +8613800138000）。' });
        }
        const result = await _smsProvider(phone).sendCode(phone.trim());
        if (result.sent || result.devMode) {
            // devMode 也返回成功（验证码走 dev 固定码 000000，日志已提示）
            return res.json({ success: true, message: '验证码已发送，请查收短信。', devMode: !!result.devMode });
        }
        return res.status(502).json({ success: false, message: '验证码发送失败，请稍后再试。' });
    } catch (error) {
        console.error('sendPhoneCode error:', error);
        return res.status(500).json({ success: false, message: '服务异常，请稍后再试。' });
    }
};

// POST /api/users/phone/login — 校验验证码 → 登录/注册 → 签 JWT cookie
exports.phoneLogin = async (req, res) => {
    const { phone, code } = req.body || {};
    try {
        if (!_isValidPhone(phone)) {
            return res.status(400).json({ success: false, message: '手机号格式不正确。' });
        }
        if (!code || !/^\d{4,8}$/.test(String(code).trim())) {
            return res.status(400).json({ success: false, message: '验证码格式不正确。' });
        }
        const check = await _smsProvider(phone).checkCode(phone.trim(), String(code).trim());
        if (!check.ok) {
            return res.status(401).json({ success: false, message: '验证码错误或已过期。' });
        }

        const user = await User.findOrCreateByPhone(phone.trim());
        const userWithoutPassword = { ...user };
        delete userWithoutPassword.password;

        const token = generateToken(user.id);
        res.cookie('accessToken', token, COOKIE_OPTIONS);
        return res.json({
            success: true,
            message: '登录成功',
            data: { token, user: userWithoutPassword },
        });
    } catch (error) {
        console.error('phoneLogin error:', error);
        return res.status(500).json({ success: false, message: '登录失败，请稍后再试。' });
    }
};

module.exports = exports;

/**
 * Generate keywords for a task (internal endpoint, no auth)
 */
exports.generateTaskKeywordsInternal = async (req, res) => {
    try {
        const { taskId, taskDescription, scenarioTitle, targetLanguage } = req.body;
        
        if (!taskId || !taskDescription) {
            return res.status(400).json({ 
                success: false, 
                message: 'Task ID and description required' 
            });
        }

        // Generate keywords using AI
        const keywords = await User.generateTaskKeywords(
            taskDescription, 
            scenarioTitle || 'General', 
            targetLanguage || 'English'
        );

        // Save to database
        await User.saveTaskKeywords(taskId, keywords);
        
        res.json({ 
            success: true, 
            data: { 
                taskId,
                keywords,
                generated: true
            } 
        });
    } catch (error) {
        console.error('Generate Task Keywords Internal Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// ===== Daily Practice Time / Progress =====

exports.recordPracticeTime = async (req, res) => {
    try {
        const { minutes } = req.body;
        if (!minutes || minutes <= 0) return res.status(400).json({ error: 'Invalid minutes' });
        const result = await User.recordPracticeTime(req.user.id, Math.round(minutes));

        const db = require('../models/db');
        const userRes = await db.query('SELECT daily_practice_goal FROM users WHERE id = $1', [req.user.id]);
        const goal = userRes.rows[0]?.daily_practice_goal || 15;

        const totalMinutes = result.minutes;
        let autoCheckin = null;
        if (totalMinutes >= goal) {
            autoCheckin = await User.checkin(req.user.id);
        }

        res.json({ totalMinutes, goal, autoCheckin });
    } catch (err) {
        console.error('recordPracticeTime Error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.getDailyProgress = async (req, res) => {
    try {
        const progress = await User.getDailyProgress(req.user.id);
        res.json(progress);
    } catch (err) {
        console.error('getDailyProgress Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ===== Feedback =====

exports.submitFeedback = async (req, res) => {
    try {
        const { category, message } = req.body;
        if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
        const result = await User.submitFeedback(req.user.id, category || 'other', message.trim());
        res.json({ success: true, feedback: result });
    } catch (err) {
        console.error('submitFeedback Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ===== Promo code validation =====

// POST /api/users/promo/validate — validates a promo code server-side and
// returns the discount. The discount table lives only here (not in frontend JS),
// so codes can't be enumerated or tampered from the client.
exports.validatePromoCode = async (req, res) => {
    try {
        const { code } = req.body || {};
        const promo = validatePromo(code);
        if (!promo) {
            return res.status(404).json({ valid: false, error: '优惠码无效或已过期' });
        }
        res.json({
            valid: true,
            code: promo.code,
            discount: promo.discount,
            description: promo.description
        });
    } catch (err) {
        console.error('validatePromoCode Error:', err);
        res.status(500).json({ valid: false, error: err.message });
    }
};

// Exported for unit tests (pure, no I/O)
exports._validatePromo = validatePromo;
exports._PROMO_CODES = PROMO_CODES;
