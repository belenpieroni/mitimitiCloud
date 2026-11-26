const request = require('supertest');
const app = require('../../src/app');
const { TextractClient, AnalyzeExpenseCommand } = require('@aws-sdk/client-textract');
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

describe('POST /api/vivienda/tickets/analizar', () => {
  const RUTA = '/api/vivienda/tickets/analizar';
  let usuario;
  let textract;

  // Respuesta de AnalyzeExpense con el total en formato argentino y la fecha del ticket.
  const RESPUESTA_TEXTRACT = {
    ExpenseDocuments: [
      {
        SummaryFields: [
          { Type: { Text: 'INVOICE_RECEIPT_DATE' }, ValueDetection: { Text: '25/11/2026' } },
          { Type: { Text: 'TOTAL' }, ValueDetection: { Text: '$ 46.469,43' } },
        ],
      },
    ],
  };

  beforeAll(async () => {
    usuario = await crearUsuarioLogueado('Analizar');
  });

  beforeEach(() => {
    // Simulamos Textract: los tests no llaman a AWS.
    textract = jest.spyOn(TextractClient.prototype, 'send').mockResolvedValue(RESPUESTA_TEXTRACT);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const keyPropia = (nombre = 'ticket.jpeg') => `tickets/${usuario.id}/${nombre}`;

  it('analiza el ticket con AnalyzeExpense y devuelve total y fecha', async () => {
    const res = await request(app).post(RUTA).set(auth(usuario)).send({ key: keyPropia() });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { total: 46469.43, fecha: '2026-11-25' } });

    const comando = textract.mock.calls[0][0];
    expect(comando).toBeInstanceOf(AnalyzeExpenseCommand);
    expect(comando.input).toEqual({
      Document: { S3Object: { Bucket: process.env.AWS_BUCKET_NAME, Name: keyPropia() } },
    });
  });

  it('acepta la key que devuelve upload-uri (flujo subir → analizar)', async () => {
    const subida = await request(app)
      .post('/api/vivienda/tickets/upload-uri')
      .set(auth(usuario))
      .send({ contentType: 'image/png' });

    const res = await request(app).post(RUTA).set(auth(usuario)).send({ key: subida.body.data.key });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(46469.43);
  });

  it('si Textract falla, responde 200 con total null para permitir la carga manual', async () => {
    textract.mockRejectedValueOnce(new Error('InvalidS3ObjectException'));

    const res = await request(app).post(RUTA).set(auth(usuario)).send({ key: keyPropia() });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { total: null, fecha: null } });
  });

  it('responde 403 con el ticket de otro usuario, sin llamar a Textract', async () => {
    const otro = await crearUsuarioLogueado('Otro analizar');

    const res = await request(app)
      .post(RUTA)
      .set(auth(usuario))
      .send({ key: `tickets/${otro.id}/privado.jpeg` });

    expect(res.status).toBe(403);
    expect(textract).not.toHaveBeenCalled();
  });

  it.each([
    ['fuera de tickets/', 'otra-carpeta/ticket.jpeg'],
    ['con ../', () => `tickets/${usuario.id}/../x/ticket.jpeg`],
    ['con subcarpetas', () => keyPropia('carpeta/ticket.jpeg')],
    ['con extensión no permitida', () => keyPropia('ticket.pdf')],
  ])('responde 400 con una key %s, sin llamar a Textract', async (_caso, key) => {
    const res = await request(app)
      .post(RUTA)
      .set(auth(usuario))
      .send({ key: typeof key === 'function' ? key() : key });

    expect(res.status).toBe(400);
    expect(textract).not.toHaveBeenCalled();
  });

  it('responde 400 si falta la key', async () => {
    const res = await request(app).post(RUTA).set(auth(usuario)).send({});

    expect(res.status).toBe(400);
  });

  it('responde 401 sin token', async () => {
    const res = await request(app).post(RUTA).send({ key: keyPropia() });

    expect(res.status).toBe(401);
  });
});
