const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../config/database');
const { generateToken } = require('../middleware/auth');

const register = (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Hash password
  const hashedPassword = bcrypt.hashSync(password, 10);
  const userId = uuidv4();

  const db = getDatabase();
  db.run(
    'INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)',
    [userId, username, email, hashedPassword],
    (err) => {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Username or email already exists' });
        }
        return res.status(500).json({ error: 'Registration failed' });
      }

      const token = generateToken(userId);
      res.status(201).json({
        message: 'User registered successfully',
        userId,
        token,
        user: { id: userId, username, email }
      });
    }
  );
};

const login = (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const db = getDatabase();
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatch = bcrypt.compareSync(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.id);
    res.json({
      message: 'Login successful',
      userId: user.id,
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });
  });
};

module.exports = {
  register,
  login
};
