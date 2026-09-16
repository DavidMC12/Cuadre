/**
 * Pruebas del checklist de presupuesto, de punta a punta con `app.inject()`.
 *
 * El dinero de verdad pasa por aquí: cada prueba parte de datos conocidos y
 * compara contra montos escritos a mano. Cada una trabaja con un usuario
 * recién creado, porque el checklist es una lista por persona y si dos
 * pruebas compartieran usuario se ensuciarían los renglones.
 *
 * El mes del checklist NO puede ser una fecha fija: los objetivos nacen
 * regidos desde el mes de hoy, así que las pruebas preguntan por el mes
 * actual (calculado igual que el servidor, en hora de Bogotá) y por el
 * siguiente.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from './aplicacion.js';
import { closeDb, db } from './db/client.js';
import { users } from './db/schema/index.js';

let app: FastifyInstance;
let usuarioId: string;

async function crearUsuario(): Promise<string> {
  const [usuario] = await db
    .insert(users)
    .values({ email: `presupuesto-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
    .returning({ id: users.id });

  return usuario!.id;
}

beforeAll(async () => {
  usuarioId = await crearUsuario();
  app = await construirApp({ silencioso: true, resolverUsuario: async () => usuarioId });
  await app.ready();
});

beforeEach(async () => {
  usuarioId = await crearUsuario();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

// -----------------------------------------------------------------------------
// Atajos

interface Respuesta<T = any> {
  estado: number;
  cuerpo: T;
}

async function pedir(
  metodo: 'GET' | 'POST' | 'PATCH',
  url: string,
  cuerpo?: unknown,
): Promise<Respuesta> {
  const respuesta = await app.inject({
    method: metodo,
    url,
    ...(cuerpo === undefined ? {} : { payload: cuerpo as object }),
  });
  return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
}

/**
 * El mes de hoy en Bogotá, corrido tantos meses. Las fechas fijas de los
 * movimientos (día 15) caen bien lejos de los bordes del mes.
 */
function mesRelativo(desplazamiento: number): { etiqueta: string; fecha: string } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  const anio = Number(partes.find((parte) => parte.type === 'year')!.value);
  const mes = Number(partes.find((parte) => parte.type === 'month')!.value);

  const corrido = anio * 12 + (mes - 1) + desplazamiento;
  const etiqueta = `${Math.floor(corrido / 12)}-${String((corrido % 12) + 1).padStart(2, '0')}`;

  return { etiqueta, fecha: `${etiqueta}-15T17:00:00Z` };
}

let contador = 0;

async function crearCuenta(extras: Record<string, unknown> = {}): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/accounts', {
    name: `Cuenta ${(contador += 1)}`,
    type: 'bank',
    currency: 'COP',
    ...extras,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function crearCategoria(nombre: string, tipo = 'expense'): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/categories', {
    name: nombre,
    kind: tipo,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function registrar(cuentaId: string, monto: string, extras = {}): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/transactions', {
    accountId: cuentaId,
    amount: monto,
    occurredAt: mesRelativo(0).fecha,
    ...extras,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function crearItemDeCategoria(categoriaId: string, amount: string, extras = {}): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/budgets/items', {
    kind: 'category',
    categoryId: categoriaId,
    currency: 'COP',
    amount,
    ...extras,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function crearItemDeAhorro(cuentaId: string, amount: string): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/budgets/items', {
    kind: 'savings',
    accountId: cuentaId,
    amount,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function checklist(mes: string, moneda = 'COP'): Promise<any> {
  const { estado, cuerpo } = await pedir(
    'GET',
    `/api/v1/budgets/checklist?month=${mes}&currency=${moneda}`,
  );
  expect(estado, JSON.stringify(cuerpo)).toBe(200);
  return cuerpo.data;
}

// -----------------------------------------------------------------------------

describe('crear ítems', () => {
  it('crea un ítem de categoría con su primer monto', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');

    expect(item).toMatchObject({
      kind: 'category',
      currency: 'COP',
      categoryId: mercado.id,
      categoryName: 'Mercado',
      accountId: null,
      accountName: null,
      label: null,
      currentAmount: '100000.0000',
      archivedAt: null,
    });
    expect(item.id).toBeDefined();
  });

  it('crea un ítem de ahorro y la moneda es la de la cuenta, no una que llegue', async () => {
    const ahorro = await crearCuenta({ isSavings: true, currency: 'USD' });
    const item = await crearItemDeAhorro(ahorro.id, '200');

    expect(item).toMatchObject({
      kind: 'savings',
      currency: 'USD',
      accountId: ahorro.id,
      accountName: ahorro.name,
      categoryId: null,
      currentAmount: '200.0000',
    });
  });

  it('rechaza una categoría de ingresos', async () => {
    const sueldo = await crearCategoria('Sueldo', 'income');

    const { estado, cuerpo } = await pedir('POST', '/api/v1/budgets/items', {
      kind: 'category',
      categoryId: sueldo.id,
      currency: 'COP',
      amount: '100000',
    });

    expect(estado).toBe(422);
    expect(cuerpo.error.code).toBe('RULE_VIOLATION');
    expect(cuerpo.error.message).toMatch(/ingresos/);
  });

  it('rechaza una cuenta que no está marcada como de ahorro', async () => {
    const banco = await crearCuenta();

    const { estado, cuerpo } = await pedir('POST', '/api/v1/budgets/items', {
      kind: 'savings',
      accountId: banco.id,
      amount: '200000',
    });

    expect(estado).toBe(422);
    expect(cuerpo.error.code).toBe('RULE_VIOLATION');
    expect(cuerpo.error.message).toMatch(/ahorro/);
  });

  it('rechaza una categoría que no existe', async () => {
    const { estado } = await pedir('POST', '/api/v1/budgets/items', {
      kind: 'category',
      categoryId: randomUUID(),
      currency: 'COP',
      amount: '100000',
    });
    expect(estado).toBe(404);
  });

  it('rechaza un monto en cero', async () => {
    const mercado = await crearCategoria('Mercado');

    const { estado } = await pedir('POST', '/api/v1/budgets/items', {
      kind: 'category',
      categoryId: mercado.id,
      currency: 'COP',
      amount: '0',
    });
    expect(estado).toBe(400);
  });
});

describe('el checklist del mes', () => {
  it('un ítem de categoría se cumple al llegar o pasar el objetivo', async () => {
    const mercado = await crearCategoria('Mercado');
    const cuenta = await crearCuenta();
    await crearItemDeCategoria(mercado.id, '100000');

    // La mitad: no está cumplido todavía.
    await registrar(cuenta.id, '-50000', { categoryId: mercado.id });

    const primerVistazo = await checklist(mesRelativo(0).etiqueta);
    expect(primerVistazo.items).toEqual([
      {
        id: expect.any(String),
        kind: 'category',
        currency: 'COP',
        label: 'Mercado',
        target: '100000.0000',
        progress: '50000.0000',
        checked: false,
      },
    ]);

    // Al llegar justo al objetivo ya cuenta como cumplido: no hay que pasarse.
    await registrar(cuenta.id, '-50000', { categoryId: mercado.id });
    const alLlegar = await checklist(mesRelativo(0).etiqueta);
    expect(alLlegar.items[0]).toMatchObject({ progress: '100000.0000', checked: true });

    // Y pasarse no lo desmarca.
    await registrar(cuenta.id, '-30000', { categoryId: mercado.id });
    const alPasar = await checklist(mesRelativo(0).etiqueta);
    expect(alPasar.items[0]).toMatchObject({ progress: '130000.0000', checked: true });
  });

  it('sin movimientos el progreso es cero, no un hueco', async () => {
    const mercado = await crearCategoria('Mercado');
    await crearItemDeCategoria(mercado.id, '100000');

    const { items } = await checklist(mesRelativo(0).etiqueta);
    expect(items[0]).toMatchObject({ progress: '0.0000', checked: false });
  });

  it('un ítem de ahorro cuenta lo que entró a la cuenta en el mes', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const ahorro = await crearCuenta({ isSavings: true });
    await crearItemDeAhorro(ahorro.id, '200000');

    await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: ahorro.id,
      amount: '150000',
      occurredAt: mesRelativo(0).fecha,
    });

    const { items } = await checklist(mesRelativo(0).etiqueta);
    expect(items[0]).toMatchObject({
      kind: 'savings',
      progress: '150000.0000',
      checked: false,
    });
    expect(items[0].label).toBe(ahorro.name);
  });

  it('la etiqueta propia manda sobre el nombre de la categoría o cuenta', async () => {
    const mercado = await crearCategoria('Mercado');
    await crearItemDeCategoria(mercado.id, '100000', { label: 'Mercado del mes' });

    const { items } = await checklist(mesRelativo(0).etiqueta);
    expect(items[0].label).toBe('Mercado del mes');
  });

  it('un ítem creado este mes no aplica a los meses anteriores, sin target', async () => {
    const mercado = await crearCategoria('Mercado');
    await crearItemDeCategoria(mercado.id, '100000');

    const pasado = await checklist(mesRelativo(-1).etiqueta);
    expect(pasado.items).toHaveLength(1);
    expect(pasado.items[0]).toMatchObject({ target: null, progress: '0.0000', checked: false });
  });

  it('no mezcla los datos de otra persona', async () => {
    const mercado = await crearCategoria('Mercado');
    await crearItemDeCategoria(mercado.id, '100000');

    usuarioId = await crearUsuario();

    const { items } = await checklist(mesRelativo(0).etiqueta);
    expect(items).toEqual([]);
  });

  it('nunca junta dos monedas distintas en un mismo checklist', async () => {
    const mercado = await crearCategoria('Mercado');
    const pesos = await crearCuenta();
    const dolares = await crearCuenta({ currency: 'USD' });

    await registrar(pesos.id, '-80000', { categoryId: mercado.id });
    await registrar(dolares.id, '-50', { categoryId: mercado.id });

    // La misma categoría puede tener un renglón por moneda: el checklist
    // siempre pregunta por una sola.
    await crearItemDeCategoria(mercado.id, '100000');
    const { cuerpo: enDolares } = await pedir('POST', '/api/v1/budgets/items', {
      kind: 'category',
      categoryId: mercado.id,
      currency: 'USD',
      amount: '100',
    });
    expect(enDolares.data.currency).toBe('USD');

    const checklistPesos = await checklist(mesRelativo(0).etiqueta, 'COP');
    expect(checklistPesos.items).toHaveLength(1);
    expect(checklistPesos.items[0]).toMatchObject({ currency: 'COP', progress: '80000.0000' });

    const checklistDolares = await checklist(mesRelativo(0).etiqueta, 'USD');
    expect(checklistDolares.items).toHaveLength(1);
    expect(checklistDolares.items[0]).toMatchObject({ currency: 'USD', progress: '50.0000' });
  });
});

describe('cambiar el objetivo de un ítem', () => {
  it('el monto nuevo rige desde este mes en adelante, sin pisar lo ya vivido', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');

    expect((await checklist(mesRelativo(0).etiqueta)).items[0].target).toBe('100000.0000');

    const { estado, cuerpo } = await pedir('PATCH', `/api/v1/budgets/items/${item.id}/target`, {
      amount: '200000',
    });
    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.currentAmount).toBe('200000.0000');

    // El mes actual y el siguiente muestran el monto nuevo...
    expect((await checklist(mesRelativo(0).etiqueta)).items[0].target).toBe('200000.0000');
    expect((await checklist(mesRelativo(1).etiqueta)).items[0].target).toBe('200000.0000');

    // ...y el checklist de este mes con el monto viejo ya no existe: la fila
    // nueva lo reemplazó, que es lo que hace el versionado (un mes que ya
    // pasó nunca cambia como se vio, y eso lo garantiza la base).
    const itemDeAyer = await checklist(mesRelativo(-1).etiqueta);
    expect(itemDeAyer.items).toHaveLength(1);
    expect(itemDeAyer.items[0].target).toBeNull();
  });

  it('rechaza un monto en cero o negativo', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');

    const { estado } = await pedir('PATCH', `/api/v1/budgets/items/${item.id}/target`, {
      amount: '-5',
    });
    expect(estado).toBe(400);
  });

  it('responde 404 si el ítem no existe o es de otra persona', async () => {
    const { estado } = await pedir('PATCH', `/api/v1/budgets/items/${randomUUID()}/target`, {
      amount: '200000',
    });
    expect(estado).toBe(404);
  });
});

describe('la forma de las peticiones', () => {
  it('rechaza un mes mal escrito en el checklist', async () => {
    const { estado } = await pedir(
      'GET',
      `/api/v1/budgets/checklist?month=2026-9&currency=COP`,
    );
    expect(estado).toBe(400);
  });
});

describe('archivar un ítem', () => {
  it('lo saca del checklist y de la lista, pero queda con includeArchived', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');

    expect((await checklist(mesRelativo(0).etiqueta)).items).toHaveLength(1);

    const { estado, cuerpo } = await pedir('POST', `/api/v1/budgets/items/${item.id}/archive`);
    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.archivedAt).not.toBeNull();

    // Del checklist del mes SIGUIENTE desaparece...
    expect((await checklist(mesRelativo(1).etiqueta)).items).toEqual([]);

    // ...pero el mes actual lo conserva: se archivó hoy y en este mes sí
    // estaba activo — archivar no reescribe cómo se vio el mes en curso, el
    // mismo principio del versionado de montos.
    expect((await checklist(mesRelativo(0).etiqueta)).items).toHaveLength(1);

    // ...pero sigue en la lista que pide los archivados, para poder
    // desarchivarlo desde la misma pantalla.
    const { cuerpo: lista } = await pedir('GET', '/api/v1/budgets/items?includeArchived=true');
    expect(lista.data.map((i: any) => i.id)).toContain(item.id);

    const { cuerpo: activos } = await pedir('GET', '/api/v1/budgets/items');
    expect(activos.data).toEqual([]);
  });

  it('responde 409 si ya estaba archivado', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');
    await pedir('POST', `/api/v1/budgets/items/${item.id}/archive`);

    const { estado, cuerpo } = await pedir('POST', `/api/v1/budgets/items/${item.id}/archive`);
    expect(estado).toBe(409);
    expect(cuerpo.error.code).toBe('CONFLICT');
  });

  it('un ítem archivado se puede desarchivar y vuelve al checklist de los meses que faltan', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');
    await pedir('POST', `/api/v1/budgets/items/${item.id}/archive`);

    const { estado, cuerpo } = await pedir('POST', `/api/v1/budgets/items/${item.id}/unarchive`);
    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.archivedAt).toBeNull();

    expect((await checklist(mesRelativo(1).etiqueta)).items).toHaveLength(1);
  });
});

describe('la etiqueta de un ítem', () => {
  it('se puede poner y se puede dejar vacía', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');

    const { estado, cuerpo } = await pedir('PATCH', `/api/v1/budgets/items/${item.id}/label`, {
      label: 'Mercado del mes',
    });
    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.label).toBe('Mercado del mes');

    // Null significa "usa el nombre de la categoría otra vez".
    const { cuerpo: sinEtiqueta } = await pedir(
      'PATCH',
      `/api/v1/budgets/items/${item.id}/label`,
      { label: null },
    );
    expect(sinEtiqueta.data.label).toBeNull();
  });
});
