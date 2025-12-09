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