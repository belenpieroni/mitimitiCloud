const path = require('path');
const { spawnSync } = require('child_process');
const { randomUUID } = require('crypto');
const { pool } = require('../../src/db');
const { main } = require('../../src/jobs/reminders');
const { fechaHoy, getDiffDays } = require('../../src/services/cronService');

const SCRIPT = path.join(__dirname, '../../src/jobs/reminders.js');

// Fecha en Argentina (YYYY-MM-DD) dentro de `dias` días: el job compara contra la fecha de
// Argentina, no contra la del proceso (en CI el runner corre en UTC).
function fechaEnDias(dias) {
  return fechaHoy(new Date(Date.now() + dias * 24 * 60 * 60 * 1000));
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

describe('Fechas de los recordatorios (zona horaria de Argentina)', () => {
  // 28/11 a las 23:30 en Argentina = 29/11 02:30 UTC: en un proceso en UTC (Lambda, Fargate)
  // "hoy" ya sería 29/11 si se usara la fecha local del proceso.
  const nocheEnArgentina = new Date('2026-11-29T02:30:00Z');

  it('toma la fecha de hoy en Argentina, no la del proceso', () => {
    expect(fechaHoy(nocheEnArgentina)).toBe('2026-11-28');
  });

  it('calcula "vence en 3 días" con la fecha de Argentina', () => {
    expect(getDiffDays('2026-12-01', nocheEnArgentina)).toBe(3);
    expect(getDiffDays('2026-11-28', nocheEnArgentina)).toBe(0);
    expect(getDiffDays('2026-11-25', nocheEnArgentina)).toBe(-3);
  });

  it('acepta un timestamp que empieza con la fecha', () => {
    expect(getDiffDays('2026-12-01T00:00:00.000Z', nocheEnArgentina)).toBe(3);
  });
});
