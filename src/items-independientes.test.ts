/**
 * Pruebas del núcleo de "cada movimiento cuenta para un solo ítem".
 *
 * Antes, un gasto en "Deudas" contaba completo en los siete ítems de Deudas a
 * la vez. Ahora un movimiento apunta a UN ítem (`budget_item_id`) y cada ítem
 * suma solo lo suyo; lo que no apunta a ninguno queda "sin asignar" en su
 * categoría. Aquí se prueban las reglas que lo sostienen —las de la base y las
 * dos consultas de `reports`— llamando a los repositories directamente; la capa
 * HTTP la cubre `service`/`routes` aparte.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from './aplicacion.js';
import { closeDb, db } from './db/client.js';
import { users } from './db/schema/index.js';
import * as presupuesto from './modules/budgets/repository.js';
import * as reportes from './modules/reports/repository.js';
import * as movimientos from './modules/transactions/repository.js';

let app: FastifyInstance;
let usuarioId: string;

async function crearUsuario(): Promise<string> {
  const [usuario] = await db
    .insert(users)
    .values({ email: `items-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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

async function pedir(metodo: 'GET' | 'POST', url: string, cuerpo?: unknown) {
  const respuesta = await app.inject({
    method: metodo,
    url,
    ...(cuerpo === undefined ? {} : { payload: cuerpo as object }),
  });
  return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
}

function mesRelativo(desplazamiento: number): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const anio = Number(partes.find((parte) => parte.type === 'year')!.value);
  const mes = Number(partes.find((parte) => parte.type === 'month')!.value);
  const total = anio * 12 + (mes - 1) + desplazamiento;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const MES = mesRelativo(0);
const MES_PASADO = mesRelativo(-1);
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

async function crearCategoria(nombre: string, kind: 'expense' | 'income' = 'expense'): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/categories', {
    name: `${nombre} ${(contador += 1)}`,
    kind,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function crearItem(
  categoriaId: string,
  opciones: { moneda?: string; tipo?: 'expense' | 'income' } = {},
): Promise<string> {
  return presupuesto.crear(usuarioId, {
    kind: 'category',
    currency: opciones.moneda ?? 'COP',
    categoryId: categoriaId,
    categoryKind: opciones.tipo ?? 'expense',
    accountId: null,
    label: null,
    amount: '100000',
    mesEfectivoDesde: MES,
  });
}

/** Un movimiento escrito directo por el repository, con o sin ítem. */
async function registrar(
  cuentaId: string,
  monto: string,
  extras: { categoriaId?: string | null; itemId?: string | null; ocurrioEn?: string } = {},
) {
  const movimiento = await movimientos.registrar(db, usuarioId, {
    cuentaId,
    monto,
    ocurrioEn: extras.ocurrioEn ?? DIA_5,
    categoriaId: extras.categoriaId ?? null,
    itemId: extras.itemId ?? null,
  });
  expect(movimiento).not.toBeNull();
  return movimiento!;
}

/** El código de error de Postgres de lo que falle, o `ok` si no falló. */
async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  try {
    await operacion();
  } catch (error) {
    const origen = error as { code?: string; cause?: { code?: string } };
    return origen.cause?.code ?? origen.code ?? 'sin-codigo';
  }
  return 'ok';
}

const FALLA_LLAVE_FORANEA = '23503';
const FALLA_CHECK = '23514';

async function progreso(mes = MES, moneda = 'COP') {
  const filas = await reportes.progresoPorItemEnElMes(usuarioId, mes, moneda);
  return new Map(filas.map((fila) => [fila.itemId, fila]));
}

async function sinAsignar(mes = MES, moneda = 'COP') {
  const filas = await reportes.sinAsignarPorCategoria(usuarioId, mes, moneda);
  return new Map(filas.map((fila) => [fila.categoryId, fila]));
}

// -----------------------------------------------------------------------------

describe('cada ítem suma solo lo suyo', () => {
  it('dos ítems de la misma categoría ya no se repiten el gasto', async () => {
    const cuenta = await crearCuenta();
    const deudas = await crearCategoria('Deudas');
    const dávila = await crearItem(deudas.id);
    const moto = await crearItem(deudas.id);

    await registrar(cuenta.id, '-267530', { categoriaId: deudas.id, itemId: dávila });
    await registrar(cuenta.id, '-100000', { categoriaId: deudas.id, itemId: moto });
    await registrar(cuenta.id, '-5000', { categoriaId: deudas.id });

    const porItem = await progreso();
    expect(porItem.get(dávila)?.gastado).toBe('267530.0000');
    expect(porItem.get(moto)?.gastado).toBe('100000.0000');
    // Lo que no se asignó queda aparte, en la categoría.
    expect((await sinAsignar()).get(deudas.id)?.gastado).toBe('5000.0000');
  });

  it('un ítem sin movimientos no aparece (el service lo toma como cero)', async () => {
    const deudas = await crearCategoria('Deudas');
    const ocioso = await crearItem(deudas.id);

    expect((await progreso()).has(ocioso)).toBe(false);
  });

  it('ítems más "sin asignar" suman lo mismo que la categoría entera', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const mercado = await crearItem(comida.id);
    const calle = await crearItem(comida.id);

    await registrar(cuenta.id, '-40000', { categoriaId: comida.id, itemId: mercado });
    await registrar(cuenta.id, '-25000', { categoriaId: comida.id, itemId: calle });
    await registrar(cuenta.id, '-7000', { categoriaId: comida.id });

    const porItem = await progreso();
    const suelto = (await sinAsignar()).get(comida.id)!;
    const total = await reportes.gastadoEnCategoria(usuarioId, MES, 'COP', comida.id);

    expect(total).toBe('72000.0000');
    expect(
      Number(porItem.get(mercado)!.gastado) + Number(porItem.get(calle)!.gastado) + Number(suelto.gastado),
    ).toBe(72000);
  });

  it('solo cuenta el mes y la moneda pedidos', async () => {
    const cop = await crearCuenta();
    const usd = await crearCuenta({ currency: 'USD' });
    const comida = await crearCategoria('Comida');
    const itemCop = await crearItem(comida.id);
    const itemUsd = await crearItem(comida.id, { moneda: 'USD' });

    await registrar(cop.id, '-1000', { categoriaId: comida.id, itemId: itemCop });
    await registrar(cop.id, '-9000', {
      categoriaId: comida.id,
      itemId: itemCop,
      ocurrioEn: `${MES_PASADO}-10T17:00:00Z`,
    });
    await registrar(usd.id, '-5', { categoriaId: comida.id, itemId: itemUsd });

    expect((await progreso(MES, 'COP')).get(itemCop)?.gastado).toBe('1000.0000');
    expect((await progreso(MES_PASADO, 'COP')).get(itemCop)?.gastado).toBe('9000.0000');
    expect((await progreso(MES, 'USD')).get(itemUsd)?.gastado).toBe('5.0000');
    expect((await progreso(MES, 'USD')).has(itemCop)).toBe(false);
  });

  it('un ingreso asignado cuenta como recibido de su ítem', async () => {
    const cuenta = await crearCuenta();
    const salario = await crearCategoria('Salario', 'income');
    const fijo = await crearItem(salario.id, { tipo: 'income' });
    const extra = await crearItem(salario.id, { tipo: 'income' });

    await registrar(cuenta.id, '3000000', { categoriaId: salario.id, itemId: fijo });
    await registrar(cuenta.id, '200000', { categoriaId: salario.id, itemId: extra });

    const porItem = await progreso();
    expect(porItem.get(fijo)).toMatchObject({ recibido: '3000000.0000', gastado: '0.0000' });
    expect(porItem.get(extra)?.recibido).toBe('200000.0000');
  });
});

describe('anular y corregir', () => {
  it('una anulación se cuenta en el ítem de su original y lo deja en cero', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const item = await crearItem(comida.id);

    const original = await registrar(cuenta.id, '-30000', { categoriaId: comida.id, itemId: item });
    // La anulación del service copia categoría e ítem de su original…
    await movimientos.registrar(db, usuarioId, {
      cuentaId: cuenta.id,
      monto: '30000',
      ocurrioEn: DIA_5,
      categoriaId: comida.id,
      itemId: item,
      anula: original.id,
    });
    expect((await progreso()).get(item)?.gastado).toBe('0.0000');

    // …pero aunque no lo copiara, se clasifica como su original.
    const otro = await registrar(cuenta.id, '-10000', { categoriaId: comida.id, itemId: item });
    await movimientos.registrar(db, usuarioId, {
      cuentaId: cuenta.id,
      monto: '10000',
      ocurrioEn: DIA_5,
      anula: otro.id,
      categoriaId: comida.id,
    });
    expect((await progreso()).get(item)?.gastado).toBe('0.0000');
    expect((await sinAsignar()).get(comida.id)?.gastado ?? '0.0000').toBe('0.0000');
  });

  it('reasignar mueve el gasto de un ítem a otro y a "sin asignar"', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const a = await crearItem(comida.id);
    const b = await crearItem(comida.id);
    const gasto = await registrar(cuenta.id, '-20000', { categoriaId: comida.id, itemId: a });

    await movimientos.asignarItem(db, usuarioId, gasto.id, b);
    expect((await progreso()).get(a)?.gastado ?? '0.0000').toBe('0.0000');
    expect((await progreso()).get(b)?.gastado).toBe('20000.0000');

    await movimientos.asignarItem(db, usuarioId, gasto.id, null);
    expect((await progreso()).has(b)).toBe(false);
    expect((await sinAsignar()).get(comida.id)?.gastado).toBe('20000.0000');
  });

  it('cambiar de categoría deja el movimiento sin ítem; en la misma, lo conserva', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const ocio = await crearCategoria('Ocio');
    const item = await crearItem(comida.id);
    const gasto = await registrar(cuenta.id, '-20000', { categoriaId: comida.id, itemId: item });

    await movimientos.recategorizar(db, usuarioId, gasto.id, comida.id);
    expect((await movimientos.obtener(db, usuarioId, gasto.id))?.budgetItemId).toBe(item);

    await movimientos.recategorizar(db, usuarioId, gasto.id, ocio.id);
    const movido = await movimientos.obtener(db, usuarioId, gasto.id);
    expect(movido).toMatchObject({ categoryId: ocio.id, budgetItemId: null });

    await movimientos.recategorizar(db, usuarioId, gasto.id, null);
    expect((await movimientos.obtener(db, usuarioId, gasto.id))?.budgetItemId).toBeNull();
  });
});

describe('pagar una tarjeta cuenta para su ítem, sin ser gasto', () => {
  it('la pata de salida de la transferencia paga el ítem; no entra en gastos ni en "sin asignar"', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const tarjeta = await crearCuenta({ type: 'card', openingBalance: '-300000' });
    const deudas = await crearCategoria('Deudas');
    const nu = await crearItem(deudas.id);

    const transferencia = await movimientos.registrarTransferencia(usuarioId, {
      origenId: banco.id,
      destinoId: tarjeta.id,
      monto: '102500',
      ocurrioEn: DIA_5,
      itemId: nu,
    });
    expect(transferencia).not.toBeNull();

    // El ítem de la deuda se ve pagado…
    expect((await progreso()).get(nu)?.gastado).toBe('102500.0000');
    // …pero no es gasto del mes ni plata suelta de la categoría.
    expect((await reportes.totalesDelMes(usuarioId, MES, 'COP')).expense).toBe('0.0000');
    expect((await sinAsignar()).has(deudas.id)).toBe(false);

    // La deuda de la tarjeta sí bajó y el banco sí perdió esa plata.
    const [salida, entrada] = transferencia!.patas;
    expect(salida!.budgetItemId).toBe(nu);
    expect(entrada!.budgetItemId).toBeNull();
  });

  it('anular la transferencia deshace el pago del ítem', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const tarjeta = await crearCuenta({ type: 'card', openingBalance: '-300000' });
    const deudas = await crearCategoria('Deudas');
    const nu = await crearItem(deudas.id);

    const transferencia = await movimientos.registrarTransferencia(usuarioId, {
      origenId: banco.id,
      destinoId: tarjeta.id,
      monto: '102500',
      ocurrioEn: DIA_5,
      itemId: nu,
    });
    const grupoNuevo = randomUUID();
    await db.transaction(async (tx) => {
      for (const pata of transferencia!.patas) {
        await movimientos.registrar(tx, usuarioId, {
          cuentaId: pata.accountId,
          monto: pata.amount.startsWith('-') ? pata.amount.slice(1) : `-${pata.amount}`,
          ocurrioEn: DIA_5,
          tipo: 'transfer',
          grupoDeTransferencia: grupoNuevo,
          anula: pata.id,
          itemId: pata.budgetItemId,
        });
      }
      await tx.execute(sql`set constraints all immediate`);
    });

    expect((await progreso()).get(nu)?.gastado).toBe('0.0000');
  });
});

describe('lo que la base no deja pasar', () => {
  it('un ítem de otra categoría', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const ocio = await crearCategoria('Ocio');
    const itemDeOcio = await crearItem(ocio.id);

    expect(
      await codigoDelFallo(() =>
        registrar(cuenta.id, '-1000', { categoriaId: comida.id, itemId: itemDeOcio }),
      ),
    ).toBe(FALLA_LLAVE_FORANEA);
  });

  it('un ítem de otra moneda', async () => {
    const usd = await crearCuenta({ currency: 'USD' });
    const comida = await crearCategoria('Comida');
    const itemCop = await crearItem(comida.id);

    expect(
      await codigoDelFallo(() =>
        registrar(usd.id, '-5', { categoriaId: comida.id, itemId: itemCop }),
      ),
    ).toBe(FALLA_LLAVE_FORANEA);
  });

  it('un ítem de otra persona, también en una transferencia (sin categoría)', async () => {
    const yo = usuarioId;
    usuarioId = await crearUsuario();
    const categoriaAjena = await crearCategoria('Ajena');
    const itemAjeno = await crearItem(categoriaAjena.id);
    usuarioId = yo;

    const banco = await crearCuenta({ openingBalance: '100000' });
    const tarjeta = await crearCuenta({ type: 'card' });

    expect(
      await codigoDelFallo(() =>
        movimientos.registrarTransferencia(usuarioId, {
          origenId: banco.id,
          destinoId: tarjeta.id,
          monto: '1000',
          ocurrioEn: DIA_5,
          itemId: itemAjeno,
        }),
      ),
    ).toBe(FALLA_LLAVE_FORANEA);
  });

  it('un ítem en un movimiento normal sin categoría, y en un ajuste', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const item = await crearItem(comida.id);

    expect(await codigoDelFallo(() => registrar(cuenta.id, '-1000', { itemId: item }))).toBe(
      FALLA_CHECK,
    );
    expect(
      await codigoDelFallo(() =>
        movimientos.registrar(db, usuarioId, {
          cuentaId: cuenta.id,
          monto: '1000',
          ocurrioEn: DIA_5,
          tipo: 'adjustment',
          itemId: item,
        }),
      ),
    ).toBe(FALLA_CHECK);
  });

  it('reasignar a un ítem de otra categoría', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const ocio = await crearCategoria('Ocio');
    const itemDeOcio = await crearItem(ocio.id);
    const gasto = await registrar(cuenta.id, '-1000', { categoriaId: comida.id });

    expect(
      await codigoDelFallo(() => movimientos.asignarItem(db, usuarioId, gasto.id, itemDeOcio)),
    ).toBe(FALLA_LLAVE_FORANEA);
  });

  it('seguir bloqueando el monto: solo categoría e ítem se pueden corregir', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const gasto = await registrar(cuenta.id, '-1000', { categoriaId: comida.id });

    const falla = await codigoDelFallo(
      () =>
        db.execute(sql`update transactions set amount = -2000 where id = ${gasto.id}::uuid`) as Promise<unknown>,
    );
    expect(falla).not.toBe('ok');
    expect((await movimientos.obtener(db, usuarioId, gasto.id))?.amount).toBe('-1000.0000');
  });
});
