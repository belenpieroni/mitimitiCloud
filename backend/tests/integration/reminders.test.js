const path = require('path');
const { spawnSync } = require('child_process');
const { randomUUID } = require('crypto');
const { pool } = require('../../src/db');
const { main } = require('../../src/jobs/reminders');

const SCRIPT = path.join(__dirname, '../../src/jobs/reminders.js');

// Fecha local en formato YYYY-MM-DD dentro de `dias` días (el cron compara contra la fecha local).
function fechaEnDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function correrScript(envExtra = {}) {
  return spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, ...envExtra },
    encoding: 'utf8',
    timeout: 30000,
  });
}

describe('Job de recordatorios (src/jobs/reminders.js)', () => {
  const usuarioId = randomUUID();
  const nombre = `Recordatorio ${usuarioId.slice(0, 8)}`;
  const servicioId = randomUUID();

  beforeAll(async () => {
    const viviendaId = randomUUID();
    await pool.query(
      `INSERT INTO usuarios (id, name, email, password) VALUES ($1, $2, $3, 'x')`,
      [usuarioId, nombre, `${usuarioId}@test.local`]
    );
    await pool.query(
      `INSERT INTO viviendas (id, nombre, creador_id) VALUES ($1, 'Casa test', $2)`,
      [viviendaId, usuarioId]
    );
    // Servicio que vence en 3 días: dispara el primer aviso previo.
    await pool.query(
      `INSERT INTO vivienda_servicios (id, vivienda_id, nombre, monto, periodicidad, proximo_vencimiento, participantes)
       VALUES ($1, $2, 'Luz', 1000, 'mensual', $3, $4)`,
      [servicioId, viviendaId, fechaEnDias(3), [nombre]]
    );
  });

  const contarAvisos = async () => {
    const { rows: [r] } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM notificaciones_usuario
       WHERE usuario_id = $1 AND categoria = 'recordatorios_vencimiento'`,
      [usuarioId]
    );
    return r.c;
  };

  it('genera el recordatorio de un servicio que vence en 3 días', async () => {
    await main();

    expect(await contarAvisos()).toBe(1);
    const { rowCount } = await pool.query(
      'SELECT 1 FROM notificacion_recordatorios_enviados WHERE servicio_id = $1',
      [servicioId]
    );
    expect(rowCount).toBe(1);
  });

  it('no duplica el aviso si el job corre dos veces el mismo día', async () => {
    await main();

    expect(await contarAvisos()).toBe(1);
  });

  it('como script independiente termina con código 0', () => {
    const resultado = correrScript();

    expect(resultado.status).toBe(0);
  });

  it('como script termina con código 1 si la base no está disponible', () => {
    const resultado = correrScript({ DB_HOST: '127.0.0.1', DB_PORT: '1' });

    expect(resultado.status).toBe(1);
  });
});
