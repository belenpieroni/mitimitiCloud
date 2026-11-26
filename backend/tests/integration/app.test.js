const request = require('supertest');
const app = require('../../src/app');

describe('Runner de pruebas de integración', () => {
  it('importa la app sin levantar el servidor y responde en la raíz', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('devuelve 404 con el formato de error de la API para rutas inexistentes', async () => {
    const res = await request(app).get('/ruta-que-no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, error: expect.stringContaining('/ruta-que-no-existe') });
  });
});
