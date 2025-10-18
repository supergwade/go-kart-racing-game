const pool = require('../config/database');

// Submit a new score
const submitScore = async (req, res) => {
  try {
    const { lap_time, track_name } = req.body;
    const userId = req.user.id; // From authenticateToken middleware

    if (!lap_time || !track_name) {
      return res.status(400).json({ 
        error: 'Missing required fields: lap_time and track_name' 
      });
    }

    // Validate lap_time is a positive number
    if (typeof lap_time !== 'number' || lap_time <= 0) {
      return res.status(400).json({ 
        error: 'Invalid lap_time: must be a positive number' 
      });
    }

    // Insert the score into the database
    const query = `
      INSERT INTO leaderboard (user_id, lap_time, track_name, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `;
    
    const result = await pool.query(query, [userId, lap_time, track_name]);

    res.status(201).json({
      message: 'Score submitted successfully',
      score: result.rows[0]
    });

  } catch (error) {
    console.error('Error submitting score:', error);
    res.status(500).json({ 
      error: 'Failed to submit score',
      details: error.message 
    });
  }
};

// Get top leaderboard scores
const getLeaderboard = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const trackName = req.query.track;

    let query = `
      SELECT 
        l.id,
        l.lap_time,
        l.track_name,
        l.created_at,
        u.username
      FROM leaderboard l
      JOIN users u ON l.user_id = u.id
    `;

    const params = [];
    
    // Filter by track if specified
    if (trackName) {
      query += ` WHERE l.track_name = $1`;
      params.push(trackName);
      query += ` ORDER BY l.lap_time ASC LIMIT $2`;
      params.push(limit);
    } else {
      query += ` ORDER BY l.lap_time ASC LIMIT $1`;
      params.push(limit);
    }

    const result = await pool.query(query, params);

    res.json({
      leaderboard: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ 
      error: 'Failed to fetch leaderboard',
      details: error.message 
    });
  }
};

// Get specific user's scores
const getUserScores = async (req, res) => {
  try {
    const { userId } = req.params;

    const query = `
      SELECT 
        l.id,
        l.lap_time,
        l.track_name,
        l.created_at,
        u.username
      FROM leaderboard l
      JOIN users u ON l.user_id = u.id
      WHERE l.user_id = $1
      ORDER BY l.lap_time ASC
    `;

    const result = await pool.query(query, [userId]);

    // Get user's best rank for each track
    const ranksQuery = `
      WITH ranked_scores AS (
        SELECT 
          user_id,
          track_name,
          lap_time,
          RANK() OVER (PARTITION BY track_name ORDER BY lap_time ASC) as rank
        FROM leaderboard
      )
      SELECT track_name, rank, lap_time
      FROM ranked_scores
      WHERE user_id = $1
      ORDER BY rank ASC
    `;

    const ranksResult = await pool.query(ranksQuery, [userId]);

    res.json({
      scores: result.rows,
      bestRanks: ranksResult.rows,
      totalScores: result.rows.length
    });

  } catch (error) {
    console.error('Error fetching user scores:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user scores',
      details: error.message 
    });
  }
};

// CRITICAL: Export all functions
module.exports = {
  submitScore,
  getLeaderboard,
  getUserScores
};
