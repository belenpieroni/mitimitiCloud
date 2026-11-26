require('dotenv').config();

const { pool } = require('../db');
const { logger } = require('../middleware/logger');
const { ejecutarRecordatorios } = require('../services/cronService');

/**
 * Job de recordatorios: hace una pasada y termina.
 *
 * Corre fuera del servidor API para que, con varias réplicas en ECS, los avisos se
 * envíen una sola vez. En AWS lo dispara una tarea programada; en local se puede
 * ejecutar a mano con:  npm run job:reminders
 */
async function main() {
  const inicio = Date.now();
  logger.info('[reminders] Iniciando job de recordatorios');

  // Los chequeos de cronService atrapan sus propios errores; sin esta verificación,
  // el job terminaría con código 0 aunque la base no esté disponible.
  await pool.query('SELECT 1');

  await ejecutarRecordatorios();

  logger.info({ durationMs: Date.now() - inicio }, '[reminders] Job de recordatorios finalizado');
}

if (require.main === module) {
  main()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error({ err }, '[reminders] El job de recordatorios falló');
      await pool.end().catch(() => {});
      process.exit(1);
    });
}

module.exports = { main };
