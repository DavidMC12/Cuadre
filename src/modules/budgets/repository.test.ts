/**
 * Pruebas de la capa SQL del checklist de presupuesto, contra la base real
 * (rama efímera de Neon). Todavía no hay rutas HTTP para este módulo —esas
 * las escribe quien construya `service.ts`/`routes.ts`—, así que aquí se
 * llama al repository directamente y se usan las rutas de cuentas,
 * categorías y movimientos (ya existentes) solo para preparar los datos.
 *
 * Lo que importa probar aquí es lo que hace único a este módulo: que un
 * monto nuevo nunca reescribe cómo se vio un mes que ya pasó, y que las dos
 * funciones nuevas de `reports` (gastado en una categoría, ahorro de una
 * cuenta puntual) cuentan lo que de verdad se movió.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../../aplicacion.js';
import { closeDb, db } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import * as reportes from '../reports/service.js';
import * as repositorio from './repository.js';

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
// Atajos, calcados de reportes.test.ts

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

const MES = '2026-09';
const MES_ANTERIOR = '2026-08';
const MES_SIGUIENTE = '2026-10';
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

async function crearCategoria(nombre: string): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/categories', {
    name: `${nombre} ${(contador += 1)}`,
    kind: 'expense',
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

async function itemDeCategoria(categoriaId: string, monto: string, mes = MES): Promise<string> {
  return repositorio.crear(usuarioId, {
    kind: 'category',
    currency: 'COP',
    categoryId: categoriaId,
    accountId: null,
    label: null,
    amount: monto,
    mesEfectivoDesde: mes,
  });
}

// -----------------------------------------------------------------------------

describe('mesActual', () => {
  it('devuelve el mes de hoy con la forma "YYYY-MM"', async () => {
    expect(await repositorio.mesActual()).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('gastado en categoría (reports)', () => {
  it('suma solo lo gastado en esa categoría, esa moneda y ese mes', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const otra = await crearCategoria('Otra');

    await registrar(cuenta.id, '-350000', { categoryId: comida.id });
    await registrar(cuenta.id, '-20000', { categoryId: otra.id });
    await registrar(cuenta.id, '-999000', {
      categoryId: comida.id,
      occurredAt: '2026-08-05T17:00:00Z',
    });

    expect(await reportes.gastadoEnCategoria(usuarioId, MES, 'COP', comida.id)).toBe('350000.0000');
  });

  it('un mes sin gasto da cero, no un error', async () => {
    const comida = await crearCategoria('Comida');
    expect(await reportes.gastadoEnCategoria(usuarioId, MES, 'COP', comida.id)).toBe('0.0000');
  });

  it('un gasto anulado no cuenta', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const gasto = await registrar(cuenta.id, '-350000', { categoryId: comida.id });
    await pedir('POST', `/api/v1/transactions/${gasto.id}/reversal`);

    expect(await reportes.gastadoEnCategoria(usuarioId, MES, 'COP', comida.id)).toBe('0.0000');
  });
});

describe('ahorro de una cuenta en el mes (reports)', () => {
  it('cuenta solo esa cuenta puntual, no todas las de ahorro juntas', async () => {
    const ahorro1 = await crearCuenta({ isSavings: true });
    const ahorro2 = await crearCuenta({ isSavings: true });
    await registrar(ahorro1.id, '200000');
    await registrar(ahorro2.id, '999000');

    expect(await reportes.ahorroDeUnaCuentaEnElMes(usuarioId, MES, ahorro1.id)).toBe('200000.0000');
  });

  it('el saldo inicial no cuenta como ahorro de este mes', async () => {
    const ahorro = await crearCuenta({ isSavings: true, openingBalance: '900000' });
    expect(await reportes.ahorroDeUnaCuentaEnElMes(usuarioId, MES, ahorro.id)).toBe('0.0000');
  });
});

describe('versionado del objetivo por mes', () => {
  it('cambiar el monto no reescribe un mes que ya pasó', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');

    await repositorio.agregarObjetivo(usuarioId, itemId, '400000', MES_SIGUIENTE);

    const [deEsteMes] = await repositorio.objetivosDelMes(usuarioId, MES, 'COP');
    const [delSiguiente] = await repositorio.objetivosDelMes(usuarioId, MES_SIGUIENTE, 'COP');

    expect(deEsteMes!.target).toBe('350000.0000');
    expect(delSiguiente!.target).toBe('400000.0000');
  });

  it('un mes anterior a que el ítem existiera no tiene objetivo (null, no cero)', async () => {
    const comida = await crearCategoria('Comida');
    await itemDeCategoria(comida.id, '350000');

    const [deAntes] = await repositorio.objetivosDelMes(usuarioId, MES_ANTERIOR, 'COP');
    expect(deAntes!.target).toBeNull();
  });

  it('dos ajustes en el mismo mes: gana el más reciente', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '300000');
    await repositorio.agregarObjetivo(usuarioId, itemId, '350000', MES);

    const [item] = await repositorio.objetivosDelMes(usuarioId, MES, 'COP');
    expect(item!.target).toBe('350000.0000');
  });
});

describe('archivar', () => {
  it('un ítem archivado no sale en el checklist de ningún mes', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');

    expect(await repositorio.archivar(usuarioId, itemId)).toBe(true);
    expect(await repositorio.objetivosDelMes(usuarioId, MES, 'COP')).toEqual([]);
  });

  it('sí sale si se pide incluir archivados en el listado de gestión', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');
    await repositorio.archivar(usuarioId, itemId);

    expect(await repositorio.listar(usuarioId, MES, false)).toEqual([]);
    expect(await repositorio.listar(usuarioId, MES, true)).toHaveLength(1);
  });
});

describe('aislamiento entre usuarios', () => {
  it('agregarObjetivo no deja tocar un ítem de otro usuario', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');

    const otroUsuarioId = await crearUsuario();
    expect(await repositorio.agregarObjetivo(otroUsuarioId, itemId, '999999', MES)).toBe(false);

    const [item] = await repositorio.objetivosDelMes(usuarioId, MES, 'COP');
    expect(item!.target).toBe('350000.0000');
  });

  it('archivar no deja tocar un ítem de otro usuario', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');

    const otroUsuarioId = await crearUsuario();
    expect(await repositorio.archivar(otroUsuarioId, itemId)).toBe(false);
  });
});

describe('la base exige que el ítem tenga sentido con su tipo', () => {
  it('rechaza un ítem de categoría sin category_id', async () => {
    await expect(
      repositorio.crear(usuarioId, {
        kind: 'category',
        currency: 'COP',
        categoryId: null,
        accountId: null,
        label: null,
        amount: '100000',
        mesEfectivoDesde: MES,
      }),
    ).rejects.toThrow();
  });

  it('rechaza un ítem de ahorro cuya moneda no es la de la cuenta', async () => {
    const ahorroUsd = await crearCuenta({ isSavings: true, currency: 'USD' });

    await expect(
      repositorio.crear(usuarioId, {
        kind: 'savings',
        currency: 'COP',
        categoryId: null,
        accountId: ahorroUsd.id,
        label: null,
        amount: '100',
        mesEfectivoDesde: MES,
      }),
    ).rejects.toThrow();
  });
});
