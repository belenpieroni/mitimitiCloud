const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// ─── 1. Configuración de SSL para RDS ─────────────────────────────────────────
//
// En ECS Fargate contra RDS (o cuando DB_SSL='true' o en producción):
// conectamos con SSL cifrado. rejectUnauthorized: false permite validar
// el certificado TLS de AWS RDS sin necesidad de inyectar el bundle .pem local.
// En desarrollo local (Docker/localhost), permanece desactivado si DB_SSL no es 'true'.
//
const useSSL =
  process.env.DB_SSL === 'true' ||
  (process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false');

// ─── 2. Configuración del Pool de Conexiones ──────────────────────────────────
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'mitimiti',
  user: process.env.DB_USER || 'mitimiti',
  password: process.env.DB_PASSWORD || 'mitimiti_dev',

  // max: 15 conexiones simultáneas por réplica Fargate.
  // Con 4 tareas en pico de autoscaling: 4 * 15 = 60 conexiones,
  // dentro del margen seguro del límite de ~110 de db.t4g.micro.
  max: 15,

  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,

  // Inyección condicional de SSL
  ...(useSSL && { ssl: { rejectUnauthorized: false } }),
};

const pool = new Pool(poolConfig);

async function inicializarDB() {
  const schemaPath = path.join(__dirname, 'migrations', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  let retries = 12;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      try {
        // En AWS el esquema lo aplica la Lambda one-off (DbMigrationStack),
        // así las réplicas de ECS no compiten por crear las tablas.
        if (process.env.DB_RUN_MIGRATIONS === 'false') {
          console.log('✓ Conectado a PostgreSQL (migraciones desactivadas)');
          return;
        }
        await client.query(schema);
        console.log('✓ Base de datos inicializada correctamente');
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      retries--;
      if (retries === 0) {
        console.error('✗ No se pudo conectar a PostgreSQL:', err.message);
        throw err;
      }
      console.log(`⏳ Esperando PostgreSQL... (${retries} intentos restantes)`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

module.exports = { pool, inicializarDB };