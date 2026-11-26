const request = require('supertest');
const app = require('../../src/app');
const { crearUsuarioLogueado } = require('../helpers/usuarios');

const auth = (usuario) => ({ Authorization: `Bearer ${usuario.token}` });

describe('POST /api/vivienda/tickets/upload-uri', () => {
  const RUTA = '/api/vivienda/tickets/upload-uri';
  let usuario;

  beforeAll(async () => {
    usuario = await crearUsuarioLogueado('Tickets');
  });

  it('devuelve una URL prefirmada de S3 para subir el ticket con PUT', async () => {
    const res = await request(app).post(RUTA).set(auth(usuario)).send({ contentType: 'image/jpeg', fileSize: 500000 });

    expect(res.status).toBe(200);
    const { uploadUrl, key, expiresIn } = res.body.data;

    // La key queda dentro de la carpeta del usuario y no se repite entre subidas.
    expect(key).toMatch(new RegExp(`^tickets/${usuario.id}/\\d+-[0-9a-f-]{36}\\.jpeg$`));
    expect(expiresIn).toBe(300);

    const url = new URL(uploadUrl);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe(`${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com`);
    expect(decodeURIComponent(url.pathname)).toBe(`/${key}`);
    expect(url.searchParams.get('x-id')).toBe('PutObject');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('genera una key distinta en cada pedido', async () => {
    const pedir = () => request(app).post(RUTA).set(auth(usuario)).send({ contentType: 'image/png' });

    const [a, b] = await Promise.all([pedir(), pedir()]);

    expect(a.body.data.key).not.toBe(b.body.data.key);
  });

  it('responde 400 si falta el contentType', async () => {
    const res = await request(app).post(RUTA).set(auth(usuario)).send({});

    expect(res.status).toBe(400);
  });

  it('responde 400 con un tipo de archivo no permitido', async () => {
    const res = await request(app).post(RUTA).set(auth(usuario)).send({ contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no permitido/);
  });

  it('responde 400 si el archivo supera los 10 MB', async () => {
    const res = await request(app)
      .post(RUTA)
      .set(auth(usuario))
      .send({ contentType: 'image/png', fileSize: 11 * 1024 * 1024 });

    expect(res.status).toBe(400);
  });

  it('responde 401 sin token', async () => {
    const res = await request(app).post(RUTA).send({ contentType: 'image/jpeg' });

    expect(res.status).toBe(401);
  });
});
