import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function DashboardPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [prizes, setPrizes] = useState([]);
  const [stats, setStats] = useState({ totalRaces: 0, bestTime: null, prizesWon: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    
    // Fetch user prizes
    axios.get(`${API_URL}/prizes/my-prizes`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        setPrizes(res.data.prizes);
        setStats(prev => ({ ...prev, prizesWon: res.data.unclaimed }));
      })
      .catch(err => console.error('Error fetching prizes:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1>🏎️ Welcome, {user?.username}!</h1>
          <p style={{ color: '#666', marginTop: '5px' }}>Ready to race?</p>
        </div>
        <button className="logout-btn" onClick={handleLogout}>Logout</button>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h2>🎮 Play Game</h2>
          <p>Test your racing skills and compete on the leaderboard</p>
          <button className="play-btn" onClick={() => navigate('/game')}>
            Start Racing
          </button>
        </div>

        <div className="card">
          <h2>🏆 Leaderboard</h2>
          <p>Check out the top racers and your rankings</p>
          <button className="view-btn" onClick={() => navigate('/leaderboard')}>
            View Leaderboard
          </button>
        </div>

        <div className="card">
          <h2>🎁 My Prizes</h2>
          <div className="card-stat">{stats.prizesWon}</div>
          <p>Unclaimed prizes waiting for you!</p>
          {stats.prizesWon > 0 && (
            <div style={{ marginTop: '15px', padding: '10px', background: '#fffbcc', borderRadius: '6px' }}>
              {prizes.filter(p => !p.claimed).map(prize => (
                <div key={prize.id} style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                  🎟️ {prize.prize_code}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ maxWidth: '600px' }}>
        <h2>📊 Quick Stats</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <p style={{ fontSize: '12px', color: '#999' }}>Total Races</p>
            <div className="card-stat" style={{ fontSize: '24px' }}>{stats.totalRaces}</div>
          </div>
          <div>
            <p style={{ fontSize: '12px', color: '#999' }}>Prizes Won</p>
            <div className="card-stat" style={{ fontSize: '24px' }}>{stats.prizesWon}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
