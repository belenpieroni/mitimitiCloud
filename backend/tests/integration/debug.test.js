const request = require('supertest');
const app = require('../../src/app');

const RUTA = '/api/debug/error-500';
const TOKEN = 'token_de_prueba_1234567890abcdef';

// Mismo body que devuelve notFound para cualquier ruta inexistente.
const BODY_NOT_FOUND = { ok: false, error: `Ruta no encontrada: GET ${RUTA}` };

describe('GET /api/debug/error-500', () => {
  const original = process.env.DEBUG_ERROR_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.DEBUG_ERROR_TOKEN;
    else process.env.DEBUG_ERROR_TOKEN = original;
  });

  describe('sin DEBUG_ERROR_TOKEN definida', () => {
    beforeEach(() => {
      delete process.env.DEBUG_ERROR_TOKEN;
    });

    it('responde 404 igual que una ruta inexistente, aunque se mande un token', async () => {
      const res = await request(app).get(RUTA).set('x-debug-token', TOKEN);

      expect(res.status).toBe(404);
      expect(res.body).toEqual(BODY_NOT_FOUND);
    });
  });

  describe('con DEBUG_ERROR_TOKEN definida', () => {
    beforeEach(() => {
      process.env.DEBUG_ERROR_TOKEN = TOKEN;
    });

    it('responde 404 si no se manda el header', async () => {
      const res = await request(app).get(RUTA);

      expect(res.status).toBe(404);
      expect(res.body).toEqual(BODY_NOT_FOUND);
    });

    it('responde 404 con un token incorrecto del mismo largo', async () => {
      const incorrecto = 'x'.repeat(TOKEN.length);
      const res = await request(app).get(RUTA).set('x-debug-token', incorrecto);

      expect(res.status).toBe(404);
      expect(res.body).toEqual(BODY_NOT_FOUND);
    });

    it('responde 404 con un token incorrecto de distinto largo', async () => {
      const res = await request(app).get(RUTA).set('x-debug-token', 'corto');

      expect(res.status).toBe(404);
      expect(res.body).toEqual(BODY_NOT_FOUND);
    });

    it('responde 500 con token válido y conserva el requestId', async () => {
      const res = await request(app)
        .get(RUTA)
        .set('x-debug-token', TOKEN)
        .set('x-request-id', 'demo-request-id');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ ok: false, error: '[debug] Error 500 simulado' });
      expect(res.headers['x-request-id']).toBe('demo-request-id');
    });
  });
});
