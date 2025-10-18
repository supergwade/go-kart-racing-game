const { getDatabase } = require('../config/database');

const getPrizes = (req, res) => {
  const userId = req.user.id;
  const db = getDatabase();

  db.all(
    `SELECT id, prize_code, prize_type, claimed, created_at, claimed_at 
     FROM prizes 
     WHERE user_id = ? 
     ORDER BY created_at DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      const unclaimed = (rows || []).filter(p => !p.claimed);
      const claimed = (rows || []).filter(p => p.claimed);

      res.json({
        prizes: rows || [],
        unclaimed: unclaimed.length,
        claimed: claimed.length,
        total: (rows || []).length
      });
    }
  );
};

const redeemPrize = (req, res) => {
  const userId = req.user.id;
  const prizeId = req.params.prizeId;
  const db = getDatabase();

  // Verify prize belongs to user
  db.get(
    'SELECT * FROM prizes WHERE id = ? AND user_id = ?',
    [prizeId, userId],
    (err, prize) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!prize) {
        return res.status(404).json({ error: 'Prize not found' });
      }

      if (prize.claimed) {
        return res.status(400).json({ error: 'Prize already claimed' });
      }

      // Mark as claimed
      db.run(
        'UPDATE prizes SET claimed = 1, claimed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [prizeId],
        (err) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to redeem prize' });
          }

          res.json({
            message: 'Prize redeemed successfully',
            prizeCode: prize.prize_code,
            prizeType: prize.prize_type
          });
        }
      );
    }
  );
};

module.exports = {
  getPrizes,
  redeemPrize
};
