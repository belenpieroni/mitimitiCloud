const pino = require('pino');
const { v4: uuidv4 } = require('uuid');

// 1. Instancia de Pino con redacción de datos sensibles y level en texto
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: [
    'req.headers.authorization',
    'req.body.password',
    'req.body.token',
    'req.body.cbu',
  ],
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// 2. Middleware de Express
function requestLogger(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const requestId =
    typeof incomingId === 'string' && incomingId.trim() !== ''
      ? incomingId.trim()
      : uuidv4();

  req.id = requestId;
  res.setHeader('x-request-id', requestId);

  // No loguear el health check
  if (req.path === '/health') {
    req.log = logger;
    return next();
  }

  const startTime = Date.now();

  // Logger hijo disponible para otros middlewares/controladores
  req.log = logger.child({ requestId });

  res.on('finish', () => {
    const logData = {
      route: req.originalUrl.split('?')[0],
      method: req.method,
      statusCode: res.statusCode,
      responseTime: Date.now() - startTime,
      userId: req.user?.id ?? null,
    };

    if (res.statusCode >= 500) {
      req.log.error(logData, 'Request failed');
    } else if (res.statusCode >= 400) {
      req.log.warn(logData, 'Client error');
    } else {
      req.log.info(logData, 'Request completed');
    }
  });

  next();
}

module.exports = { logger, requestLogger };