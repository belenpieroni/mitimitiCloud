const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/db');

describe('GET /health', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('responde 200 cuando la API y PostgreSQL están disponibles', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
    // El ALB no debe recibir respuestas cacheadas.
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('responde 503 cuando la base no responde, para que el ALB saque la réplica', async () => {
    jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('conexión rechazada'));
    // El backend loguea la falla: la capturamos para verificarla y no ensuciar la salida.
    const logError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', db: 'disconnected' });
    expect(logError).toHaveBeenCalledWith('[health] Base de datos no disponible:', 'conexión rechazada');
  });
});
