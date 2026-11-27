const express = require('express');
const crypto = require('crypto');

const router = express.Router();

// Hash fijo de 32 bytes: timingSafeEqual exige buffers del mismo largo
// y así tampoco se filtra el largo del token.
function hash(valor) {
  return crypto.createHash('sha256').update(valor).digest();
}

/**
 * Solo deja pasar si DEBUG_ERROR_TOKEN está definida y el header x-debug-token coincide.
 * En cualquier otro caso responde igual que una ruta inexistente (404 de notFound),
 * para no revelar que el endpoint existe.
 */
function requireDebugToken(req, res, next) {
  const esperado = process.env.DEBUG_ERROR_TOKEN;
  const recibido = req.get('x-debug-token');

  if (!esperado || typeof recibido !== 'string') return next('router');
  if (!crypto.timingSafeEqual(hash(recibido), hash(esperado))) return next('router');

  next();
}

/**
 * GET /api/debug/error-500
 * Falla controlada para la demo de observabilidad: responde 500 a través del
 * errorHandler, que loguea el mensaje con el requestId, y suma en la métrica de 5xx del ALB.
 */
router.get('/error-500', requireDebugToken, (req, res, next) => {
  const err = new Error('[debug] Error 500 simulado');
  err.status = 500;
  err.simulado = true;
  next(err);
});

module.exports = router;
