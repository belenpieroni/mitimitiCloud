const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { aplicarDefaults } = require('./testConfig');

function conexion(database) {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
  };
}

/**
 * Corre una sola vez antes de toda la suite:
 *  1. Crea la base de pruebas si no existe (en local).
 *  2. Aplica schema.sql, que es idempotente (CREATE TABLE IF NOT EXISTS).
 */
module.exports = async () => {
  aplicarDefaults();
  const dbName = process.env.DB_NAME;

  // Los tests insertan datos: fuera de CI, exigimos una base cuyo nombre diga "test"
  // para no escribir por error en la base de desarrollo.
  if (!process.env.CI && !/test/i.test(dbName)) {
    throw new Error(
      `DB_NAME="${dbName}" no parece una base de pruebas. Usá una base con "test" en el nombre.`
    );
  }

  const admin = new Client(conexion('postgres'));
  try {
    await admin.connect();
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
    }
  } catch (err) {
    throw new Error(
      `No se pudo conectar a PostgreSQL en ${process.env.DB_HOST}:${process.env.DB_PORT}. ` +
        `¿Está levantado? (docker compose up -d db). Detalle: ${err.message}`
    );
  } finally {
    await admin.end().catch(() => {});
  }

  const schema = fs.readFileSync(path.join(__dirname, '../../src/migrations/schema.sql'), 'utf8');
  const client = new Client(conexion(dbName));
  await client.connect();
  try {
    await client.query(schema);
  } finally {
    await client.end();
  }
};
