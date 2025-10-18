const express = require('express');
const router = express.Router();
const { submitScore, getLeaderboard, getUserScores } = require('../controllers/leaderboardController');
const { authenticateToken } = require('../middleware/auth');

// Submit a new score
router.post('/submit', authenticateToken, submitScore);

// Get top leaderboard
router.get('/top', getLeaderboard);

// Get specific user's scores
router.get('/user/:userId', getUserScores);

module.exports = router;
