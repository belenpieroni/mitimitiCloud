const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const { datosUsuario, crearUsuarioLogueado } = require('../helpers/usuarios');

describe('POST /api/auth/register', () => {
  it('registra un usuario nuevo y responde 201', async () => {
    const datos = datosUsuario('Registro');

    const res = await request(app).post('/api/auth/register').send(datos);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.userId).toEqual(expect.any(String));
  });

  it('rechaza un email ya registrado con 400', async () => {
    const datos = datosUsuario('Duplicado');
    await request(app).post('/api/auth/register').send(datos).expect(201);

    const res = await request(app).post('/api/auth/register').send(datos);

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('rechaza campos faltantes o inválidos con 400', async () => {
    const sinPassword = await request(app).post('/api/auth/register').send({ name: 'Ana', email: 'ana@test.local' });
    const passwordCorta = await request(app)
      .post('/api/auth/register')
      .send({ ...datosUsuario('Corta'), password: '123' });

    expect(sinPassword.status).toBe(400);
    expect(passwordCorta.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  let usuario;

  beforeAll(async () => {
    usuario = datosUsuario('Login');
    await request(app).post('/api/auth/register').send(usuario).expect(201);
  });

  it('responde 200 con un JWT firmado con JWT_SECRET', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: usuario.email, password: usuario.password });

    expect(res.status).toBe(200);
    const { token, user } = res.body.data;
    // jwt.verify falla si la firma no corresponde al secreto de la API.
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ id: user.id, email: usuario.email, name: usuario.name });
    // La respuesta nunca debe incluir la contraseña (ni su hash).
    expect(user.password).toBeUndefined();
  });

  it('acepta el email sin importar mayúsculas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: usuario.email.toUpperCase(), password: usuario.password });

    expect(res.status).toBe(200);
  });

  it('rechaza una contraseña incorrecta con 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: usuario.email, password: 'contraseña-incorrecta' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'Credenciales incorrectas' });
  });

  it('rechaza un email inexistente con 401 y el mismo mensaje', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'no-existe@test.local', password: 'cualquier-clave' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'Credenciales incorrectas' });
  });
});

describe('Rutas protegidas con JWT', () => {
  const RUTA = '/api/auth/notification-preferences';

  it('permite el acceso con el token del login', async () => {
    const { token } = await crearUsuarioLogueado('Protegida');

    const res = await request(app).get(RUTA).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('responde 401 sin token', async () => {
    const res = await request(app).get(RUTA);

    expect(res.status).toBe(401);
  });

  it('responde 401 con un token firmado con otro secreto', async () => {
    const tokenFalso = jwt.sign({ id: 'x', email: 'x@test.local', name: 'X' }, 'otro-secreto');

    const res = await request(app).get(RUTA).set('Authorization', `Bearer ${tokenFalso}`);

    expect(res.status).toBe(401);
  });
});
