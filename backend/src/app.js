require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const healthRouter = require('./routes/health');
const juntadasRouter = require('./routes/juntadas');
const perfilesRouter = require('./routes/perfiles');
const deudasRoutes = require('./routes/deudas');
const viviendaRouter = require('./routes/vivienda');
const uploadsRouter = require('./routes/uploads');
const authRouter = require('./routes/auth');
const debugRouter = require('./routes/debug');

const { errorHandler, notFound } = require('./middleware/errorHandler');
const { logger, requestLogger } = require('./middleware/logger');
const { iniciarCronJobs } = require('./services/cronService');
const { inicializarDB } = require('./db');
const { registrarApagado } = require('./shutdown');

const app = express();
const PORT = process.env.PORT || 3000;

app.use('/health', healthRouter);
app.use(cors());
app.use(express.json());
app.use(requestLogger);

const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));

app.get('/', (req, res) => {
  res.json({ ok: true, mensaje: 'Miti Miti API v1 — Módulo Juntadas' });
});

app.use('/api/juntadas', juntadasRouter);
app.use('/api/perfiles', perfilesRouter);
app.use('/api/deudas', deudasRoutes);
app.use('/api/vivienda', viviendaRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/auth', authRouter);
// Falla controlada para la demo de observabilidad. Desactivada si no hay DEBUG_ERROR_TOKEN.
app.use('/api/debug', debugRouter);

app.use(notFound);
app.use(errorHandler);

async function start() {
  app._router.stack.forEach((r) => {
    if (r.name === 'router') console.log('Router registrado:', r.regexp);
  });

  await inicializarDB();
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Miti Miti backend escuchando');
    logger.info('Docs de endpoints disponibles en /api/juntadas');

    // Con varias réplicas, el cron embebido enviaría los avisos una vez por réplica.
    // En ECS se apaga (REMINDERS_CRON_ENABLED=false) y los recordatorios los corre src/jobs/reminders.js.
    if (process.env.REMINDERS_CRON_ENABLED === 'false') {
      logger.info('[cron] Cron embebido desactivado: los recordatorios corren como job independiente');
    } else {
      iniciarCronJobs();
    }
  });
  registrarApagado(server);
}

// Solo levantamos el servidor si se ejecuta directo (node src/app.js).
// Así los tests pueden hacer require('./app') con Supertest sin abrir el puerto ni arrancar el cron.
if (require.main === module) {
  start().catch((err) => {
    logger.error({ err }, '[startup] Error fatal al iniciar el servidor');
    process.exit(1);
  });
}

module.exports = app;
