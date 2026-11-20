const { pool } = require('./db');

/**
 * Apagado prolijo para ECS: en cada deploy o scale-in, ECS manda SIGTERM y espera
 * hasta 30 s antes de matar el contenedor. Dejamos de aceptar conexiones nuevas,
 * terminamos las que están en curso y cerramos el pool de PostgreSQL.
 */
function registrarApagado(server) {
  let apagando = false;

  const apagar = (senal) => {
    if (apagando) return;
    apagando = true;
    console.log(`[shutdown] ${senal} recibido, cerrando servidor...`);

    // Si algo queda colgado, salimos igual antes de que ECS mande SIGKILL.
    setTimeout(() => process.exit(1), 25000).unref();

    server.close(async () => {
      try {
        await pool.end();
      } catch (err) {
        console.error('[shutdown] Error cerrando el pool:', err.message);
      }
      console.log('[shutdown] Listo');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
}

module.exports = { registrarApagado };
