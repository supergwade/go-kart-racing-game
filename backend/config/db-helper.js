// Database wrapper that works with both SQLite and PostgreSQL
const isPostgres = !!process.env.DATABASE_URL;

let pool, sqliteDb;

if (isPostgres) {
  const { pool: pgPool } = require('./database-postgres');
  pool = pgPool;
} else {
  const { getDatabase } = require('./database');
  sqliteDb = getDatabase;
}

// Unified query function
const query = async (sql, params = []) => {
  if (isPostgres) {
    // Convert ? placeholders to $1, $2, etc for PostgreSQL
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const result = await pool.query(pgSql, params);
    return { rows: result.rows, rowCount: result.rowCount };
  } else {
    // SQLite
    const db = sqliteDb();
    return new Promise((resolve, reject) => {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve({ rows, rowCount: rows ? rows.length : 0 });
        });
      } else {
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ rows: [], rowCount: this.changes });
        });
      }
    });
  }
};

// Get single row
const get = async (sql, params = []) => {
  if (isPostgres) {
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    const result = await pool.query(pgSql, params);
    return result.rows[0];
  } else {
    const db = sqliteDb();
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
};

module.exports = {
  query,
  get,
  isPostgres
};
