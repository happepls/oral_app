const db = require('./db');
const bcrypt = require('bcryptjs');

const User = {};

User.create = async (username, email, password) => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // This is a simplified example. In a real application, you would use transactions
    // to ensure that both the user and the identity are created successfully.
    const userResult = await db.query(
        'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id',
        [username, email]
    );
    const userId = userResult.rows[0].id;

    await db.query(
        'INSERT INTO user_identities (provider, provider_uid, user_id) VALUES ($1, $2, $3)',
        ['local', hashedPassword, userId]
    );

    return { id: userId, username, email };
};

User.findById = async (id) => {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (rows.length === 0) {
        return null;
    }
    const user = rows[0];

    // Get password hash from user_identities
    const identityResult = await db.query(
        'SELECT provider_uid FROM user_identities WHERE user_id = $1 AND provider = $2',
        [user.id, 'local']
    );

    if (identityResult.rows.length > 0) {
        user.password = identityResult.rows[0].provider_uid;
    }

    return user;
};

User.update = async (id, updates) => {
  const allowedUpdates = [
      'username', 'avatar_url', 'native_language', 'learning_goal',
      'nickname', 'gender', 'birth_year', 'target_language', 'interests', 'points'
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
    
    // Deactivate previous active goals for this user
    await db.query(
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
    
    const { rows } = await db.query(query, values);
    const newGoal = rows[0];
    
    // --- 2. Normalized Task Insertion ---
    if (scenarios && Array.isArray(scenarios) && newGoal) {
        try {
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
                await db.query(taskQuery, taskValues);
            }
        } catch (taskErr) {
            console.error('[User] Failed to insert normalized tasks:', taskErr);
            // Don't fail the whole goal creation, but log it critical
        }
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
                    
                    // Return object with status
                    return {
                        text: tText,
                        status: dbTask ? dbTask.status : 'pending',
                        score: dbTask ? dbTask.score : 0
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
            status = $3, 
            feedback = COALESCE($4, feedback),
            completed_at = CASE WHEN $3 = 'completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END,
            updated_at = NOW()
        WHERE id = $5
        RETURNING *
    `;
    await db.query(updateQuery, [newScore, newInteractions, newStatus, feedback, task.id]);

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
};


User.findByEmail = async (email) => {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (rows.length === 0) {
        return null;
    }
    const user = rows[0];

    // Get password hash from user_identities
    const identityResult = await db.query(
        'SELECT provider_uid FROM user_identities WHERE user_id = $1 AND provider = $2',
        [user.id, 'local']
    );

    if (identityResult.rows.length > 0) {
        user.password = identityResult.rows[0].provider_uid;
    }

    return user;
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
};

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
      // User does not exist, create them.
      // Note: In a production app, you'd wrap this in a transaction.
      
      // 1. Create user in users table, using 'name' for the 'username' column
      const newUserRes = await db.query(
        'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id, username, email',
        [name, email]
      );
      const newUser = newUserRes.rows[0];

      // 2. Create identity in user_identities table
      await db.query(
        'INSERT INTO user_identities (user_id, provider, provider_uid) VALUES ($1, $2, $3)',
        [newUser.id, 'google', googleId]
      );

      return newUser;
    }
  } catch (error) {
    console.error('Error in findOrCreateFromGoogle:', error);
    throw error;
  }
};

module.exports = User;