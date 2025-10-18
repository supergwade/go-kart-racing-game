const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database - use PostgreSQL in production, SQLite for local dev
let dbConfig;
if (process.env.DATABASE_URL) {
  console.log('📊 Using PostgreSQL database (Production)');
  dbConfig = require('./config/database-postgres');
} else {
  console.log('📊 Using SQLite database (Development)');
  dbConfig = require('./config/database');
}

dbConfig.initializeDatabase();

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/prizes', require('./routes/prizes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Backend is running!',
    database: process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🎮 Go-Kart Backend running on http://localhost:${PORT}`);
  console.log(`📊 API documentation available at http://localhost:${PORT}/api`);
});
