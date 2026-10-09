/**
 * Pruebas de la compra pagada con dos cuentas, de punta a punta con
 * `app.inject()`. Una compra (el mercado) se paga mitad con tarjeta y mitad con
 * plata disponible: se registra UNA vez y quedan dos gastos normales, uno por
 * cuenta, ligados por un mismo grupo. Lo que importa: que entren los dos o
 * ninguno, que cada saldo quede exacto, que el presupuesto cuente la compra
 * entera una sola vez, y que se anule completa (nunca una parte sola).
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
    .values({ email: `pago-dividido-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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
  const texto = respuesta.body;
  return { estado: respuesta.statusCode, cuerpo: texto ? respuesta.json() : null };
}

function mesActual(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  return `${partes.find((p) => p.type === 'year')!.value}-${partes.find((p) => p.type === 'month')!.value}`;
}

const MES = mesActual();
const DIA_5 = `${MES}-05T17:00:00Z`;

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

async function crearCategoria(nombre: string, kind = 'expense'): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/categories', {
    name: `${nombre} ${(contador += 1)}`,
    kind,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function crearItem(categoriaId: string, monto = '200000', moneda = 'COP'): Promise<string> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/budgets/items', {
    kind: 'category',
    categoryId: categoriaId,
    currency: moneda,
    amount: monto,
    month: MES,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data.id;
}

async function saldoDe(cuentaId: string): Promise<string> {
  const { cuerpo } = await pedir('GET', `/api/v1/accounts/${cuentaId}`);
  return cuerpo.data.balance;
}

async function contarMovimientos(cuentaId: string): Promise<number> {
  const filas = (await db.execute(sql`
    select count(*)::int as n from transactions where account_id = ${cuentaId}::uuid and kind = 'standard'
  `)) as unknown as { n: number }[];
  return filas[0]!.n;
}

async function dividir(cuerpo: Record<string, unknown>): Promise<Respuesta> {
  return pedir('POST', '/api/v1/split-payments', { occurredAt: DIA_5, ...cuerpo });
}

async function checklist(): Promise<any[]> {
  const { cuerpo } = await pedir('GET', `/api/v1/budgets/checklist?month=${MES}&currency=COP`);
  return cuerpo.data.items;
}

/** Tarjeta y banco con plata, la categoría y su ítem (con meta de 200.000). */
async function escenario() {
  const tarjeta = await crearCuenta({ type: 'card' });
  const banco = await crearCuenta({ openingBalance: '500000' });
  const comida = await crearCategoria('Comida');
  const mercado = await crearItem(comida.id);
  return { tarjeta, banco, comida, mercado };
}

// -----------------------------------------------------------------------------

describe('registrar una compra pagada con dos cuentas', () => {
  it('guarda dos gastos ligados, cada saldo queda exacto y el gasto del mes cuenta la compra entera', async () => {
    const { tarjeta, banco, comida, mercado } = await escenario();

    const { estado, cuerpo } = await dividir({
      payments: [
        { accountId: tarjeta.id, amount: '-100000' },
        { accountId: banco.id, amount: '-100000' },
      ],
      categoryId: comida.id,
      budgetItemId: mercado,
      description: 'Mercado',
    });

    expect(estado, JSON.stringify(cuerpo)).toBe(201);
    const { paymentGroupId, legs } = cuerpo.data;
    expect(legs).toHaveLength(2);
    expect(legs.map((l: any) => l.paymentGroupId)).toEqual([paymentGroupId, paymentGroupId]);
    expect(legs.map((l: any) => l.description)).toEqual(['Mercado (1 de 2)', 'Mercado (2 de 2)']);
    expect(legs.every((l: any) => l.kind === 'standard' && l.categoryId === comida.id)).toBe(true);
    expect(legs.every((l: any) => l.budgetItemId === mercado)).toBe(true);
    expect(legs.map((l: any) => l.accountId)).toEqual([tarjeta.id, banco.id]);

    expect(await saldoDe(tarjeta.id)).toBe('-100000.0000');
    expect(await saldoDe(banco.id)).toBe('400000.0000');

    const resumen = await pedir('GET', `/api/v1/reports/summary?month=${MES}&currency=COP`);
    expect(resumen.cuerpo.data.expense).toBe('200000.0000');

    // El ítem suma la compra entera, una sola vez, y queda pagado.
    const item = (await checklist()).find((i) => i.id === mercado);
    expect(item).toMatchObject({ progress: '200000.0000', status: 'paid' });
  });

  it('sin descripción las partes se llaman "Pago 1 de 2" y "Pago 2 de 2"', async () => {
    const { tarjeta, banco } = await escenario();

    const { cuerpo } = await dividir({
      payments: [
        { accountId: tarjeta.id, amount: '-60000' },
        { accountId: banco.id, amount: '-40000' },
      ],
    });

    expect(cuerpo.data.legs.map((l: any) => l.description)).toEqual(['Pago 1 de 2', 'Pago 2 de 2']);
    expect(cuerpo.data.legs.map((l: any) => l.amount)).toEqual(['-60000.0000', '-40000.0000']);
  });

  it('también sirve para un ingreso repartido entre dos cuentas', async () => {
    const a = await crearCuenta();
    const b = await crearCuenta();
    const salario = await crearCategoria('Salario', 'income');

    const { estado, cuerpo } = await dividir({
      payments: [
        { accountId: a.id, amount: '300000' },
        { accountId: b.id, amount: '200000' },
      ],
      categoryId: salario.id,
    });

    expect(estado, JSON.stringify(cuerpo)).toBe(201);
    expect(await saldoDe(a.id)).toBe('300000.0000');
    expect(await saldoDe(b.id)).toBe('200000.0000');
  });

  it('entran las dos partes o ninguna: si una cuenta está archivada no se escribe nada', async () => {
    const { tarjeta, banco } = await escenario();
    await pedir('POST', `/api/v1/accounts/${banco.id}/archive`);

    const { estado, cuerpo } = await dividir({
      payments: [
        { accountId: tarjeta.id, amount: '-1000' },
        { accountId: banco.id, amount: '-1000' },
      ],
    });

    expect(estado).toBe(404);
    expect(cuerpo.error.message).toContain('no existe o está archivada');
    expect(await contarMovimientos(tarjeta.id)).toBe(0);
    expect(await saldoDe(tarjeta.id)).toBe('0.0000');
  });

  it('cuenta que no existe o es de otra persona: 404 y no se escribe nada', async () => {
    const { tarjeta } = await escenario();

    const { estado } = await dividir({
      payments: [
        { accountId: tarjeta.id, amount: '-1000' },
        { accountId: randomUUID(), amount: '-1000' },
      ],
    });

    expect(estado).toBe(404);
    expect(await contarMovimientos(tarjeta.id)).toBe(0);
  });

  it('rechaza lo que no tiene sentido: misma cuenta, signos distintos, una sola parte, cero', async () => {
    const { tarjeta, banco } = await escenario();

    const mismaCuenta = await dividir({
      payments: [
        { accountId: tarjeta.id, amount: '-1000' },
        { accountId: tarjeta.id, amount: '-1000' },
      ],
    });
    const signosDistintos = await dividir({
      payments: [
        { accountId: tarjeta.id, amount: '-1000' },
        { accountId: banco.id, amount: '1000' },
      ],
    });
    const unaSola = await dividir({ payments: [{ accountId: tarjeta.id, amount: '-1000' }] });
    const conCero = await dividir({
      payments: [
        { accountId: tarjeta.id, amount: '0' },
        { accountId: banco.id, amount: '-1000' },
      ],
    });

    for (const respuesta of [mismaCuenta, signosDistintos, unaSola, conCero]) {
      expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(400);
    }
    expect(await contarMovimientos(tarjeta.id)).toBe(0);
  });

  it('dos monedas distintas: 422 con mensaje llano', async () => {
    const cop = await crearCuenta();
    const usd = await crearCuenta({ currency: 'USD' });

    const { estado, cuerpo } = await dividir({
      payments: [
        { accountId: cop.id, amount: '-1000' },
        { accountId: usd.id, amount: '-5' },
      ],
    });

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toContain('misma moneda');
  });

  it('el ítem debe ser de la categoría y de la moneda, y pide categoría', async () => {
    const { tarjeta, banco, comida, mercado } = await escenario();
    const ocio = await crearCategoria('Ocio');
    const itemDeOcio = await crearItem(ocio.id);
    const dosPartes = [
      { accountId: tarjeta.id, amount: '-1000' },
      { accountId: banco.id, amount: '-1000' },
    ];

    const sinCategoria = await dividir({ payments: dosPartes, budgetItemId: mercado });
    const deOtraCategoria = await dividir({
      payments: dosPartes,
      categoryId: comida.id,
      budgetItemId: itemDeOcio,
    });

    expect(sinCategoria.estado).toBe(422);
    expect(deOtraCategoria.estado).toBe(422);
    expect(await contarMovimientos(tarjeta.id)).toBe(0);
  });
});

describe('anular una compra pagada con dos cuentas', () => {
  async function comprar() {
    const base = await escenario();
    const { cuerpo } = await dividir({
      payments: [
        { accountId: base.tarjeta.id, amount: '-100000' },
        { accountId: base.banco.id, amount: '-100000' },
      ],
      categoryId: base.comida.id,
      budgetItemId: base.mercado,
      description: 'Mercado',
    });
    return { ...base, ...cuerpo.data };
  }

  it('se anula completa: los saldos y el presupuesto vuelven, y la anulación forma su propio grupo', async () => {
    const compra = await comprar();

    const { estado, cuerpo } = await pedir('POST', `/api/v1/split-payments/${compra.paymentGroupId}/reversal`);

    expect(estado, JSON.stringify(cuerpo)).toBe(201);
    expect(cuerpo.data.paymentGroupId).not.toBe(compra.paymentGroupId);
    expect(cuerpo.data.legs).toHaveLength(2);
    expect(cuerpo.data.legs.map((l: any) => l.amount).sort()).toEqual(['100000.0000', '100000.0000']);
    expect(cuerpo.data.legs.every((l: any) => l.reversesTransactionId)).toBe(true);
    expect(cuerpo.data.legs[0].description).toBe('Anulación de: Mercado (1 de 2)');

    expect(await saldoDe(compra.tarjeta.id)).toBe('0.0000');
    expect(await saldoDe(compra.banco.id)).toBe('500000.0000');
    const resumen = await pedir('GET', `/api/v1/reports/summary?month=${MES}&currency=COP`);
    expect(resumen.cuerpo.data.expense).toBe('0.0000');
    const item = (await checklist()).find((i) => i.id === compra.mercado);
    expect(item).toMatchObject({ progress: '0.0000', status: 'pending' });
  });

  it('anular una sola parte no se puede: 422 que manda a anular la compra completa', async () => {
    const compra = await comprar();

    const { estado, cuerpo } = await pedir(
      'POST',
      `/api/v1/transactions/${compra.legs[0].id}/reversal`,
    );

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toContain('compra completa');
    expect(await saldoDe(compra.tarjeta.id)).toBe('-100000.0000');
  });

  it('no se anula dos veces (409), ni una anulación (422), ni lo que no existe (404)', async () => {
    const compra = await comprar();
    const primera = await pedir('POST', `/api/v1/split-payments/${compra.paymentGroupId}/reversal`);

    const otraVez = await pedir('POST', `/api/v1/split-payments/${compra.paymentGroupId}/reversal`);
    const anularLaAnulacion = await pedir(
      'POST',
      `/api/v1/split-payments/${primera.cuerpo.data.paymentGroupId}/reversal`,
    );
    const inexistente = await pedir('POST', `/api/v1/split-payments/${randomUUID()}/reversal`);

    expect(otraVez.estado).toBe(409);
    expect(anularLaAnulacion.estado).toBe(422);
    expect(inexistente.estado).toBe(404);
  });

  it('otra persona no puede anularla: 404', async () => {
    const compra = await comprar();
    usuarioId = await crearUsuario();

    const { estado } = await pedir('POST', `/api/v1/split-payments/${compra.paymentGroupId}/reversal`);

    expect(estado).toBe(404);
  });

  it('una cuenta archivada impide anular y no deja la compra a medias', async () => {
    const compra = await comprar();
    await pedir('POST', `/api/v1/accounts/${compra.banco.id}/archive`);

    const { estado } = await pedir('POST', `/api/v1/split-payments/${compra.paymentGroupId}/reversal`);

    expect(estado).toBe(422);
    expect(await saldoDe(compra.tarjeta.id)).toBe('-100000.0000');
  });
});

describe('corregir categoría o ítem de una compra dividida', () => {
  async function comprar() {
    const base = await escenario();
    const otro = await crearItem(base.comida.id, '50000');
    const { cuerpo } = await dividir({
      payments: [
        { accountId: base.tarjeta.id, amount: '-100000' },
        { accountId: base.banco.id, amount: '-100000' },
      ],
      categoryId: base.comida.id,
      budgetItemId: base.mercado,
    });
    return { ...base, otro, ...cuerpo.data };
  }

  async function movimiento(id: string): Promise<any> {
    const { cuerpo } = await pedir('GET', `/api/v1/transactions/${id}`);
    return cuerpo.data;
  }

  it('cambiar el ítem de una parte lo cambia en las dos', async () => {
    const compra = await comprar();

    const { estado, cuerpo } = await pedir('PATCH', `/api/v1/transactions/${compra.legs[0].id}/budget-item`, {
      budgetItemId: compra.otro,
    });

    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect((await movimiento(compra.legs[0].id)).budgetItemId).toBe(compra.otro);
    expect((await movimiento(compra.legs[1].id)).budgetItemId).toBe(compra.otro);
    const items = await checklist();
    expect(items.find((i) => i.id === compra.otro)?.progress).toBe('200000.0000');
    expect(items.find((i) => i.id === compra.mercado)?.progress).toBe('0.0000');
  });

  it('cambiar la categoría de una parte la cambia en las dos y las deja sin ítem', async () => {
    const compra = await comprar();
    const ocio = await crearCategoria('Ocio');

    const { estado } = await pedir('PATCH', `/api/v1/transactions/${compra.legs[1].id}/category`, {
      categoryId: ocio.id,
    });

    expect(estado).toBe(200);
    for (const pata of compra.legs) {
      expect(await movimiento(pata.id)).toMatchObject({ categoryId: ocio.id, budgetItemId: null });
    }
  });

  it('con la compra ya anulada, la corrección alcanza también a las anulaciones', async () => {
    const compra = await comprar();
    const anulacion = await pedir('POST', `/api/v1/split-payments/${compra.paymentGroupId}/reversal`);

    await pedir('PATCH', `/api/v1/transactions/${compra.legs[0].id}/budget-item`, {
      budgetItemId: compra.otro,
    });

    for (const pata of anulacion.cuerpo.data.legs) {
      expect((await movimiento(pata.id)).budgetItemId).toBe(compra.otro);
    }
    // Compra y anulación en el mismo ítem: se cancelan, nada queda a medias.
    const items = await checklist();
    expect(items.find((i) => i.id === compra.otro)?.progress).toBe('0.0000');
    expect(items.find((i) => i.id === compra.mercado)?.progress).toBe('0.0000');
  });
});

describe('el respaldo', () => {
  it('el CSV trae el grupo de la compra dividida', async () => {
    const { tarjeta, banco } = await escenario();
    const { cuerpo } = await dividir({
      payments: [
        { accountId: tarjeta.id, amount: '-1000' },
        { accountId: banco.id, amount: '-1000' },
      ],
    });

    const respuesta = await app.inject({ method: 'GET', url: '/api/v1/transactions/export' });

    expect(respuesta.statusCode).toBe(200);
    const lineas = respuesta.body.split('\n');
    expect(lineas[0]).toContain('Pago dividido');
    expect(lineas.filter((linea) => linea.includes(cuerpo.data.paymentGroupId))).toHaveLength(2);
  });
});
