const request = require('supertest');
const app = require('../../src/app');
const { crearUsuarioLogueado } = require('../helpers/usuarios');

const auth = (usuario) => ({ Authorization: `Bearer ${usuario.token}` });

// Crea un acuerdo con un único participante (el propio usuario): así crear gastos o
// servicios no dispara notificaciones a terceros durante los tests.
async function crearAcuerdo(usuario, nombre = 'Acuerdo test') {
  const res = await request(app)
    .post('/api/vivienda/acuerdos')
    .set(auth(usuario))
    .send({ nombre, modelo: 'igualitario', participantes: [{ nombre: usuario.name, porcentaje: 100 }] })
    .expect(201);
  return res.body.data.id;
}

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

/**
 * Aislamiento entre viviendas.
 *
 * La API no expone rutas para pedir "la vivienda X": todo se resuelve con la vivienda
 * del usuario del token. Por eso, cuando alguien intenta leer o modificar un recurso de
 * otra vivienda por su id, la respuesta es 404 (no existe en SU vivienda) y no 403:
 * así tampoco se revela que el recurso existe.
 */
describe('Vivienda: aislamiento entre viviendas', () => {
  let duenia;
  let ajeno;
  let gastoId;
  let servicioId;
  let acuerdoId;

  beforeAll(async () => {
    duenia = await crearUsuarioLogueado('Duenia');
    ajeno = await crearUsuarioLogueado('Ajeno');

    await request(app).post('/api/vivienda/crear').set(auth(duenia)).send({ nombre: 'Casa privada' }).expect(201);
    await request(app).post('/api/vivienda/crear').set(auth(ajeno)).send({ nombre: 'Casa ajena' }).expect(201);

    gastoId = (await crearGasto(duenia)).body.data.id;
    acuerdoId = await crearAcuerdo(duenia);
    const servicio = await request(app)
      .post('/api/vivienda/servicios')
      .set(auth(duenia))
      .send({ acuerdoId, nombreServicio: 'Internet', frecuencia: 'mensual', proximoVencimiento: '2026-12-10', monto: 9000 })
      .expect(201);
    servicioId = servicio.body.data.id;
  });

  it('cada usuario solo ve su propia vivienda', async () => {
    const res = await request(app).get('/api/vivienda/actual').set(auth(ajeno));

    expect(res.body.data.nombre).toBe('Casa ajena');
    expect(res.body.data.miembros.map((m) => m.id)).not.toContain(duenia.id);
  });

  it('los listados no incluyen gastos, servicios ni acuerdos de otra vivienda', async () => {
    const [gastos, servicios, acuerdos] = await Promise.all(
      ['gastos', 'servicios', 'acuerdos'].map((r) => request(app).get(`/api/vivienda/${r}`).set(auth(ajeno)))
    );

    expect(gastos.body.data.map((g) => g.id)).not.toContain(gastoId);
    expect(servicios.body.data.map((s) => s.id)).not.toContain(servicioId);
    expect(acuerdos.body.data.map((a) => a.id)).not.toContain(acuerdoId);
  });

  it('no puede editar ni borrar un gasto ajeno (404)', async () => {
    const editar = await request(app).put(`/api/vivienda/gastos/${gastoId}`).set(auth(ajeno)).send({ monto: 1 });
    const borrar = await request(app).delete(`/api/vivienda/gastos/${gastoId}`).set(auth(ajeno));

    expect(editar.status).toBe(404);
    expect(borrar.status).toBe(404);
  });

  it('no puede editar ni borrar un servicio ajeno (404)', async () => {
    const editar = await request(app).put(`/api/vivienda/servicios/${servicioId}`).set(auth(ajeno)).send({ monto: 1 });
    const borrar = await request(app).delete(`/api/vivienda/servicios/${servicioId}`).set(auth(ajeno));

    expect(editar.status).toBe(404);
    expect(borrar.status).toBe(404);
  });

  it('no puede marcar como pagado ni revertir un gasto ajeno (404)', async () => {
    const pagar = await request(app).patch(`/api/vivienda/gastos/${gastoId}/pagar`).set(auth(ajeno));
    const revertir = await request(app).patch(`/api/vivienda/gastos/${gastoId}/revertir`).set(auth(ajeno));

    expect(pagar.status).toBe(404);
    expect(revertir.status).toBe(404);
  });

  it('no puede editar ni eliminar un acuerdo ajeno (404)', async () => {
    const editar = await request(app)
      .put(`/api/vivienda/acuerdos/${acuerdoId}`)
      .set(auth(ajeno))
      .send({ nombre: 'Hackeado', modelo: 'igualitario', participantes: [] });
    const borrar = await request(app).delete(`/api/vivienda/acuerdos/${acuerdoId}`).set(auth(ajeno));

    expect(editar.status).toBe(404);
    expect(borrar.status).toBe(404);
  });

  it('después de los intentos, los datos de la dueña siguen intactos', async () => {
    const gastos = await request(app).get('/api/vivienda/gastos').set(auth(duenia));
    const gasto = gastos.body.data.find((g) => g.id === gastoId);
    const acuerdos = await request(app).get('/api/vivienda/acuerdos').set(auth(duenia));

    expect(gasto).toMatchObject({ monto: 1500, status: 'PROCESADO' });
    expect(acuerdos.body.data.map((a) => a.id)).toContain(acuerdoId);
  });

  it('un usuario sin vivienda no puede cargar gastos (404)', async () => {
    const sinVivienda = await crearUsuarioLogueado('Sin vivienda');

    const actual = await request(app).get('/api/vivienda/actual').set(auth(sinVivienda));
    const gasto = await crearGasto(sinVivienda);

    expect(actual.body.data).toBeNull();
    expect(gasto.status).toBe(404);
  });
});
