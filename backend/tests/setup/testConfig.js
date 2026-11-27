const os = require('os');
const path = require('path');

/**
 * Valores por defecto del entorno de pruebas. Solo se usan si la variable no viene
 * definida: en CI el workflow ya inyecta DB_HOST, DB_NAME, etc.
 *
 * En local apuntan al PostgreSQL de docker compose (puerto 5433), pero a una base
 * separada (mitimiti_test) para no tocar los datos de desarrollo.
 */
const DEFAULTS = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DOTENV_CONFIG_QUIET: 'true',
  JWT_SECRET: 'jwt_secret_solo_para_tests',
  DB_HOST: 'localhost',
  DB_PORT: '5433',
  DB_NAME: 'mitimiti_test',
  DB_USER: 'mitimiti',
  DB_PASSWORD: 'mitimiti_dev',
  UPLOADS_DIR: path.join(os.tmpdir(), 'mitimiti-test-uploads'),
  // AWS ficticio: firmar URLs prefirmadas no llama a AWS y Textract se simula en los tests,
  // así que la suite nunca toca una cuenta real.
  AWS_REGION: 'us-east-1',
  AWS_BUCKET_NAME: 'mitimiti-tickets-test',
  AWS_ACCESS_KEY_ID: 'AKIATESTFICTICIO',
  AWS_SECRET_ACCESS_KEY: 'clave-ficticia-solo-tests',
};

function aplicarDefaults() {
  for (const [clave, valor] of Object.entries(DEFAULTS)) {
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }
}

module.exports = { aplicarDefaults };
