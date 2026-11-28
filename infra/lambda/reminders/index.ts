import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

interface DbSecret {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

interface RemindersResult {
  ok: boolean;
  durationMs: number;
}

/** Lo que usamos de los módulos del backend (CommonJS, se bundlean con esbuild). */
interface BackendModules {
  pool: { query: (sql: string) => Promise<unknown> };
  logger: {
    info: (obj: object, msg: string) => void;
    error: (obj: object, msg: string) => void;
  };
  ejecutarRecordatorios: () => Promise<void>;
}

const secrets = new SecretsManagerClient({});

let backend: BackendModules | undefined;

async function getDbSecret(): Promise<DbSecret> {
  const secretId = process.env.DB_SECRET_ARN;
  if (!secretId) throw new Error('Falta la variable DB_SECRET_ARN');
  const res = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!res.SecretString) throw new Error('El secreto de la base no tiene SecretString');
  return JSON.parse(res.SecretString) as DbSecret;
}

/**
 * Carga los módulos del backend una sola vez por contenedor de Lambda.
 *
 * backend/src/db.js crea el pool al cargarse y lee las variables DB_* en ese momento,
 * así que primero las armamos con el secreto mitimiti/db y recién después hacemos el
 * require. Si la Lambda reutiliza el contenedor, el pool (DB_POOL_MAX conexiones) se reutiliza.
 */
async function cargarBackend(): Promise<BackendModules> {
  if (backend) return backend;

  const db = await getDbSecret();
  process.env.DB_HOST = db.host;
  process.env.DB_PORT = String(db.port);
  process.env.DB_NAME = db.dbname;
  process.env.DB_USER = db.username;
  process.env.DB_PASSWORD = db.password;
  // RDS PostgreSQL 16 exige SSL (rds.force_ssl = 1).
  process.env.DB_SSL = 'true';

  // require (y no import) para que se ejecute recién acá, con el entorno ya armado.
  const { pool } = require('../../../backend/src/db');
  const { logger } = require('../../../backend/src/middleware/logger');
  const { ejecutarRecordatorios } = require('../../../backend/src/services/cronService');

  backend = { pool, logger, ejecutarRecordatorios };
  return backend;
}

/**
 * Job de recordatorios: hace una pasada (servicios variables, vencimientos y gastos
 * pendientes) y termina. Lo invoca EventBridge cada 48 hs (RemindersStack).
 *
 * Es la misma lógica que backend/src/jobs/reminders.js, que queda para correrlo en local.
 * Para probarlo a mano en AWS:
 *   aws lambda invoke --function-name mitimiti-reminders out.json
 */
export const handler = async (): Promise<RemindersResult> => {
  const inicio = Date.now();
  const { pool, logger, ejecutarRecordatorios } = await cargarBackend();
  logger.info({}, '[reminders] Iniciando job de recordatorios');

  try {
    // Los chequeos de cronService atrapan sus propios errores; sin esta verificación,
    // la invocación terminaría bien aunque la base no esté disponible.
    await pool.query('SELECT 1');
    await ejecutarRecordatorios();
  } catch (err) {
    logger.error({ err }, '[reminders] El job de recordatorios falló');
    throw err;
  }

  const durationMs = Date.now() - inicio;
  logger.info({ durationMs }, '[reminders] Job de recordatorios finalizado');
  return { ok: true, durationMs };
};
