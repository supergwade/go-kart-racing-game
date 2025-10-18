import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function LeaderboardPage() {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_URL}/leaderboard/top?limit=100`)
      .then(res => {
        setLeaderboard(res.data.leaderboard);
      })
      .catch(err => console.error('Error fetching leaderboard:', err))
      .finally(() => setLoading(false));
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins}:${secs.padStart(5, '0')}`;
  };

  const getRankClass = (index) => {
    if (index === 0) return 'rank-1';
    if (index === 1) return 'rank-2';
    if (index === 2) return 'rank-3';
    return '';
  };

  return (
    <div className="leaderboard-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1>🏆 Leaderboard</h1>
        <button className="view-btn" onClick={() => navigate('/dashboard')} style={{ maxWidth: '150px' }}>
          Back to Dashboard
        </button>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#666' }}>Loading leaderboard...</p>
      ) : leaderboard.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#666' }}>No scores yet. Be the first to race!</p>
      ) : (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Racer</th>
              <th>Best Time</th>
              <th>Track</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry, index) => (
              <tr key={entry.id} className={getRankClass(index)}>
                <td style={{ fontWeight: 'bold', fontSize: '18px' }}>
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </td>
                <td>{entry.username}</td>
                <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                  {formatTime(entry.lap_time)}
                </td>
                <td>{entry.track_name}</td>
                <td>{new Date(entry.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default LeaderboardPage;
