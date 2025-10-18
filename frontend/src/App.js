import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import GamePage from './pages/GamePage';
import LeaderboardPage from './pages/LeaderboardPage';
import DashboardPage from './pages/DashboardPage';

function App() {
  // TEMPORARY: Auto-authenticate with demo user for testing
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [user, setUser] = useState({ id: 'demo-user', username: 'Demo Player', email: 'demo@example.com' });

  useEffect(() => {
    // Check if token exists in localStorage
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(savedUser));
    } else {
      // Set demo user in localStorage for testing
      localStorage.setItem('user', JSON.stringify({ id: 'demo-user', username: 'Demo Player', email: 'demo@example.com' }));
    }
  }, []);

  const handleLogin = (userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route 
            path="/login" 
            element={!isAuthenticated ? <LoginPage onLogin={handleLogin} /> : <Navigate to="/dashboard" />} 
          />
          <Route 
            path="/register" 
            element={!isAuthenticated ? <RegisterPage onRegister={handleLogin} /> : <Navigate to="/dashboard" />} 
          />
          <Route 
            path="/game" 
            element={<GamePage user={user} />} 
          />
          <Route 
            path="/leaderboard" 
            element={<LeaderboardPage />} 
          />
          <Route 
            path="/dashboard" 
            element={<DashboardPage user={user} onLogout={handleLogout} />} 
          />
          <Route path="/" element={<Navigate to="/game" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
