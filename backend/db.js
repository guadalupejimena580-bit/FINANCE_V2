'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

// Pool de conexiones (más robusto que una sola conexión)
const pool = mysql.createPool({
  host              : process.env.DB_HOST     || '127.0.0.1',
  port              : parseInt(process.env.DB_PORT || '3306', 10),
  user              : process.env.DB_USER     || 'root',
  password          : process.env.DB_PASS     || '',
  database          : process.env.DB_NAME     || 'finance_db',
  charset           : 'utf8mb4',
  waitForConnections: true,
  connectionLimit   : 10,
  queueLimit        : 0,
  timezone          : 'local',
  // Reconectar automáticamente en caso de caída
  enableKeepAlive   : true,
  keepAliveInitialDelay: 10000,
});

// Verificar conexión al iniciar
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL conectado correctamente —', process.env.DB_NAME);
    conn.release();
  } catch (err) {
    console.error('❌ Error conectando MySQL:', err.message);
    process.exit(1);
  }
})();

module.exports = pool;