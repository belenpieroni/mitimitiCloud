/**
 * Configuración de Jest para las pruebas de integración del backend.
 *
 * Los tests levantan la app con Supertest (sin abrir el puerto) y pegan contra
 * un PostgreSQL real: el del servicio "postgres" en CI, o el de docker compose en local.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],

  // Variables de entorno por defecto (antes de cargar la app).
  setupFiles: ['<rootDir>/tests/setup/env.js'],
  // Cierra el pool de PostgreSQL al terminar cada archivo para que Jest no quede colgado.
  setupFilesAfterEnv: ['<rootDir>/tests/setup/afterEnv.js'],
  // Crea la base de pruebas (si hace falta) y aplica schema.sql una sola vez.
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',

  // pdfjs-dist v4 se distribuye solo como ESM y Jest no puede cargarlo con require.
  // Ningún test parsea PDFs, así que lo reemplazamos por un stub.
  moduleNameMapper: {
    '^pdfjs-dist$': '<rootDir>/tests/mocks/pdfjs-dist.js',
  },

  testTimeout: 15000,
};
