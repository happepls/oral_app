const db = require('./db');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');

const ACHIEVEMENTS = {
  // Learning
  first_steps:    { category: 'learning', icon: '🎯', name: 'First Steps',    description: 'Complete your first practice session' },
  bookworm:       { category: 'learning', icon: '📖', name: 'Bookworm',       description: 'Complete 10 scenarios' },
  scholar:        { category: 'learning', icon: '🎓', name: 'Scholar',        description: 'Complete 50 scenarios' },
  master:         { category: 'learning', icon: '🏅', name: 'Master',         description: 'Complete all scenarios in a goal' },
  // Streaks
  getting_started:{ category: 'streaks',  icon: '🌟', name: 'Getting Started',description: 'Maintain a 3-day streak' },
  dedicated:      { category: 'streaks',  icon: '💪', name: 'Dedicated',      description: 'Maintain a 7-day streak' },
  unstoppable:    { category: 'streaks',  icon: '⚡', name: 'Unstoppable',    description: 'Maintain a 30-day streak' },
  legend:         { category: 'streaks',  icon: '👑', name: 'Legend',         description: 'Maintain a 100-day streak' },
  // Skills
  conversation_starter: { category: 'skills', icon: '💬', name: 'Conversation Starter', description: 'Score 8+ on a practice session' },
  perfect_score:  { category: 'skills',  icon: '⭐', name: 'Perfect Score',  description: 'Score 10 on a single task' },
  polyglot:       { category: 'skills',  icon: '🌍', name: 'Polyglot',       description: 'Practice 3 or more languages' },
  actor:          { category: 'skills',  icon: '🎭', name: 'Actor',          description: 'Complete a Scene Theater session' },
};

const User = {};

User.create = async (username, email, password) => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const userResult = await client.query(
            'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id',
            [username, email]
        );
        const userId = userResult.rows[0].id;

        await client.query(
            'INSERT INTO user_identities (provider, provider_uid, user_id) VALUES ($1, $2, $3)',
            ['local', hashedPassword, userId]
        );

        await client.query('COMMIT');
        return { id: userId, username, email };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

User.findById = async (id) => {
    const { rows } = await db.query(
        `SELECT u.*, ui.provider_uid AS password
         FROM users u
         LEFT JOIN user_identities ui ON ui.user_id = u.id AND ui.provider = 'local'
         WHERE u.id = $1`,
        [id]
    );
    if (rows.length === 0) {
        return null;
    }
    const user = rows[0];
    if (user.password === null) {
        delete user.password;
    }
    return user;
};

User.update = async (id, updates) => {
  const allowedUpdates = [
      'username', 'avatar_url', 'native_language', 'learning_goal',
      'nickname', 'gender', 'birth_year', 'target_language', 'interests', 'points',
      'daily_practice_goal'
  ];
  const updateFields = [];
  const values = [];
  let index = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedUpdates.includes(key)) {
      updateFields.push(`${key} = $${index}`);
      values.push(value);
      index++;
    }
  }

  if (updateFields.length === 0) {
    return null; // No valid fields to update
  }

  values.push(id);
  const query = `
    UPDATE users 
    SET ${updateFields.join(', ')}, updated_at = NOW() 
    WHERE id = $${index} 
    RETURNING *
  `;

  const { rows } = await db.query(query, values);
  return rows[0];
};

User.createGoal = async (userId, goalData) => {
    const { type, description, target_language, target_level, current_proficiency, completion_time_days, interests, scenarios } = goalData;

    const client = await db.pool.connect();
    let newGoal;
    try {
        await client.query('BEGIN');

        // Deactivate previous active goals for this user
        await client.query(
            "UPDATE user_goals SET status = 'abandoned', completed_at = NOW() WHERE user_id = $1 AND status = 'active'",
            [userId]
        );

        const query = `
            INSERT INTO user_goals (user_id, type, description, target_language, target_level, current_proficiency, completion_time_days, interests, scenarios)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const values = [
            userId,
            type || null,
            description || null,
            target_language,
            target_level,
            current_proficiency || 0,
            completion_time_days,
            interests,
            scenarios ? JSON.stringify(scenarios) : null
        ];

        const { rows } = await client.query(query, values);
        newGoal = rows[0];

        // --- 2. Normalized Task Insertion ---
        if (scenarios && Array.isArray(scenarios) && newGoal) {
            const taskValues = [];
            let placeholderIndex = 1;
            const placeholders = [];

            for (const scenario of scenarios) {
                if (scenario.tasks && Array.isArray(scenario.tasks)) {
                    for (const task of scenario.tasks) {
                        // Handle both string tasks and object tasks
                        const taskText = typeof task === 'string' ? task : task.text;

                        taskValues.push(userId, newGoal.id, scenario.title, taskText);
                        placeholders.push(`($${placeholderIndex}, $${placeholderIndex+1}, $${placeholderIndex+2}, $${placeholderIndex+3})`);
                        placeholderIndex += 4;
                    }
                }
            }

            if (placeholders.length > 0) {
                const taskQuery = `
                    INSERT INTO user_tasks (user_id, goal_id, scenario_title, task_description)
                    VALUES ${placeholders.join(', ')}
                `;
                await client.query(taskQuery, taskValues);
            }
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    // Also update the user's current target_language and interests for convenience
    await User.update(userId, { target_language, interests });

    return newGoal;
};

User.getActiveGoal = async (userId) => {
    // 1. Get the Goal
    const query = `SELECT * FROM user_goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`;
    const { rows } = await db.query(query, [userId]);
    const goal = rows[0];

    if (!goal) return null;

    // 2. Fetch Tasks statuses from user_tasks
    try {
        const taskQuery = `SELECT * FROM user_tasks WHERE goal_id = $1`;
        const taskRes = await db.query(taskQuery, [goal.id]);
        const dbTasks = taskRes.rows;

        // 3. Merge Status back into Scenarios JSON for Frontend
        // We use the JSON structure in 'user_goals' as the template for order/structure,
        // but overlay the status from 'user_tasks'.
        if (goal.scenarios && Array.isArray(goal.scenarios)) {
            goal.scenarios = goal.scenarios.map(scenario => {
                const scenarioTasks = scenario.tasks.map(t => {
                    const tText = typeof t === 'string' ? t : t.text;
                    // Find matching DB task
                    const dbTask = dbTasks.find(dbt => 
                        dbt.scenario_title === scenario.title && 
                        dbt.task_description === tText
                    );
                    
                    // Return object with status and progress
                    const taskScore = dbTask ? dbTask.score : 0;
                    const taskProgress = Math.min(100, Math.round((taskScore / 9) * 100)); // 3 points = 100% completion
                    return {
                        id: dbTask ? dbTask.id : null,
                        text: tText,
                        status: dbTask ? dbTask.status : 'pending',
                        score: taskScore,
                        progress: taskProgress
                    };
                });
                return { ...scenario, tasks: scenarioTasks };
            });
        }
    } catch (e) {
        console.error('[User] Error merging task statuses:', e);
        // Fallback: return goal as is (tasks might be strings or objects without status)
    }

    return goal;
};

User.completeTask = async (userId, scenarioTitle, taskText) => {
    // 1. Get active goal ID
    const goalQuery = `SELECT id FROM user_goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`;
    const goalRes = await db.query(goalQuery, [userId]);
    const goalId = goalRes.rows[0]?.id;

    if (!goalId) return null;

    console.log(`[User] Completing Task: Goal=${goalId}, Scenario=${scenarioTitle}, Task=${taskText}`);

    // --- Special Logic for NEXT_PENDING_TASK ---
    let targetTaskDescription = taskText;
    
    if (taskText === 'NEXT_PENDING_TASK') {
        // Strategy A: Try with Scenario Title
        let pendingQuery = `
            SELECT task_description FROM user_tasks 
            WHERE goal_id = $1 AND user_id = $2 
              AND (scenario_title = $3 OR scenario_title ILIKE $4)
              AND status != 'completed'
            ORDER BY id ASC
            LIMIT 1
        `;
        let pendingRes = await db.query(pendingQuery, [goalId, userId, scenarioTitle, `%${scenarioTitle}%`]);
        
        // Strategy B: Fallback - Any pending task in goal (Relaxed Mode)
        if (pendingRes.rows.length === 0) {
            console.log(`[User] NEXT_PENDING_TASK: No tasks found for scenario '${scenarioTitle}'. Trying global goal fallback.`);
            pendingQuery = `
                SELECT task_description, scenario_title FROM user_tasks 
                WHERE goal_id = $1 AND user_id = $2 
                  AND status != 'completed'
                ORDER BY id ASC
                LIMIT 1
            `;
            pendingRes = await db.query(pendingQuery, [goalId, userId]);
        }

        if (pendingRes.rows.length === 0) {
            console.log('[User] No pending tasks found for auto-completion (Goal Complete?).');
            return await User.getActiveGoal(userId); 
        }
        
        targetTaskDescription = pendingRes.rows[0].task_description;
        // Update scenarioTitle to match the task we found, ensuring the UPDATE query works
        if (pendingRes.rows[0].scenario_title) {
             scenarioTitle = pendingRes.rows[0].scenario_title;
        }
        console.log(`[User] Auto-resolved NEXT_PENDING_TASK to: "${targetTaskDescription}" (Scenario: ${scenarioTitle})`);
    }

    // 2. Update user_tasks table
    // We fuzzy match scenario_title slightly or exact match
    // Using ILIKE for scenario title to be safe against minor differences
    const updateQuery = `
        UPDATE user_tasks 
        SET status = 'completed', completed_at = NOW(), score = 100 
        WHERE goal_id = $1 
          AND user_id = $2
          AND (task_description ILIKE $3 OR task_description ILIKE '%' || $3 || '%' OR $3 ILIKE '%' || task_description || '%')
          AND (scenario_title = $4 OR scenario_title ILIKE $5)
        RETURNING *
    `;
    const { rows: updatedTasks } = await db.query(updateQuery, [
        goalId, 
        userId, 
        targetTaskDescription, 
        scenarioTitle,
        `%${scenarioTitle}%`
    ]);

    if (updatedTasks.length === 0) {
        console.log('[User] Task not found in DB to update.');
        // Fallback: If task doesn't exist (legacy goal), maybe we should just ignore or return null
        return null;
    }

    // 3. Recalculate Proficiency (Real Math!)
    // Count total tasks vs completed tasks for this goal
    const statsQuery = `
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'completed') as completed
        FROM user_tasks
        WHERE goal_id = $1
    `;
    const statsRes = await db.query(statsQuery, [goalId]);
    const { total, completed } = statsRes.rows[0];

    let newProficiency = 0;
    if (parseInt(total) > 0) {
        newProficiency = Math.round((parseInt(completed) / parseInt(total)) * 100);
    }

    console.log(`[User] Progress Update: ${completed}/${total} => ${newProficiency}%`);

    // 4. Update Goal Proficiency
    const updateGoalQuery = `
        UPDATE user_goals 
        SET current_proficiency = $1, updated_at = NOW() 
        WHERE id = $2 
        RETURNING *
    `;
    const { rows: goalRows } = await db.query(updateGoalQuery, [newProficiency, goalId]);
    
    // Return formatted goal (with merged tasks)
    // We call getActiveGoal again to ensure consistency
    return await User.getActiveGoal(userId);
};

User.confirmCompleteTaskById = async (userId, taskId) => {
    // 1. Load task — require ownership + score >= 9 (ready_to_complete gate)
    const taskRes = await db.query(
        `SELECT id, user_id, goal_id, scenario_title, task_description, score, status, feedback
         FROM user_tasks
         WHERE id = $1 AND user_id = $2`,
        [taskId, userId]
    );
    const task = taskRes.rows[0];
    if (!task) return { error: 'not_found' };
    if (task.status === 'completed') return { error: 'already_completed', task };
    if ((task.score || 0) < 9) return { error: 'not_ready', task };

    // 2. Mark completed
    const completedRes = await db.query(
        `UPDATE user_tasks
         SET status = 'completed', completed_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [taskId]
    );
    const completedTask = completedRes.rows[0];

    // 3. Recompute goal proficiency based on completed-vs-total ratio (parity with User.completeTask)
    const statsRes = await db.query(
        `SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'completed') as completed
         FROM user_tasks
         WHERE goal_id = $1`,
        [task.goal_id]
    );
    const { total, completed } = statsRes.rows[0];
    let newProficiency = 0;
    if (parseInt(total) > 0) {
        newProficiency = Math.round((parseInt(completed) / parseInt(total)) * 100);
    }
    await db.query(
        `UPDATE user_goals
         SET current_proficiency = $1, updated_at = NOW()
         WHERE id = $2`,
        [newProficiency, task.goal_id]
    );

    // 4. Find next pending task in the same scenario (fallback: any pending in goal)
    let nextRes = await db.query(
        `SELECT id, scenario_title, task_description, score, status
         FROM user_tasks
         WHERE goal_id = $1 AND user_id = $2
           AND scenario_title = $3
           AND status != 'completed'
         ORDER BY id ASC
         LIMIT 1`,
        [task.goal_id, userId, task.scenario_title]
    );
    if (nextRes.rows.length === 0) {
        nextRes = await db.query(
            `SELECT id, scenario_title, task_description, score, status
             FROM user_tasks
             WHERE goal_id = $1 AND user_id = $2
               AND status != 'completed'
             ORDER BY id ASC
             LIMIT 1`,
            [task.goal_id, userId]
        );
    }
    const nextTaskRow = nextRes.rows[0] || null;
    const nextTask = nextTaskRow
        ? {
            id: nextTaskRow.id,
            scenario_title: nextTaskRow.scenario_title,
            text: nextTaskRow.task_description,
            score: nextTaskRow.score,
            status: nextTaskRow.status,
        }
        : null;

    return {
        completed_task: completedTask,
        next_task: nextTask,
        current_proficiency: newProficiency,
    };
};

User.getUserGoals = async (userId) => {
    const { rows } = await db.query(
        `SELECT id, target_language, target_level, type, description,
                current_proficiency, completion_time_days, interests,
                scenarios, status, created_at, completed_at
         FROM user_goals
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
    );

    if (rows.length === 0) return rows;

    const goalIds = rows.map(g => g.id);
    const tasksByGoalId = new Map();
    try {
        const taskRes = await db.query(
            `SELECT * FROM user_tasks WHERE goal_id = ANY($1::int[])`,
            [goalIds]
        );
        for (const t of taskRes.rows) {
            if (!tasksByGoalId.has(t.goal_id)) tasksByGoalId.set(t.goal_id, []);
            tasksByGoalId.get(t.goal_id).push(t);
        }
    } catch (e) {
        console.error('[User] Error batch-fetching tasks for goals:', e);
    }

    for (const goal of rows) {
        if (!goal.scenarios || !Array.isArray(goal.scenarios)) continue;
        const dbTasks = tasksByGoalId.get(goal.id) || [];
        goal.scenarios = goal.scenarios.map(scenario => {
            const scenarioTasks = scenario.tasks.map(t => {
                const tText = typeof t === 'string' ? t : t.text;
                const dbTask = dbTasks.find(dbt =>
                    dbt.scenario_title === scenario.title &&
                    dbt.task_description === tText
                );
                const taskScore = dbTask ? dbTask.score : 0;
                const taskProgress = Math.min(100, Math.round((taskScore / 9) * 100));
                return {
                    id: dbTask ? dbTask.id : null,
                    text: tText,
                    status: dbTask ? dbTask.status : 'pending',
                    score: taskScore,
                    progress: taskProgress,
                };
            });
            return { ...scenario, tasks: scenarioTasks };
        });
    }

    return rows;
};

User.switchActiveGoal = async (userId, goalId) => {
    // Current active → paused (not abandoned, so user can switch back)
    await db.query(
        `UPDATE user_goals SET status = 'paused'
         WHERE user_id = $1 AND status = 'active'`,
        [userId]
    );
    // Target goal → active
    const { rows } = await db.query(
        `UPDATE user_goals SET status = 'active', completed_at = NULL
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [goalId, userId]
    );
    return rows[0];
};

User.completeGoal = async (goalId, userId) => {
    const query = `UPDATE user_goals SET status = 'completed', completed_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`;
    const { rows } = await db.query(query, [goalId, userId]);
    return rows[0];
};

User.updateProficiency = async (userId, delta) => {
    // 1. Find active goal
    const activeGoal = await User.getActiveGoal(userId);
    if (!activeGoal) {
        console.log(`[User] No active goal found for user ${userId} to update proficiency.`);
        return null;
    }

    const currentScore = parseInt(activeGoal.current_proficiency || 0, 10);
    const deltaVal = parseInt(delta, 10);

    // 2. Calculate new proficiency (clamped 0-100)
    let newScore = currentScore + deltaVal;
    if (newScore > 100) newScore = 100;
    if (newScore < 0) newScore = 0;

    console.log(`[User] Updating proficiency: ${currentScore} + ${deltaVal} = ${newScore}`);

    // 3. Update
    const query = `UPDATE user_goals SET current_proficiency = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
    const { rows } = await db.query(query, [newScore, activeGoal.id]);
    return rows[0];
};

User.updateTaskScore = async (userId, scenarioTitle, taskText, scoreDelta, feedback) => {
    const COMPLETION_THRESHOLD = 60;
    
    const goalQuery = `SELECT id FROM user_goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`;
    const goalRes = await db.query(goalQuery, [userId]);
    const goalId = goalRes.rows[0]?.id;
    if (!goalId) return null;

    let findRes;
    
    if (taskText === 'NEXT_PENDING_TASK') {
        let pendingQuery = `
            SELECT * FROM user_tasks 
            WHERE goal_id = $1 AND user_id = $2 
              AND (scenario_title = $3 OR scenario_title ILIKE $4)
              AND status != 'completed'
            ORDER BY id ASC
            LIMIT 1
        `;
        findRes = await db.query(pendingQuery, [goalId, userId, scenarioTitle, `%${scenarioTitle}%`]);
        
        if (findRes.rows.length === 0) {
            pendingQuery = `
                SELECT * FROM user_tasks 
                WHERE goal_id = $1 AND user_id = $2 
                  AND status != 'completed'
                ORDER BY id ASC
                LIMIT 1
            `;
            findRes = await db.query(pendingQuery, [goalId, userId]);
        }
    } else {
        const findQuery = `
            SELECT * FROM user_tasks 
            WHERE goal_id = $1 AND user_id = $2
              AND (scenario_title = $3 OR scenario_title ILIKE $4)
              AND (task_description ILIKE $5 OR task_description ILIKE '%' || $5 || '%')
            LIMIT 1
        `;
        findRes = await db.query(findQuery, [goalId, userId, scenarioTitle, `%${scenarioTitle}%`, taskText]);
    }
    
    if (findRes.rows.length === 0) {
        console.log(`[User] Task not found for score update: ${scenarioTitle} / ${taskText}`);
        return null;
    }

    const task = findRes.rows[0];
    const currentScore = parseInt(task.score || 0, 10);
    const interactions = parseInt(task.interaction_count || 0, 10);
    let newScore = Math.min(100, currentScore + parseInt(scoreDelta, 10));
    const newInteractions = interactions + 1;
    
    const shouldComplete = newScore >= COMPLETION_THRESHOLD && task.status !== 'completed';
    const newStatus = shouldComplete ? 'completed' : task.status;
    
    console.log(`[User] Task Score Update: ${task.scenario_title}/${task.task_description} | Score: ${currentScore} + ${scoreDelta} = ${newScore} | Interactions: ${newInteractions} | Complete: ${shouldComplete}`);

    const updateQuery = `
        UPDATE user_tasks 
        SET score = $1, 
            interaction_count = $2, 
            status = $3::varchar, 
            feedback = COALESCE($4, feedback),
            completed_at = CASE WHEN $5 = true AND completed_at IS NULL THEN NOW() ELSE completed_at END,
            updated_at = NOW()
        WHERE id = $6
        RETURNING *
    `;
    await db.query(updateQuery, [newScore, newInteractions, newStatus, feedback, shouldComplete, task.id]);

    if (shouldComplete) {
        const statsQuery = `
            SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'completed') as completed
            FROM user_tasks WHERE goal_id = $1
        `;
        const statsRes = await db.query(statsQuery, [goalId]);
        const { total, completed } = statsRes.rows[0];
        const newProficiency = parseInt(total) > 0 ? Math.round((parseInt(completed) / parseInt(total)) * 100) : 0;
        
        await db.query(`UPDATE user_goals SET current_proficiency = $1, updated_at = NOW() WHERE id = $2`, [newProficiency, goalId]);
        console.log(`[User] Goal proficiency updated: ${completed}/${total} = ${newProficiency}%`);
    }

    const goal = await User.getActiveGoal(userId);
    return {
        goal,
        taskCompleted: shouldComplete,
        newScore: newScore,
        taskName: task.task_description
    };
}


User.findByEmail = async (email) => {
    const { rows } = await db.query(
        `SELECT u.*, ui.provider_uid AS password
         FROM users u
         LEFT JOIN user_identities ui ON ui.user_id = u.id AND ui.provider = 'local'
         WHERE u.email = $1`,
        [email]
    );
    if (rows.length === 0) {
        return null;
    }
    const user = rows[0];
    if (user.password === null) {
        delete user.password;
    }
    return user;
};

// 重置/更新本地密码：bcrypt 哈希后写入 user_identities.provider_uid（provider='local'）。
// 若该用户还没有 local 身份（纯 Google 账号），则插入一条。返回是否成功。
User.updateLocalPassword = async (userId, newPassword) => {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword, salt);
    const upd = await db.query(
        `UPDATE user_identities SET provider_uid = $1
         WHERE user_id = $2 AND provider = 'local'`,
        [hashed, userId]
    );
    if (upd.rowCount === 0) {
        // 没有 local 身份 → 新建（让原本 Google-only 的账号也能设密码登录）
        await db.query(
            `INSERT INTO user_identities (user_id, provider, provider_uid) VALUES ($1, 'local', $2)`,
            [userId, hashed]
        );
    }
    return true;
};

// ===== Daily Check-in Methods =====

User.checkin = async (userId) => {
    const today = new Date().toISOString().split('T')[0];
    
    // Check if already checked in today
    const existingRes = await db.query(
        'SELECT * FROM user_checkins WHERE user_id = $1 AND checkin_date = $2',
        [userId, today]
    );
    
    if (existingRes.rows.length > 0) {
        return { alreadyCheckedIn: true, checkin: existingRes.rows[0] };
    }
    
    // Calculate streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    const streakRes = await db.query(
        'SELECT streak_count FROM user_checkins WHERE user_id = $1 AND checkin_date = $2',
        [userId, yesterdayStr]
    );
    
    let newStreak = 1;
    if (streakRes.rows.length > 0) {
        newStreak = streakRes.rows[0].streak_count + 1;
    }
    
    // Calculate points based on streak (base 10 + streak bonus)
    const basePoints = 10;
    const streakBonus = Math.min(newStreak - 1, 20) * 2; // Max 40 bonus points
    const pointsEarned = basePoints + streakBonus;
    
    // Insert checkin record
    const checkinRes = await db.query(
        `INSERT INTO user_checkins (user_id, checkin_date, points_earned, streak_count)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [userId, today, pointsEarned, newStreak]
    );
    
    // Update user's total points
    await db.query(
        'UPDATE users SET points = COALESCE(points, 0) + $1, updated_at = NOW() WHERE id = $2',
        [pointsEarned, userId]
    );
    
    return { alreadyCheckedIn: false, checkin: checkinRes.rows[0] };
}

User.getCheckinHistory = async (userId, days = 30) => {
    const res = await db.query(
        `SELECT * FROM user_checkins 
         WHERE user_id = $1 
         ORDER BY checkin_date DESC 
         LIMIT $2`,
        [userId, days]
    );
    return res.rows;
};

User.getCheckinStats = async (userId) => {
    // Get current streak
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // Check today's or yesterday's streak
    const streakRes = await db.query(
        `SELECT streak_count, checkin_date FROM user_checkins 
         WHERE user_id = $1 AND checkin_date IN ($2, $3) 
         ORDER BY checkin_date DESC LIMIT 1`,
        [userId, today, yesterdayStr]
    );
    
    let currentStreak = 0;
    let checkedInToday = false;
    
    if (streakRes.rows.length > 0) {
        const lastCheckin = streakRes.rows[0];
        currentStreak = lastCheckin.streak_count;
        checkedInToday = lastCheckin.checkin_date.toISOString().split('T')[0] === today;
    }
    
    // Get total checkins
    const totalRes = await db.query(
        'SELECT COUNT(*) as total, SUM(points_earned) as total_points FROM user_checkins WHERE user_id = $1',
        [userId]
    );
    
    return {
        currentStreak,
        checkedInToday,
        totalCheckins: parseInt(totalRes.rows[0].total) || 0,
        totalPointsFromCheckins: parseInt(totalRes.rows[0].total_points) || 0
    };
}

// ===== Daily QA Pass Methods =====

User.recordDailyQAPass = async (userId, questionText) => {
    const { rows } = await db.query(
        `INSERT INTO daily_qa_passes (user_id, question_text)
         VALUES ($1, $2)
         ON CONFLICT (user_id, pass_date) DO NOTHING
         RETURNING *`,
        [userId, questionText]
    );
    return rows[0] || null;
};

User.getDailyQAPassStatus = async (userId) => {
    const { rows } = await db.query(
        `SELECT id, pass_date, question_text, created_at
         FROM daily_qa_passes
         WHERE user_id = $1 AND pass_date = CURRENT_DATE
         LIMIT 1`,
        [userId]
    );
    return { passed: rows.length > 0, record: rows[0] || null };
};

User.findOrCreateFromGoogle = async ({ googleId, email, name }) => {
  try {
    // Check if user already exists via Google identity
    let res = await db.query(
      'SELECT user_id FROM user_identities WHERE provider = $1 AND provider_uid = $2',
      ['google', googleId]
    );

    if (res.rows.length > 0) {
      // User exists, fetch and return user details
      const userResult = await db.query('SELECT * FROM users WHERE id = $1', [res.rows[0].user_id]);
      return userResult.rows[0];
    } else {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');

        let newUserRes;
        let usernameToTry = name;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            newUserRes = await client.query(
              'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id, username, email',
              [usernameToTry, email]
            );
            break;
          } catch (insertErr) {
            if (insertErr.code === '23505' && insertErr.detail?.includes('username') && attempt < 2) {
              usernameToTry = `${name}_${Math.floor(Math.random() * 9000 + 1000)}`;
              continue;
            }
            throw insertErr;
          }
        }
        const newUser = newUserRes.rows[0];

        await client.query(
          'INSERT INTO user_identities (user_id, provider, provider_uid) VALUES ($1, $2, $3)',
          [newUser.id, 'google', googleId]
        );

        await client.query('COMMIT');
        return newUser;
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    }
  } catch (error) {
    console.error('Error in findOrCreateFromGoogle:', error);
    throw error;
  }
};

// 手机号验证码登录：按 phone 查；不存在则建号（phone 唯一）。返回 user。
User.findOrCreateByPhone = async (phone) => {
  const existing = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }
  // 用手机号尾号派生一个默认 username，冲突则加随机后缀
  const base = `用户${String(phone).slice(-4)}`;
  let usernameToTry = base;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const ins = await db.query(
        'INSERT INTO users (username, phone) VALUES ($1, $2) RETURNING *',
        [usernameToTry, phone]
      );
      return ins.rows[0];
    } catch (err) {
      if (err.code === '23505' && err.detail?.includes('username') && attempt < 3) {
        usernameToTry = `${base}_${Math.floor(Math.random() * 9000 + 1000)}`;
        continue;
      }
      throw err;
    }
  }
  throw new Error('failed to create phone user');
};

// ===== Task Keywords Management =====

/**
 * Get keywords for a specific task
 * @param {number} taskId - Task ID
 * @returns {Promise<string[]>} - Array of keywords
 */
User.getTaskKeywords = async (taskId) => {
  try {
    const res = await db.query(
      'SELECT keywords FROM user_task_keywords WHERE task_id = $1',
      [taskId]
    );
    
    if (res.rows.length > 0) {
      return res.rows[0].keywords || [];
    }
    return [];
  } catch (error) {
    console.error('Error fetching task keywords:', error);
    return [];
  }
};

/**
 * Save keywords for a specific task
 * @param {number} taskId - Task ID
 * @param {string[]} keywords - Array of keywords
 * @returns {Promise<boolean>} - Success status
 */
User.saveTaskKeywords = async (taskId, keywords) => {
  try {
    await db.query(
      `INSERT INTO user_task_keywords (task_id, keywords, created_at, updated_at)
       VALUES ($1, $2::jsonb, NOW(), NOW())
       ON CONFLICT (task_id) 
       DO UPDATE SET keywords = $2::jsonb, updated_at = NOW()`,
      [taskId, JSON.stringify(keywords)]
    );
    return true;
  } catch (error) {
    console.error('Error saving task keywords:', error);
    return false;
  }
};

/**
 * Delete keywords for a specific task
 * @param {number} taskId - Task ID
 * @returns {Promise<boolean>} - Success status
 */
User.deleteTaskKeywords = async (taskId) => {
  try {
    await db.query(
      'DELETE FROM user_task_keywords WHERE task_id = $1',
      [taskId]
    );
    return true;
  } catch (error) {
    console.error('Error deleting task keywords:', error);
    return false;
  }
};

/**
 * Generate keywords for a task using AI
 * @param {string} taskDescription - Task description
 * @param {string} scenarioTitle - Scenario title
 * @param {string} targetLanguage - Target language (default: English)
 * @returns {Promise<string[]>} - Array of generated keywords
 */
User.generateTaskKeywords = async (taskDescription, scenarioTitle, targetLanguage = 'English') => {
  console.log(`Generating keywords for task: ${taskDescription}, scenario: ${scenarioTitle}`);
  try {
    const apiKey = process.env.QWEN3_OMNI_API_KEY;
    console.log(`API Key present: ${!!apiKey}`);
    if (!apiKey) {
      console.warn('QWEN3_OMNI_API_KEY not set, using fallback keywords');
      return User._getFallbackKeywords(taskDescription, scenarioTitle);
    }

    const prompt = `You are an English language teaching expert. For the following speaking practice scenario and task, generate 12-15 essential English keywords/phrases that students should use when practicing this task.

Scenario: ${scenarioTitle || "General Conversation"}
Task: ${taskDescription || "Practice speaking English"}
Target Language: ${targetLanguage}

Return ONLY a JSON array of strings, like: ["keyword1", "keyword2", ...]

The keywords should be:
- Practical and commonly used in this scenario
- Include both single words and short phrases
- Appropriate for the task context
- Easy to remember and use in conversation`;

    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen-turbo',
          input: {
            messages: [{ role: 'user', content: prompt }]
          }
        })
      }
    );
    console.log(`AI API response status: ${response.status}`);

    if (response.status === 200) {
      const result = await response.json();
      // Qwen API returns text in output.text, not output.choices[0].message.content
      const content = result.output?.text || result.output?.choices?.[0]?.message?.content || '[]';
      console.log(`AI API response content: ${content.substring(0, 200)}`);
      
      // Extract JSON array from response
      const jsonMatch = content.match(/\[.*\]/s);
      if (jsonMatch) {
        const keywords = JSON.parse(jsonMatch[0]);
        console.log(`Parsed keywords: ${keywords.length} items`);
        return keywords
          .filter(kw => typeof kw === 'string' && kw.trim().length > 0)
          .map(kw => kw.toLowerCase().trim())
          .slice(0, 15);
      } else {
        console.log('No JSON array found in response, using fallback');
      }
    } else {
      console.log(`AI API error status: ${response.status}`);
    }
    
    // Fallback to simple keyword generation
    console.log('Using fallback keywords');
    return User._getFallbackKeywords(taskDescription, scenarioTitle);
  } catch (error) {
    console.error('Error generating task keywords:', error.message);
    return User._getFallbackKeywords(taskDescription, scenarioTitle);
  }
};

/**
 * Fallback keyword generation when AI is not available
 * @param {string} taskDescription - Task description
 * @param {string} scenarioTitle - Scenario title
 * @returns {string[]} - Array of fallback keywords
 */
User._getFallbackKeywords = (taskDescription, scenarioTitle) => {
  const keywords = new Set();
  const text = `${taskDescription} ${scenarioTitle}`.toLowerCase();
  
  // Extract English words
  const englishWords = text.match(/\b[a-zA-Z]{3,}\b/g) || [];
  englishWords.forEach(word => {
    if (!['the', 'and', 'for', 'with', 'about', 'your', 'you', 'that', 'this', 'have', 'has'].includes(word)) {
      keywords.add(word);
    }
  });
  
  // Add common conversation starters
  const starters = ['hello', 'hi', 'thank you', 'please', 'excuse me', 'can you', 'could you', 'i would like'];
  starters.forEach(starter => keywords.add(starter));

  return Array.from(keywords).slice(0, 15);
};

// ===== Daily Practice Time =====

User.recordPracticeTime = async (userId, minutes) => {
  const { rows } = await db.query(
    `INSERT INTO daily_practice_time (user_id, minutes)
     VALUES ($1, $2)
     ON CONFLICT (user_id, practice_date)
     DO UPDATE SET minutes = GREATEST(daily_practice_time.minutes, $2)
     RETURNING *`,
    [userId, minutes]
  );
  return rows[0];
};

User.getDailyPracticeTime = async (userId) => {
  const { rows } = await db.query(
    `SELECT minutes FROM daily_practice_time
     WHERE user_id = $1 AND practice_date = CURRENT_DATE`,
    [userId]
  ).catch(() => ({ rows: [] }));
  return rows[0]?.minutes || 0;
};

User.getDailyProgress = async (userId) => {
  // 1. 复述完成状态 — 前端通过 localStorage 跟踪，后端暂返回 false
  //    后续可通过 conversation-service 添加 mode 字段来追踪
  let recallCompleted = false;

  // 2. 问答完成
  const qaStatus = await User.getDailyQAPassStatus(userId);

  // 3. 场景完成 — 检查今日是否有任务被完成
  const scenarioRes = await db.query(
    `SELECT EXISTS(
       SELECT 1 FROM user_tasks
       WHERE user_id = $1 AND completed_at >= CURRENT_DATE AND status = 'completed'
     ) AS completed`,
    [userId]
  ).catch(() => ({ rows: [{ completed: false }] }));
  const scenarioCompleted = scenarioRes.rows[0]?.completed || false;

  // 4. 练习时长
  const practiceMinutes = await User.getDailyPracticeTime(userId);

  // 5. 练习目标
  const userRes = await db.query('SELECT daily_practice_goal FROM users WHERE id = $1', [userId])
    .catch(() => ({ rows: [] }));
  const practiceGoal = userRes.rows[0]?.daily_practice_goal || 15;

  // 6. 打卡状态
  const checkinStats = await User.getCheckinStats(userId);

  // 7. 本月打卡天数
  const monthlyRes = await db.query(
    `SELECT COUNT(*) AS days FROM user_checkins
     WHERE user_id = $1
       AND checkin_date >= date_trunc('month', CURRENT_DATE)
       AND checkin_date < date_trunc('month', CURRENT_DATE) + interval '1 month'`,
    [userId]
  );
  const monthlyCheckinDays = parseInt(monthlyRes.rows[0]?.days) || 0;

  // 8. 累计总练习时长
  const totalRes = await db.query(
    'SELECT COALESCE(SUM(minutes), 0) AS total FROM daily_practice_time WHERE user_id = $1',
    [userId]
  ).catch(() => ({ rows: [{ total: 0 }] }));
  const totalPracticeMinutes = parseInt(totalRes.rows[0]?.total) || 0;

  return {
    recallCompleted,
    qaCompleted: qaStatus.passed,
    scenarioCompleted,
    practiceMinutes,
    practiceGoal,
    totalPracticeMinutes,
    monthlyCheckinDays,
    checkedInToday: checkinStats.checkedInToday,
    streak: checkinStats.currentStreak,
  };
};

// ===== Feedback =====

User.submitFeedback = async (userId, category, message) => {
  const { rows } = await db.query(
    'INSERT INTO user_feedback (user_id, category, message) VALUES ($1, $2, $3) RETURNING *',
    [userId, category, message]
  );
  return rows[0];
};

// ===== Achievements =====

User.getUserAchievements = async (userId) => {
  const { rows } = await db.query(
    'SELECT achievement_key, unlocked_at FROM user_achievements WHERE user_id = $1',
    [userId]
  );
  const unlocked = {};
  for (const r of rows) {
    unlocked[r.achievement_key] = r.unlocked_at;
  }
  const result = Object.entries(ACHIEVEMENTS).map(([key, def]) => ({
    key,
    ...def,
    unlocked: !!unlocked[key],
    unlocked_at: unlocked[key] || null,
  }));
  return result;
};

User.unlockAchievement = async (userId, achievementKey) => {
  if (!ACHIEVEMENTS[achievementKey]) return null;
  const { rows } = await db.query(
    `INSERT INTO user_achievements (user_id, achievement_key)
     VALUES ($1, $2)
     ON CONFLICT (user_id, achievement_key) DO NOTHING
     RETURNING *`,
    [userId, achievementKey]
  );
  return rows[0] || null;
};

// Persist a scenario cover image URL into user_goals.scenarios[i].image_url.
// JSONB column — we read, mutate the matching scenario by title, write back.
// Idempotent: re-writing the same URL is harmless. Returns true if a scenario
// matched and was updated, false otherwise.
// userId (optional) scopes the write to the goal's owner — defense-in-depth
// against cross-user overwrite on the internal endpoint (IDOR). Wrapped in a
// transaction with SELECT ... FOR UPDATE so concurrent writes to different
// scenarios in the same goal don't clobber each other (read-modify-write race).
User.updateScenarioImage = async (goalId, scenarioTitle, imageUrl, userId = null) => {
    if (!goalId || !scenarioTitle || !imageUrl) return false;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const where = userId ? 'WHERE id = $1 AND user_id = $2' : 'WHERE id = $1';
        const params = userId ? [goalId, userId] : [goalId];
        const { rows } = await client.query(
            `SELECT scenarios FROM user_goals ${where} FOR UPDATE`,
            params
        );
        const goal = rows[0];
        if (!goal || !Array.isArray(goal.scenarios)) {
            await client.query('ROLLBACK');
            return false;
        }

        let matched = false;
        const updated = goal.scenarios.map(s => {
            if (s && s.title === scenarioTitle) {
                matched = true;
                return { ...s, image_url: imageUrl };
            }
            return s;
        });
        if (!matched) {
            await client.query('ROLLBACK');
            return false;
        }

        await client.query(
            `UPDATE user_goals SET scenarios = $1, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(updated), goalId]
        );
        await client.query('COMMIT');
        return true;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
};

module.exports = User;