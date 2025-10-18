const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../config/database');

const submitScore = (req, res) => {
  const userId = req.user.id;
  const { lapTime, trackName = 'Main Track' } = req.body;

  if (!lapTime || lapTime <= 0) {
    return res.status(400).json({ error: 'Valid lap time required' });
  }

  const scoreId = uuidv4();
  const db = getDatabase();

  db.run(
    'INSERT INTO leaderboard (id, user_id, lap_time, track_name) VALUES (?, ?, ?, ?)',
    [scoreId, userId, lapTime, trackName],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to submit score' });
      }

      // Check if user is in top 10 and award prize
      checkAndAwardPrize(userId, lapTime);

      res.status(201).json({
        message: 'Score submitted successfully',
        scoreId,
        lapTime
      });
    }
  );
};

const getLeaderboard = (req, res) => {
  const limit = req.query.limit || 100;
  const db = getDatabase();

  db.all(
    `SELECT u.id, u.username, l.lap_time, l.track_name, l.created_at
     FROM leaderboard l
     JOIN users u ON l.user_id = u.id
     ORDER BY l.lap_time ASC
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        leaderboard: rows || [],
        count: (rows || []).length
      });
    }
  );
};

const getUserScores = (req, res) => {
  const userId = req.params.userId;
  const db = getDatabase();

  db.all(
    `SELECT id, lap_time, track_name, created_at FROM leaderboard WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        scores: rows || [],
        count: (rows || []).length
      });
    }
  );
};

const checkAndAwardPrize = (userId, lapTime) => {
  const db = getDatabase();

  // Check if user is in top 10
  db.get(
    `SELECT COUNT(*) as rank FROM leaderboard WHERE lap_time < ?`,
    [lapTime],
    (err, result) => {
      if (err) return;

      const rank = result.rank + 1;
      if (rank <= 10) {
        // Award prize
        const prizeId = uuidv4();
        const prizeCode = `GOKART-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        db.run(
          'INSERT INTO prizes (id, user_id, prize_code, prize_type) VALUES (?, ?, ?, ?)',
          [prizeId, userId, prizeCode, 'free_ride'],
          (err) => {
            if (!err) {
              console.log(`🏆 Prize awarded to user ${userId}: ${prizeCode}`);
            }
          }
        );
      }
    }
  );
};

module.exports = {
  submitScore,
  getLeaderboard,
  getUserScores
};
