const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { OAuth2Client } = require('google-auth-library');
const bcrypt = require('bcryptjs');


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

        

        res.json({ success: true, data: { goal: updatedGoal } });

    } catch (error) {

        console.error('Update Proficiency Error:', error);

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
  res.clearCookie('accessToken', { path: '/api' });
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
