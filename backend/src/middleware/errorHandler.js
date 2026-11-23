function errorHandler(err, req, res, next) {
  const log = req.log || require('pino')({ level: 'error' });
  log.error({ err: err.message, route: req.originalUrl }, 'Unhandled error');
  const status = err.status || 500;
  res.status(status).json({ ok: false, error: err.message || 'Error interno del servidor' });
}

function notFound(req, res) {
  res.status(404).json({ ok: false, error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFound };