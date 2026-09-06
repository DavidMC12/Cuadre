/**
 * Pruebas de los reportes, de punta a punta con `app.inject()`.
 *
 * Aquí se decide si el tablero dice la verdad, así que cada prueba parte de
 * datos conocidos y compara contra un número escrito a mano. Cada una trabaja
 * con un usuario recién creado: los reportes suman todo lo de una persona, y
 * si dos pruebas compartieran usuario se ensuciarían los totales.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from './app.js';
import { closeDb, db } from './db/client.js';
import { users } from './db/schema/index.js';

let app: FastifyInstance;
let usuarioId: string;

async function crearUsuario(): Promise<string> {
  const [usuario] = await db
    .insert(users)
    .values({ email: `reportes-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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

async function pedir(metodo: 'GET' | 'POST', url: string, cuerpo?: unknown): Promise<Respuesta> {
  const respuesta = await app.inject({
    method: metodo,
    url,
    ...(cuerpo === undefined ? {} : { payload: cuerpo as object }),
  });
  return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
}

/** Mediodía en Bogotá: bien lejos de los bordes del mes. */
const MES = '2026-09';
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
    occurredAt: DIA_5,
    ...extras,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function anular(movimientoId: string): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', `/api/v1/transactions/${movimientoId}/reversal`);
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function resumen(mes = MES, moneda = 'COP'): Promise<any> {
  const { estado, cuerpo } = await pedir(
    'GET',
    `/api/v1/reports/summary?month=${mes}&currency=${moneda}`,
  );
  expect(estado, JSON.stringify(cuerpo)).toBe(200);
  return cuerpo.data;
}

async function porCategoria(tipo = 'expense', mes = MES, moneda = 'COP'): Promise<any[]> {
  const { estado, cuerpo } = await pedir(
    'GET',
    `/api/v1/reports/by-category?month=${mes}&currency=${moneda}&kind=${tipo}`,
  );
  expect(estado, JSON.stringify(cuerpo)).toBe(200);
  return cuerpo.data;
}

/**
 * El mes de hoy en Bogotá, corrido tantos meses hacia atrás. La tendencia
 * siempre termina en el mes actual, así que las pruebas no pueden usar fechas
 * fijas: tienen que contar desde hoy, como lo hace la consulta.
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

// -----------------------------------------------------------------------------

describe('monedas disponibles', () => {
  it('sin cuentas no hay ninguna moneda', async () => {
    const { estado, cuerpo } = await pedir('GET', '/api/v1/reports/currencies');
    expect(estado).toBe(200);
    expect(cuerpo.data).toEqual([]);
  });

  it('lista las monedas en las que hay cuentas, sin repetir', async () => {
    await crearCuenta();
    await crearCuenta({ type: 'cash' });
    await crearCuenta({ currency: 'USD' });

    const { cuerpo } = await pedir('GET', '/api/v1/reports/currencies');
    expect(cuerpo.data).toEqual(['COP', 'USD']);
  });
});

describe('resumen del mes', () => {
  it('suma lo que entró y lo que salió, y el neto es la resta', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '3200000');
    await registrar(cuenta.id, '-1845000');

    expect(await resumen()).toEqual({
      month: MES,
      currency: 'COP',
      income: '3200000.0000',
      expense: '1845000.0000',
      net: '1355000.0000',
    });
  });

  it('un mes sin movimientos son ceros, no un hueco', async () => {
    await crearCuenta();

    expect(await resumen()).toEqual({
      month: MES,
      currency: 'COP',
      income: '0.0000',
      expense: '0.0000',
      net: '0.0000',
    });
  });

  it('una transferencia entre dos cuentas propias NO es un gasto', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const efectivo = await crearCuenta({ type: 'cash' });
    await registrar(banco.id, '-50000');

    const { estado } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: efectivo.id,
      amount: '300000',
      occurredAt: DIA_5,
      description: 'Retiro del cajero',
    });
    expect(estado).toBe(201);

    const total = await resumen();
    expect(total.expense).toBe('50000.0000');
    expect(total.income).toBe('0.0000');
    expect(total.net).toBe('-50000.0000');
  });

  it('un saldo inicial NO es un gasto ni un ingreso', async () => {
    await crearCuenta({ openingBalance: '1500000' });
    await crearCuenta({ type: 'card', openingBalance: '-450000' });

    const total = await resumen();
    expect(total.income).toBe('0.0000');
    expect(total.expense).toBe('0.0000');
    expect(total.net).toBe('0.0000');
  });

  it('un gasto anulado deja el mes exactamente como si nunca hubiera existido', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '500000');
    const gasto = await registrar(cuenta.id, '-100000');

    expect(await resumen()).toMatchObject({ income: '500000.0000', expense: '100000.0000' });

    await anular(gasto.id);

    expect(await resumen()).toEqual({
      month: MES,
      currency: 'COP',
      income: '500000.0000',
      expense: '0.0000',
      net: '500000.0000',
    });
  });

  it('un ingreso anulado tampoco se cuela por el otro lado', async () => {
    const cuenta = await crearCuenta();
    const ingreso = await registrar(cuenta.id, '500000');
    await anular(ingreso.id);

    expect(await resumen()).toEqual({
      month: MES,
      currency: 'COP',
      income: '0.0000',
      expense: '0.0000',
      net: '0.0000',
    });
  });

  it('una transferencia anulada tampoco aparece', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const efectivo = await crearCuenta({ type: 'cash' });

    const { cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: efectivo.id,
      amount: '300000',
      occurredAt: DIA_5,
    });
    await pedir('POST', `/api/v1/transfers/${cuerpo.data.transferGroupId}/reversal`);

    expect(await resumen()).toMatchObject({ income: '0.0000', expense: '0.0000' });
  });

  it('nunca suma dos monedas distintas', async () => {
    const pesos = await crearCuenta();
    const dolares = await crearCuenta({ currency: 'USD' });

    await registrar(pesos.id, '-100000');
    await registrar(dolares.id, '-50');

    expect(await resumen(MES, 'COP')).toMatchObject({ expense: '100000.0000' });
    expect(await resumen(MES, 'USD')).toMatchObject({ expense: '50.0000' });
  });

  it('los movimientos de otro mes no entran', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '-100000', { occurredAt: '2026-08-20T17:00:00Z' });
    await registrar(cuenta.id, '-7000');

    expect(await resumen()).toMatchObject({ expense: '7000.0000' });
    expect(await resumen('2026-08')).toMatchObject({ expense: '100000.0000' });
  });

  it('los centavos no se pierden aunque se sumen muchos', async () => {
    const cuenta = await crearCuenta();
    for (let i = 0; i < 20; i += 1) await registrar(cuenta.id, '-0.01');

    expect(await resumen()).toMatchObject({ expense: '0.2000', net: '-0.2000' });
  });

  it('no mezcla los datos de otra persona', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '-100000');

    usuarioId = await crearUsuario();

    expect(await resumen()).toMatchObject({ income: '0.0000', expense: '0.0000' });
  });

  it('rechaza un mes que no existe', async () => {
    const { estado, cuerpo } = await pedir(
      'GET',
      '/api/v1/reports/summary?month=2026-13&currency=COP',
    );
    expect(estado).toBe(400);
    expect(cuerpo.error.details[0].problema).toMatch(/2026-09/);
  });

  it('rechaza una moneda mal escrita', async () => {
    const { estado } = await pedir('GET', '/api/v1/reports/summary?month=2026-09&currency=pesos');
    expect(estado).toBe(400);
  });
});

describe('el mes se corta en hora de Bogotá', () => {
  it('un gasto del 30 de septiembre a las 11 de la noche cuenta en septiembre', async () => {
    const cuenta = await crearCuenta();
    // 2026-10-01 03:00 UTC son las 10:00 p.m. del 30 de septiembre en Bogotá.
    await registrar(cuenta.id, '-80000', { occurredAt: '2026-10-01T03:00:00Z' });

    expect(await resumen('2026-09')).toMatchObject({ expense: '80000.0000' });
    expect(await resumen('2026-10')).toMatchObject({ expense: '0.0000' });
  });

  it('un gasto del 1 de octubre a la medianoche cuenta en octubre', async () => {
    const cuenta = await crearCuenta();
    // 2026-10-01 05:30 UTC son las 12:30 a.m. del 1 de octubre en Bogotá.
    await registrar(cuenta.id, '-80000', { occurredAt: '2026-10-01T05:30:00Z' });

    expect(await resumen('2026-09')).toMatchObject({ expense: '0.0000' });
    expect(await resumen('2026-10')).toMatchObject({ expense: '80000.0000' });
  });
});

describe('totales por categoría', () => {
  it('van de mayor a menor y los sin clasificar tienen su propio balde', async () => {
    const cuenta = await crearCuenta();
    const mercado = await crearCategoria('Mercado');
    const transporte = await crearCategoria('Transporte');

    await registrar(cuenta.id, '-820000', { categoryId: mercado.id });
    await registrar(cuenta.id, '-300000', { categoryId: transporte.id });
    await registrar(cuenta.id, '-95000');

    expect(await porCategoria()).toEqual([
      { categoryId: mercado.id, categoryName: 'Mercado', total: '820000.0000' },
      { categoryId: transporte.id, categoryName: 'Transporte', total: '300000.0000' },
      { categoryId: null, categoryName: null, total: '95000.0000' },
    ]);
  });

  it('los ingresos se piden aparte, con kind=income', async () => {
    const cuenta = await crearCuenta();
    const sueldo = await crearCategoria('Sueldo', 'income');
    const mercado = await crearCategoria('Mercado');

    await registrar(cuenta.id, '3200000', { categoryId: sueldo.id });
    await registrar(cuenta.id, '-820000', { categoryId: mercado.id });

    expect(await porCategoria('income')).toEqual([
      { categoryId: sueldo.id, categoryName: 'Sueldo', total: '3200000.0000' },
    ]);
  });

  it('sin kind muestra los gastos, que es la torta del tablero', async () => {
    const cuenta = await crearCuenta();
    const mercado = await crearCategoria('Mercado');
    await registrar(cuenta.id, '-820000', { categoryId: mercado.id });

    const { cuerpo } = await pedir('GET', `/api/v1/reports/by-category?month=${MES}&currency=COP`);
    expect(cuerpo.data).toHaveLength(1);
    expect(cuerpo.data[0].total).toBe('820000.0000');
  });

  it('un gasto anulado desaparece de su categoría, no queda en cero', async () => {
    const cuenta = await crearCuenta();
    const mercado = await crearCategoria('Mercado');
    const ocio = await crearCategoria('Ocio');

    const gasto = await registrar(cuenta.id, '-100000', { categoryId: mercado.id });
    await registrar(cuenta.id, '-50000', { categoryId: ocio.id });

    await anular(gasto.id);

    expect(await porCategoria()).toEqual([
      { categoryId: ocio.id, categoryName: 'Ocio', total: '50000.0000' },
    ]);
  });

  it('las transferencias y los saldos iniciales no salen en ninguna categoría', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const efectivo = await crearCuenta({ type: 'cash' });

    await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: efectivo.id,
      amount: '300000',
      occurredAt: DIA_5,
    });

    expect(await porCategoria()).toEqual([]);
  });

  it('nunca suma dos monedas distintas', async () => {
    const pesos = await crearCuenta();
    const dolares = await crearCuenta({ currency: 'USD' });
    const mercado = await crearCategoria('Mercado');

    await registrar(pesos.id, '-100000', { categoryId: mercado.id });
    await registrar(dolares.id, '-50', { categoryId: mercado.id });

    expect(await porCategoria('expense', MES, 'COP')).toEqual([
      { categoryId: mercado.id, categoryName: 'Mercado', total: '100000.0000' },
    ]);
    expect(await porCategoria('expense', MES, 'USD')).toEqual([
      { categoryId: mercado.id, categoryName: 'Mercado', total: '50.0000' },
    ]);
  });

  it('la suma de las categorías cuadra con el resumen del mes', async () => {
    const cuenta = await crearCuenta();
    const mercado = await crearCategoria('Mercado');
    const ocio = await crearCategoria('Ocio');

    await registrar(cuenta.id, '-820000', { categoryId: mercado.id });
    await registrar(cuenta.id, '-300000', { categoryId: ocio.id });
    await registrar(cuenta.id, '-95000');

    const partes = await porCategoria();
    const sumado = partes.reduce(
      (total, parte) => total + BigInt(parte.total.replace('.', '')),
      0n,
    );

    const total = await resumen();
    expect(sumado).toBe(BigInt(total.expense.replace('.', '')));
  });

  it('una categoría archivada sigue apareciendo en los reportes del pasado', async () => {
    const cuenta = await crearCuenta();
    const mercado = await crearCategoria('Mercado');
    await registrar(cuenta.id, '-820000', { categoryId: mercado.id });

    await pedir('POST', `/api/v1/categories/${mercado.id}/archive`);

    expect(await porCategoria()).toEqual([
      { categoryId: mercado.id, categoryName: 'Mercado', total: '820000.0000' },
    ]);
  });
});

describe('tendencia', () => {
  it('devuelve los meses vacíos en cero, sin saltárselos', async () => {
    const cuenta = await crearCuenta();
    const hace2 = mesRelativo(-2);
    const esteMes = mesRelativo(0);

    await registrar(cuenta.id, '-120000', { occurredAt: hace2.fecha });
    await registrar(cuenta.id, '450000', { occurredAt: esteMes.fecha });

    const { estado, cuerpo } = await pedir('GET', '/api/v1/reports/trend?months=3&currency=COP');

    expect(estado).toBe(200);
    expect(cuerpo.data).toEqual([
      { month: hace2.etiqueta, income: '0.0000', expense: '120000.0000' },
      { month: mesRelativo(-1).etiqueta, income: '0.0000', expense: '0.0000' },
      { month: esteMes.etiqueta, income: '450000.0000', expense: '0.0000' },
    ]);
  });

  it('sin movimientos devuelve la ventana completa en cero', async () => {
    const { cuerpo } = await pedir('GET', '/api/v1/reports/trend?months=4&currency=COP');

    expect(cuerpo.data.map((mes: any) => mes.month)).toEqual([
      mesRelativo(-3).etiqueta,
      mesRelativo(-2).etiqueta,
      mesRelativo(-1).etiqueta,
      mesRelativo(0).etiqueta,
    ]);
  });

  it('por defecto son seis meses y terminan en el mes de hoy', async () => {
    const { cuerpo } = await pedir('GET', '/api/v1/reports/trend?currency=COP');

    expect(cuerpo.data).toHaveLength(6);
    expect(cuerpo.data[5].month).toBe(mesRelativo(0).etiqueta);
  });

  it('un gasto anulado deja su mes en cero', async () => {
    const cuenta = await crearCuenta();
    const esteMes = mesRelativo(0);

    const gasto = await registrar(cuenta.id, '-120000', { occurredAt: esteMes.fecha });
    await anular(gasto.id);

    const { cuerpo } = await pedir('GET', '/api/v1/reports/trend?months=1&currency=COP');
    expect(cuerpo.data).toEqual([{ month: esteMes.etiqueta, income: '0.0000', expense: '0.0000' }]);
  });

  it('las transferencias no inflan la tendencia', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const efectivo = await crearCuenta({ type: 'cash' });

    await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: efectivo.id,
      amount: '300000',
      occurredAt: mesRelativo(0).fecha,
    });

    const { cuerpo } = await pedir('GET', '/api/v1/reports/trend?months=1&currency=COP');
    expect(cuerpo.data[0]).toMatchObject({ income: '0.0000', expense: '0.0000' });
  });

  it('no acepta una ventana de más de dos años', async () => {
    const { estado } = await pedir('GET', '/api/v1/reports/trend?months=25&currency=COP');
    expect(estado).toBe(400);
  });

  it('no acepta cero meses', async () => {
    const { estado } = await pedir('GET', '/api/v1/reports/trend?months=0&currency=COP');
    expect(estado).toBe(400);
  });
});
