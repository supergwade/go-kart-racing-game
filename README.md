# 🏎️ Go-Kart Racing Game

A full-stack 3D arcade racing game web application with real-time leaderboards and prize rewards system.

## Features

✅ **3D Arcade Racing Game** - Built with Three.js for smooth, arcade-style gameplay
✅ **User Authentication** - Register and login system with JWT tokens
✅ **Real-time Leaderboard** - Compete globally and track your best times
✅ **Prize System** - Automatically generated reward codes for top performers
✅ **Responsive Design** - Works on desktop and mobile devices
✅ **Dashboard** - Track your stats, prizes, and racing history

## Tech Stack

**Frontend:**
- React 18
- Three.js (3D Graphics)
- React Router (Navigation)
- Axios (API Communication)
- CSS3 (Responsive Styling)

**Backend:**
- Node.js + Express
- SQLite (Database)
- JWT (Authentication)
- bcryptjs (Password Hashing)

## Project Structure

```
go-kart-racing-game/
├── backend/
│   ├── config/
│   │   └── database.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── leaderboardController.js
│   │   └── prizeController.js
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── leaderboard.js
│   │   └── prizes.js
│   ├── .env
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LoginPage.js
│   │   │   ├── RegisterPage.js
│   │   │   ├── GamePage.js
│   │   │   ├── LeaderboardPage.js
│   │   │   └── DashboardPage.js
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── index.js
│   │   └── package.json
└── database/
    └── gokart.db (created on first run)
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Clone/Extract the project**
```bash
cd go-kart-racing-game
```

2. **Install Backend Dependencies**
```bash
cd backend
npm install
```

3. **Install Frontend Dependencies**
```bash
cd ../frontend
npm install
```

### Running the Application

**Terminal 1 - Start Backend Server:**
```bash
cd backend
npm run dev
```
Backend will run on `http://localhost:5000`

**Terminal 2 - Start Frontend Development Server:**
```bash
cd frontend
npm start
```
Frontend will open on `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Users
- `GET /api/users/profile` - Get user profile (auth required)
- `PUT /api/users/profile` - Update user profile (auth required)

### Leaderboard
- `POST /api/leaderboard/submit` - Submit race score (auth required)
- `GET /api/leaderboard/top` - Get top scores
- `GET /api/leaderboard/user/:userId` - Get user's scores

### Prizes
- `GET /api/prizes/my-prizes` - Get user's prizes (auth required)
- `POST /api/prizes/redeem/:prizeId` - Redeem a prize (auth required)

## Game Controls

| Key | Action |
|-----|--------|
| **SPACE** | Start Race |
| **↑ / W** | Accelerate |
| **↓ / S** | Brake |
| **← / A** | Turn Left |
| **→ / D** | Turn Right |

## Game Mechanics

1. **Start the Race**: Press SPACE to begin
2. **Navigate Track**: Use arrow keys or WASD to control your kart
3. **Complete Lap**: Cross the finish line to submit your time
4. **Leaderboard**: Your time is automatically added to the global leaderboard
5. **Win Prizes**: Top 10 racers automatically receive prize codes (free rides, etc.)

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at DATETIME,
  updated_at DATETIME
)
```

### Leaderboard Table
```sql
CREATE TABLE leaderboard (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lap_time REAL NOT NULL,
  track_name TEXT,
  created_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
)
```

### Prizes Table
```sql
CREATE TABLE prizes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  prize_code TEXT UNIQUE NOT NULL,
  prize_type TEXT,
  claimed BOOLEAN,
  created_at DATETIME,
  claimed_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id)
)
```

## Future Enhancements

🚀 **Multiplayer Real-time Racing** - Race against other players simultaneously
🚀 **Track Selection** - Multiple different tracks
🚀 **Kart Customization** - Choose different karts with various stats
🚀 **Achievements & Badges** - Unlock special badges for achievements
🚀 **Mobile App** - Native iOS/Android application
🚀 **Social Features** - Add friends, challenges, and tournaments
🚀 **Power-ups** - Speed boosts, slow-motion, and other in-game effects
🚀 **Advanced Physics** - More realistic collision and driving mechanics

## Environment Variables

**.env (Backend)**
```
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-change-in-production-12345
DATABASE_PATH=./database/gokart.db
```

## Troubleshooting

**Port Already in Use**
```bash
# Change port in backend/.env
PORT=5001
```

**Database Errors**
```bash
# Delete and recreate database
rm database/gokart.db
npm run dev  # in backend folder
```

**CORS Issues**
- Make sure backend is running on port 5000
- Frontend will automatically use http://localhost:5000/api

## License

MIT License - Feel free to use this project for your go-kart company!

## Support

For questions or issues, please check the troubleshooting section or create an issue in the repository.

---

**Happy Racing! 🏁**
