const express = require('express');
const router = express.Router();
const { getPrizes, redeemPrize } = require('../controllers/prizeController');
const { authenticateToken } = require('../middleware/auth');

// Get user's prizes
router.get('/my-prizes', authenticateToken, getPrizes);

// Redeem a prize
router.post('/redeem/:prizeId', authenticateToken, redeemPrize);

module.exports = router;
