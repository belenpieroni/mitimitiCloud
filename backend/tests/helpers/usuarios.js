const request = require('supertest');
const { randomUUID } = require('crypto');
const app = require('../../src/app');

/**
 * Datos de un usuario nuevo y único en cada llamada, para que los tests
 * no choquen entre sí ni con corridas anteriores sobre la misma base.
 */
function datosUsuario(prefijo = 'Usuario') {
  const sufijo = randomUUID().slice(0, 8);
  return {
    name: `${prefijo} ${sufijo}`,
    email: `${prefijo.toLowerCase().replace(/\s+/g, '-')}-${sufijo}@test.local`,
    password: `clave-${sufijo}`,
  };
}

/** Registra un usuario por la API, lo loguea y devuelve sus datos con el token. */
async function crearUsuarioLogueado(prefijo) {
  const datos = datosUsuario(prefijo);
  await request(app).post('/api/auth/register').send(datos).expect(201);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: datos.email, password: datos.password })
    .expect(200);

  return { ...datos, id: res.body.data.user.id, token: res.body.data.token };
}

module.exports = { datosUsuario, crearUsuarioLogueado };
