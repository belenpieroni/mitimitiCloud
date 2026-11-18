const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// El health check del ALB corta a los 5 s. Si la base no contesta antes de esto,
// respondemos 503 nosotros en vez de dejar que el ALB lo cuente como timeout.
const DB_TIMEOUT_MS = parseInt(process.env.HEALTH_DB_TIMEOUT_MS || '3000', 10);

function conTimeout(promesa, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`La base no respondió en ${ms} ms`)), ms);
  });
  return Promise.race([promesa, timeout]).finally(() => clearTimeout(timer));
}

/**
 * GET /health
 * Lo consulta el ALB para decidir si manda tráfico a esta réplica.
 *  - 200 { status: 'ok', db: 'connected' }     si Express y PostgreSQL responden
 *  - 503 { status: 'error', db: 'disconnected' } si la base no responde
 */
router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await conTimeout(pool.query('SELECT 1'), DB_TIMEOUT_MS);
    res.status(200).json({ status: 'ok', db: 'connected' });
  } catch (err) {
    console.error('[health] Base de datos no disponible:', err.message);
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

module.exports = router;
