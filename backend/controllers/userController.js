const { getDatabase } = require('../config/database');

const getUserProfile = (req, res) => {
  const userId = req.user.id;
  const db = getDatabase();

  db.get(
    'SELECT id, username, email, created_at FROM users WHERE id = ?',
    [userId],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    }
  );
};

const updateProfile = (req, res) => {
  const userId = req.user.id;
  const { username } = req.body;
  const db = getDatabase();

  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }

  db.run(
    'UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [username, userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Update failed' });
      }

      res.json({ message: 'Profile updated successfully' });
    }
  );
};

module.exports = {
  getUserProfile,
  updateProfile
};
