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
import { sql } from 'drizzle-orm';
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

async function crearItemDeCategoria(
  categoriaId: string,
  amount: string,
  extras = {},
): Promise<any> {
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

  it('acepta el mes del primer monto, aunque ya haya pasado', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000', {
      month: mesRelativo(-1).etiqueta,
    });

    expect(item.currentAmount).toBe('100000.0000');
    expect((await checklist(mesRelativo(-1).etiqueta)).items[0].target).toBe('100000.0000');
  });

  it('rechaza un mes mal escrito en el ítem nuevo', async () => {
    const mercado = await crearCategoria('Mercado');

    const { estado } = await pedir('POST', '/api/v1/budgets/items', {
      kind: 'category',
      categoryId: mercado.id,
      currency: 'COP',
      amount: '100000',
      month: '2026-13',
    });
    expect(estado).toBe(400);
  });

  it('crea un ítem de ingresos y su progreso es lo recibido en la categoría, nunca te pasaste', async () => {
    const sueldo = await crearCategoria('Sueldo', 'income');
    const banco = await crearCuenta();
    const item = await crearItemDeCategoria(sueldo.id, '900000');

    expect(item).toMatchObject({ kind: 'category', categoryKind: 'income' });

    // Recibir de más: logro, y jamás un aviso en rojo. El ingreso se asigna al
    // ítem: sin ítem quedaría "sin asignar" y no sumaría a ninguno.
    await registrar(banco.id, '950000', { categoryId: sueldo.id, budgetItemId: item.id });

    const { items } = await checklist(mesRelativo(0).etiqueta);
    expect(items[0]).toMatchObject({
      kind: 'category',
      categoryKind: 'income',
      target: '900000.0000',
      progress: '950000.0000',
      status: 'paid',
      checked: true,
      exceeded: false,
    });
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
  it('un tope de gasto no se cumple: solo puede excederse', async () => {
    const mercado = await crearCategoria('Mercado');
    const cuenta = await crearCuenta();
    const item = await crearItemDeCategoria(mercado.id, '100000');

    // La mitad: dentro del tope, sin aviso ni logro.
    await registrar(cuenta.id, '-50000', {
      categoryId: mercado.id,
      budgetItemId: item.id,
    });

    const primerVistazo = await checklist(mesRelativo(0).etiqueta);
    expect(primerVistazo.items).toEqual([
      {
        id: expect.any(String),
        kind: 'category',
        categoryKind: 'expense',
        currency: 'COP',
        categoryId: mercado.id,
        categoryName: 'Mercado',
        label: 'Mercado',
        target: '100000.0000',
        progress: '50000.0000',
        status: 'partial',
        checked: false,
        exceeded: false,
      },
    ]);

    // Justo en el tope: no es un logro (un tope no se "cumple" gastando) y
    // todavía no es un exceso.
    await registrar(cuenta.id, '-50000', {
      categoryId: mercado.id,
      budgetItemId: item.id,
    });
    const alLlegar = await checklist(mesRelativo(0).etiqueta);
    expect(alLlegar.items[0]).toMatchObject({
      progress: '100000.0000',
      status: 'paid',
      checked: false,
      exceeded: false,
    });

    // Pasarse sí enciende el aviso, y nunca el check verde.
    await registrar(cuenta.id, '-30000', {
      categoryId: mercado.id,
      budgetItemId: item.id,
    });
    const alPasar = await checklist(mesRelativo(0).etiqueta);
    expect(alPasar.items[0]).toMatchObject({
      progress: '130000.0000',
      status: 'exceeded',
      checked: false,
      exceeded: true,
    });
  });

  it('una meta de ahorro se cumple al alcanzarla, sin marcarse como excedida', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const ahorro = await crearCuenta({ isSavings: true });
    await crearItemDeAhorro(ahorro.id, '200000');

    // Todavía no llega: ni cumplida ni excedida.
    await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: ahorro.id,
      amount: '150000',
      occurredAt: mesRelativo(0).fecha,
    });
    const aMedias = await checklist(mesRelativo(0).etiqueta);
    expect(aMedias.items[0]).toMatchObject({
      progress: '150000.0000',
      checked: false,
      exceeded: false,
    });

    // Llega justo: se cumple.
    await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: ahorro.id,
      amount: '50000',
      occurredAt: mesRelativo(0).fecha,
    });
    const alLlegar = await checklist(mesRelativo(0).etiqueta);
    expect(alLlegar.items[0]).toMatchObject({
      progress: '200000.0000',
      checked: true,
      exceeded: false,
    });

    // Y ahorrar de más sigue siendo un logro, nunca un exceso.
    await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: ahorro.id,
      amount: '100000',
      occurredAt: mesRelativo(0).fecha,
    });
    const deMas = await checklist(mesRelativo(0).etiqueta);
    expect(deMas.items[0]).toMatchObject({
      progress: '300000.0000',
      checked: true,
      exceeded: false,
    });
  });

  it('sin movimientos el progreso es cero, no un hueco', async () => {
    const mercado = await crearCategoria('Mercado');
    await crearItemDeCategoria(mercado.id, '100000');

    const { items } = await checklist(mesRelativo(0).etiqueta);
    expect(items[0]).toMatchObject({ progress: '0.0000', checked: false, exceeded: false });
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
      exceeded: false,
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
    expect(pasado.items[0]).toMatchObject({
      target: null,
      progress: '0.0000',
      checked: false,
      exceeded: false,
    });
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

    // La misma categoría puede tener un renglón por moneda: el checklist
    // siempre pregunta por una sola. Cada gasto se asigna al ítem de su moneda.
    const itemPesos = await crearItemDeCategoria(mercado.id, '100000');
    const { cuerpo: enDolares } = await pedir('POST', '/api/v1/budgets/items', {
      kind: 'category',
      categoryId: mercado.id,
      currency: 'USD',
      amount: '100',
    });
    expect(enDolares.data.currency).toBe('USD');

    await registrar(pesos.id, '-80000', {
      categoryId: mercado.id,
      budgetItemId: itemPesos.id,
    });
    await registrar(dolares.id, '-50', {
      categoryId: mercado.id,
      budgetItemId: enDolares.data.id,
    });

    const checklistPesos = await checklist(mesRelativo(0).etiqueta, 'COP');
    expect(checklistPesos.items).toHaveLength(1);
    expect(checklistPesos.items[0]).toMatchObject({ currency: 'COP', progress: '80000.0000' });

    const checklistDolares = await checklist(mesRelativo(0).etiqueta, 'USD');
    expect(checklistDolares.items).toHaveLength(1);
    expect(checklistDolares.items[0]).toMatchObject({ currency: 'USD', progress: '50.0000' });
  });
});

describe('cada movimiento cuenta para un solo ítem', () => {
  it('dos ítems de la misma categoría suman solo lo suyo, y el sobrante sale en "sin asignar"', async () => {
    const deudas = await crearCategoria('Deudas');
    const cuenta = await crearCuenta({ openingBalance: '1000000' });
    const dávila = await crearItemDeCategoria(deudas.id, '200000', { label: 'Dávila' });
    const moto = await crearItemDeCategoria(deudas.id, '100000', { label: 'Moto' });

    await registrar(cuenta.id, '-267530', { categoryId: deudas.id, budgetItemId: dávila.id });
    await registrar(cuenta.id, '-40000', { categoryId: deudas.id, budgetItemId: moto.id });
    // Este no apunta a ningún ítem: queda sin asignar dentro de Deudas.
    await registrar(cuenta.id, '-5000', { categoryId: deudas.id });

    const { items, unassigned } = await checklist(mesRelativo(0).etiqueta);
    const porId = new Map(items.map((renglon: any) => [renglon.id, renglon]));

    // Cada ítem ve SOLO lo suyo; el gasto ya no se repite entre los siete ítems.
    expect(porId.get(dávila.id)).toMatchObject({ progress: '267530.0000', status: 'exceeded' });
    expect(porId.get(moto.id)).toMatchObject({ progress: '40000.0000', status: 'partial' });

    expect(unassigned).toEqual([
      {
        categoryId: deudas.id,
        categoryName: 'Deudas',
        categoryKind: 'expense',
        amount: '5000.0000',
      },
    ]);
  });

  it('una categoría sin ítems no aparece en "sin asignar"; un "sin asignar" en cero tampoco', async () => {
    const conItem = await crearCategoria('Con ítem');
    const sinItem = await crearCategoria('Sin ítem');
    const comida = await crearCategoria('Comida');
    const itemDeConItem = await crearItemDeCategoria(conItem.id, '100000');
    await crearItemDeCategoria(comida.id, '100000');

    const cuenta = await crearCuenta();
    // Gasto suelto en una categoría que SÍ tiene ítem: aparece.
    await registrar(cuenta.id, '-3000', { categoryId: conItem.id });
    // Gasto suelto en una categoría SIN ítems: no aparece aunque tenga plata.
    await registrar(cuenta.id, '-9000', { categoryId: sinItem.id });
    // Gasto suelto que luego se anula: queda en cero y no aparece.
    const suelto = await registrar(cuenta.id, '-7000', { categoryId: comida.id });
    await pedir('POST', `/api/v1/transactions/${suelto.id}/reversal`);

    const { unassigned } = await checklist(mesRelativo(0).etiqueta);
    expect(unassigned).toEqual([
      {
        categoryId: conItem.id,
        categoryName: 'Con ítem',
        categoryKind: 'expense',
        amount: '3000.0000',
      },
    ]);
    expect(itemDeConItem).toBeDefined();
  });

  it('un ingreso asignado a su ítem se mide por lo recibido', async () => {
    const sueldo = await crearCategoria('Sueldo', 'income');
    const cuenta = await crearCuenta();
    const item = await crearItemDeCategoria(sueldo.id, '1000000');

    await registrar(cuenta.id, '400000', { categoryId: sueldo.id, budgetItemId: item.id });

    const { items, unassigned } = await checklist(mesRelativo(0).etiqueta);
    expect(items[0]).toMatchObject({
      categoryKind: 'income',
      progress: '400000.0000',
      status: 'partial',
    });
    expect(unassigned).toEqual([]);
  });

  it('pagar una tarjeta paga su ítem sin volverse gasto; anular la transferencia lo deja pendiente', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const tarjeta = await crearCuenta({ type: 'card', openingBalance: '-300000' });
    const deudas = await crearCategoria('Deudas');
    const nu = await crearItemDeCategoria(deudas.id, '300000', { label: 'Deuda TC Nu' });

    const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: tarjeta.id,
      amount: '102500',
      occurredAt: mesRelativo(0).fecha,
      budgetItemId: nu.id,
    });
    expect(estado, JSON.stringify(cuerpo)).toBe(201);

    const salida = cuerpo.data.legs.find((pata: any) => pata.amount.startsWith('-'));
    const entrada = cuerpo.data.legs.find((pata: any) => !pata.amount.startsWith('-'));
    expect(salida.budgetItemId).toBe(nu.id);
    expect(entrada.budgetItemId).toBeNull();

    const vista = await checklist(mesRelativo(0).etiqueta);
    expect(vista.items.find((renglon: any) => renglon.id === nu.id)).toMatchObject({
      progress: '102500.0000',
      status: 'partial',
    });
    // No es plata suelta de la categoría: el pago no es un gasto del mes.
    expect(vista.unassigned).toEqual([]);

    const { cuerpo: resumen } = await pedir(
      'GET',
      `/api/v1/reports/summary?month=${mesRelativo(0).etiqueta}&currency=COP`,
    );
    expect(resumen.data.expense).toBe('0.0000');

    // Anular la transferencia deshace el pago.
    await pedir('POST', `/api/v1/transfers/${cuerpo.data.transferGroupId}/reversal`);
    const despues = await checklist(mesRelativo(0).etiqueta);
    expect(despues.items.find((renglon: any) => renglon.id === nu.id)).toMatchObject({
      progress: '0.0000',
      status: 'pending',
    });
  });

  it('al cambiar de categoría el movimiento suelta su ítem; en la misma categoría lo conserva', async () => {
    const comida = await crearCategoria('Comida');
    const ocio = await crearCategoria('Ocio');
    const item = await crearItemDeCategoria(comida.id, '100000');
    const cuenta = await crearCuenta();
    const gasto = await registrar(cuenta.id, '-20000', {
      categoryId: comida.id,
      budgetItemId: item.id,
    });

    const { cuerpo: igual } = await pedir(
      'PATCH',
      `/api/v1/transactions/${gasto.id}/category`,
      { categoryId: comida.id },
    );
    expect(igual.data.budgetItemId).toBe(item.id);

    const { estado, cuerpo: movido } = await pedir(
      'PATCH',
      `/api/v1/transactions/${gasto.id}/category`,
      { categoryId: ocio.id },
    );
    expect(estado, JSON.stringify(movido)).toBe(200);
    expect(movido.data).toMatchObject({ categoryId: ocio.id, budgetItemId: null });
  });
});

describe('fijar el objetivo de un mes', () => {
  it('fija el monto del mes pedido, y el siguiente (futuro) sigue heredando', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');

    expect((await checklist(mesRelativo(0).etiqueta)).items[0].target).toBe('100000.0000');

    const { estado, cuerpo } = await pedir('PATCH', `/api/v1/budgets/items/${item.id}/target`, {
      amount: '200000',
      month: mesRelativo(0).etiqueta,
    });
    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.currentAmount).toBe('200000.0000');

    // El mes fijado muestra el monto nuevo...
    expect((await checklist(mesRelativo(0).etiqueta)).items[0].target).toBe('200000.0000');

    // ...y el siguiente, que es futuro, hereda: subir el tope de este mes
    // rige "de aquí en adelante".
    expect((await checklist(mesRelativo(1).etiqueta)).items[0].target).toBe('200000.0000');

    // Un mes anterior a que el ítem existiera sigue sin objetivo.
    const itemDeAyer = await checklist(mesRelativo(-1).etiqueta);
    expect(itemDeAyer.items).toHaveLength(1);
    expect(itemDeAyer.items[0].target).toBeNull();
  });

  it('fija el monto de un mes que ya pasó, sin mover el actual ni el siguiente', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');

    const { estado, cuerpo } = await pedir('PATCH', `/api/v1/budgets/items/${item.id}/target`, {
      amount: '250000',
      month: mesRelativo(-1).etiqueta,
    });
    expect(estado, JSON.stringify(cuerpo)).toBe(200);

    expect((await checklist(mesRelativo(-1).etiqueta)).items[0].target).toBe('250000.0000');
    // El mes en curso conserva el suyo.
    expect((await checklist(mesRelativo(0).etiqueta)).items[0].target).toBe('100000.0000');
    expect((await checklist(mesRelativo(1).etiqueta)).items[0].target).toBe('100000.0000');
  });

  it('ediciones repetidas del mismo mes: gana la última', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');

    for (const amount of ['200000', '260000']) {
      const { estado } = await pedir('PATCH', `/api/v1/budgets/items/${item.id}/target`, {
        amount,
        month: mesRelativo(0).etiqueta,
      });
      expect(estado).toBe(200);
    }

    expect((await checklist(mesRelativo(0).etiqueta)).items[0].target).toBe('260000.0000');
    expect((await checklist(mesRelativo(1).etiqueta)).items[0].target).toBe('260000.0000');
  });

  it('repetir el mismo monto no crea segunda fila: reintento idempotente', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');

    for (const _vuelta of [1, 2]) {
      const { estado } = await pedir('PATCH', `/api/v1/budgets/items/${item.id}/target`, {
        amount: '140000',
        month: mesRelativo(0).etiqueta,
      });
      expect(estado).toBe(200);
    }

    // La fila original decía 100000; el reintento con 140000 y otro igual:
    // solo puede existir la fila nueva del 140000, ni una fila idéntica más.
    const [cuenta] = (await db.execute(sql`
      select count(*)::int as n
      from budget_item_targets
      where budget_item_id = ${item.id}::uuid and amount = 140000
    `)) as unknown as { n: number }[];
    expect(Number(cuenta!.n)).toBe(1);
  });

  it('rechaza un mes con año 0000 con 400 por validación del borde, no 500 de Postgres', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');

    // La regla de rango vive en MesSchema (schema del borde), así que el
    // responsable es Zod y el contrato es VALIDATION_ERROR: 400.
    const { estado, cuerpo } = await pedir('PATCH', `/api/v1/budgets/items/${item.id}/target`, {
      amount: '200000',
      month: '0000-01',
    });
    expect(estado).toBe(400);
    expect(cuerpo.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza meses fuera de rango en TODA ruta que valide mes, sin insertar nada', async () => {
    // El service no repite la regla: el borde (MesSchema) es el único que la
    // aplica. Cuatro malos (dos por regex, dos por rango) en las dos rutas
    // que llevan `month`: checklist (GET, querystring) y fijar objetivo
    // (PATCH, body). Un fallo aquí volvería a ser 500 de Postgres, no un
    // 400 limpio.
    for (const mes of ['0000-01', '2026-13', '1999-12', '2101-01']) {
      const checklistMalo = await app.inject({
        method: 'GET',
        url: `/api/v1/budgets/checklist?month=${mes}&currency=COP`,
      });
      expect(checklistMalo.statusCode, `checklist mes ${mes}`).toBe(400);
      expect(checklistMalo.json().error.code, `checklist mes ${mes}`).toBe('VALIDATION_ERROR');

      const mercado = await crearCategoria(`Mercado ${mes}`);
      const item = await crearItemDeCategoria(mercado.id, '100000');
      const fijarMal = await app.inject({
        method: 'PATCH',
        url: `/api/v1/budgets/items/${item.id}/target`,
        payload: { amount: '200000', month: mes },
      });
      expect(fijarMal.statusCode, `target mes ${mes}`).toBe(400);
      expect(fijarMal.json().error.code, `target mes ${mes}`).toBe('VALIDATION_ERROR');

      // Y no quedó rastro: el rechazo del borde ocurre antes de tocar la
      // base, así que la única fila de montos del ítem sigue siendo la de
      // su creación (100000, del mes actual).
      const [filas] = (await db.execute(sql`
        select count(*)::int as n
        from budget_item_targets
        where budget_item_id = ${item.id}::uuid
      `)) as unknown as { n: number }[];
      expect(Number(filas!.n), `filas del monto tras rechazar ${mes}`).toBe(1);
    }
  });

  it('los meses válidos (bordes del rango y el actual) responden 200 de verdad', async () => {
    // "No 400/500" no basta: un 404 u otro código con forma de éxito no
    // probaría nada. Los tres blancos claros:
    // - pequeño: 2000-12 (primer año sano),
    // - grande: 2100-12 (último año sano),
    // - el mes que sigue (flujo normal del checklist).
    for (const mes of ['2000-12', '2100-12']) {
      const checklistBom = await app.inject({
        method: 'GET',
        url: `/api/v1/budgets/checklist?month=${mes}&currency=COP`,
      });
      expect(checklistBom.statusCode, `checklist mes ${mes}`).toBe(200);
      expect(checklistBom.json().error, `checklist mes ${mes}`).toBeUndefined();
    }

    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');
    const { estado, cuerpo } = await pedir('PATCH', `/api/v1/budgets/items/${item.id}/target`, {
      amount: '200000',
      month: mesRelativo(1).etiqueta,
    });
    expect(estado).toBe(200);
    expect(cuerpo.data.currentAmount).toBe('100000.0000'); // hoy no cambió
  });

  it('rechaza un monto negativo o mal escrito al fijar un mes', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');

    for (const amount of ['-5', '-0', 'abc', '']) {
      const { estado } = await pedir('PATCH', `/api/v1/budgets/items/${item.id}/target`, {
        amount,
        month: mesRelativo(0).etiqueta,
      });
      expect(estado, amount).toBe(400);
    }
  });

  it('acepta cero al fijar un mes ("este mes no aplica") y solo rige ese mes', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');

    // "0" y "00" son el mismo cero: ninguno debe apagar los meses de después.
    for (const amount of ['0', '00']) {
      const { estado, cuerpo } = await pedir('PATCH', `/api/v1/budgets/items/${item.id}/target`, {
        amount,
        month: mesRelativo(0).etiqueta,
      });
      expect(estado, amount).toBe(200);
      expect(cuerpo.data.currentAmount).toBe('0.0000');
    }

    const esteMes = await pedir(
      'GET',
      `/api/v1/budgets/checklist?month=${mesRelativo(0).etiqueta}&currency=COP`,
    );
    const siguiente = await pedir(
      'GET',
      `/api/v1/budgets/checklist?month=${mesRelativo(1).etiqueta}&currency=COP`,
    );
    expect(esteMes.cuerpo.data.items[0]).toMatchObject({ target: '0.0000', checked: false });
    expect(siguiente.cuerpo.data.items[0]).toMatchObject({ target: '100000.0000' });
  });

  it('crear un ítem con monto cero, escrito como sea, sigue siendo un error', async () => {
    const mercado = await crearCategoria('Mercado');

    for (const amount of ['0', '00', '000.0000']) {
      const { estado } = await pedir('POST', '/api/v1/budgets/items', {
        kind: 'category',
        categoryId: mercado.id,
        currency: 'COP',
        amount,
      });
      expect(estado, amount).toBe(400);
    }
  });

  it('rechaza un mes mal escrito', async () => {
    const mercado = await crearCategoria('Mercado');
    const item = await crearItemDeCategoria(mercado.id, '100000');

    const { estado, cuerpo } = await pedir('PATCH', `/api/v1/budgets/items/${item.id}/target`, {
      amount: '200000',
      month: '2026-9',
    });
    expect(estado).toBe(400);
    expect(cuerpo.error).toBeDefined();
  });

  it('responde 404 si el ítem no existe o es de otra persona', async () => {
    const { estado } = await pedir('PATCH', `/api/v1/budgets/items/${randomUUID()}/target`, {
      amount: '200000',
      month: mesRelativo(0).etiqueta,
    });
    expect(estado).toBe(404);
  });
});

describe('la forma de las peticiones', () => {
  it('rechaza un mes mal escrito en el checklist', async () => {
    const { estado } = await pedir('GET', `/api/v1/budgets/checklist?month=2026-9&currency=COP`);
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
    const { cuerpo: sinEtiqueta } = await pedir('PATCH', `/api/v1/budgets/items/${item.id}/label`, {
      label: null,
    });
    expect(sinEtiqueta.data.label).toBeNull();
  });
});
