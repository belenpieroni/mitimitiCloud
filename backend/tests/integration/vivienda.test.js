const request = require('supertest');
const app = require('../../src/app');
const { crearUsuarioLogueado } = require('../helpers/usuarios');

const auth = (usuario) => ({ Authorization: `Bearer ${usuario.token}` });


async function crearGasto(usuario) {
  const res = await request(app)
    .post('/api/vivienda/gastos')
    .set(auth(usuario))
    .send({
      nombreServicio: 'Supermercado',
      monto: 1500,
      categoria: 'Supermercado',
      fecha: '2026-11-20',
      pagador: usuario.name,
      participantes: [usuario.name],
    });
  return res;
}

describe('Vivienda: creación y lectura con token válido', () => {
  let ana;

  beforeAll(async () => {
    ana = await crearUsuarioLogueado('Ana Vivienda');
  });

  it('crea la vivienda del usuario (201) y lo deja como creador', async () => {
    const res = await request(app).post('/api/vivienda/crear').set(auth(ana)).send({ nombre: 'Casa de Ana' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ nombre: 'Casa de Ana', creadorId: ana.id, esCreador: true });
  });

  it('no permite crear una segunda vivienda (409)', async () => {
    const res = await request(app).post('/api/vivienda/crear').set(auth(ana)).send({ nombre: 'Otra casa' });

    expect(res.status).toBe(409);
  });

  it('lee la vivienda actual con sus miembros (200)', async () => {
    const res = await request(app).get('/api/vivienda/actual').set(auth(ana));

    expect(res.status).toBe(200);
    expect(res.body.data.nombre).toBe('Casa de Ana');
    expect(res.body.data.miembros).toEqual([expect.objectContaining({ id: ana.id, name: ana.name })]);
  });

  it('crea un gasto (201) y lo devuelve al listar (200)', async () => {
    const creado = await crearGasto(ana);
    expect(creado.status).toBe(201);

    const lista = await request(app).get('/api/vivienda/gastos').set(auth(ana));

    expect(lista.status).toBe(200);
    expect(lista.body.data.map((g) => g.id)).toContain(creado.body.data.id);
  });
});

describe('Vivienda: peticiones sin token', () => {
  it.each([
    ['get', '/api/vivienda/actual'],
    ['post', '/api/vivienda/crear'],
    ['get', '/api/vivienda/gastos'],
    ['post', '/api/vivienda/gastos'],
    ['get', '/api/vivienda/servicios'],
    ['get', '/api/vivienda/acuerdos'],
  ])('%s %s responde 401', async (metodo, ruta) => {
    const res = await request(app)[metodo](ruta);

    expect(res.status).toBe(401);
  });

  it('rechaza un token inválido con 401', async () => {
    const res = await request(app).get('/api/vivienda/actual').set('Authorization', 'Bearer token-invalido');

    expect(res.status).toBe(401);
  });
});
