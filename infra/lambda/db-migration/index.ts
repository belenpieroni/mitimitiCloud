import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

interface DbSecret {
  username: string;
  password: string;
  host: string;
  port: number;
  dbname: string;
}

interface MigrationResult {
  ok: boolean;
  tables: string[];
  durationMs: number;
}

const secrets = new SecretsManagerClient({});

async function getDbSecret(): Promise<DbSecret> {
  const secretId = process.env.DB_SECRET_ARN;
  if (!secretId) throw new Error('Falta la variable DB_SECRET_ARN');
  const res = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!res.SecretString) throw new Error('El secreto de la base no tiene SecretString');
  return JSON.parse(res.SecretString) as DbSecret;
}

/**
 * Migración one-off: aplica backend/src/migrations/schema.sql contra RDS
 * dentro de una transacción y devuelve la lista de tablas (equivalente a \dt).
 *
 * Se ejecuta a mano, una sola vez por cambio de esquema:
 *   aws lambda invoke --function-name mitimiti-db-migration out.json
 */
export const handler = async (): Promise<MigrationResult> => {
  const started = Date.now();
  const db = await getDbSecret();
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

  const client = new Client({
    host: db.host,
    port: Number(db.port),
    user: db.username,
    password: db.password,
    database: db.dbname,
    // RDS PostgreSQL 16 exige SSL (rds.force_ssl = 1).
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');

    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    const tables = rows.map((r) => r.tablename);
    console.log(JSON.stringify({ msg: 'migration applied', tables }));
    return { ok: true, tables, durationMs: Date.now() - started };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(JSON.stringify({ msg: 'migration failed', error: (err as Error).message }));
    throw err;
  } finally {
    await client.end();
  }
};
