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
    const { target_language, target_level, current_proficiency, completion_time_days, interests } = goalData;
    
    // Deactivate previous active goals for this user
    await db.query(
        "UPDATE user_goals SET status = 'abandoned', completed_at = NOW() WHERE user_id = $1 AND status = 'active'",
        [userId]
    );

    const query = `
        INSERT INTO user_goals (user_id, target_language, target_level, current_proficiency, completion_time_days, interests)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
    `;
    const values = [userId, target_language, target_level, current_proficiency || 0, completion_time_days, interests];
    
    const { rows } = await db.query(query, values);
    
    // Also update the user's current target_language and interests for convenience
    await User.update(userId, { target_language, interests });

    return rows[0];
};

User.getActiveGoal = async (userId) => {
    const query = `SELECT * FROM user_goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`;
    const { rows } = await db.query(query, [userId]);
    return rows[0] || null;
};

User.completeGoal = async (goalId, userId) => {
    const query = `UPDATE user_goals SET status = 'completed', completed_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`;
    const { rows } = await db.query(query, [goalId, userId]);
    return rows[0];
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