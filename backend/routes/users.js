const express = require('express');
const router = express.Router();
const { getUserProfile, updateProfile } = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');

// Get user profile (requires authentication)
router.get('/profile', authenticateToken, getUserProfile);

// Update user profile
router.put('/profile', authenticateToken, updateProfile);

module.exports = router;
