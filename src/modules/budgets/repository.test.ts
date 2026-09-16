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
import { sql } from 'drizzle-orm';
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

/**
 * Los meses se calculan relativos a "hoy" y no se escriben fijos: desde que
 * `agregarObjetivo`/`crear` pasan por el disparador que rechaza un mes
 * atrasado (ver la migración `drizzle/0006_fancy_magdalene.sql`), un mes
 * escrito a mano dejaría de ser "el mes actual" el día en que estas pruebas
 * corran después de esa fecha, y todo el archivo empezaría a fallar solo.
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

const MES = mesRelativo(0).etiqueta;
const MES_ANTERIOR = mesRelativo(-1).etiqueta;
const MES_SIGUIENTE = mesRelativo(1).etiqueta;
const DIA_5 = mesRelativo(0).fecha;

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

async function crearCategoria(
  nombre: string,
  kind: 'expense' | 'income' = 'expense',
): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/categories', {
    name: `${nombre} ${(contador += 1)}`,
    kind,
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
      occurredAt: mesRelativo(-1).fecha,
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

describe('obtener', () => {
  it('trae un ítem por id con el nombre de su categoría y su monto vigente', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');

    const item = await repositorio.obtener(usuarioId, itemId, MES);
    expect(item).toMatchObject({
      id: itemId,
      kind: 'category',
      categoryName: comida.name,
      currentAmount: '350000.0000',
    });
  });

  it('devuelve null si el ítem no existe o es de otro usuario', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');
    const otroUsuarioId = await crearUsuario();

    expect(await repositorio.obtener(otroUsuarioId, itemId, MES)).toBeNull();
  });
});

describe('listar', () => {
  it('trae el monto vigente de cada ítem, no solo su existencia', async () => {
    const comida = await crearCategoria('Comida');
    await itemDeCategoria(comida.id, '350000');

    const [item] = await repositorio.listar(usuarioId, MES, false);
    expect(item!.currentAmount).toBe('350000.0000');
  });
});

describe('ítem de ahorro', () => {
  it('se crea contra una cuenta de ahorro real y se lee de vuelta con su nombre', async () => {
    const ahorro = await crearCuenta({ isSavings: true });
    const itemId = await repositorio.crear(usuarioId, {
      kind: 'savings',
      currency: 'COP',
      categoryId: null,
      accountId: ahorro.id,
      label: null,
      amount: '200000',
      mesEfectivoDesde: MES,
    });

    const [item] = await repositorio.objetivosDelMes(usuarioId, MES, 'COP');
    expect(item).toMatchObject({
      id: itemId,
      kind: 'savings',
      accountId: ahorro.id,
      accountName: ahorro.name,
      target: '200000.0000',
    });
  });
});

describe('archivar', () => {
  it('un ítem archivado sigue en el checklist de los meses en que estuvo activo', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');

    expect(await repositorio.archivar(usuarioId, itemId)).toBe(true);

    const [esteMes] = await repositorio.objetivosDelMes(usuarioId, MES, 'COP');
    expect(esteMes!.target).toBe('350000.0000');
  });

  it('un ítem archivado deja de aparecer desde el mes siguiente en adelante', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');
    await repositorio.archivar(usuarioId, itemId);

    expect(await repositorio.objetivosDelMes(usuarioId, MES_SIGUIENTE, 'COP')).toEqual([]);
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

  it('editarEtiqueta no deja tocar un ítem de otro usuario', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');

    const otroUsuarioId = await crearUsuario();
    expect(await repositorio.editarEtiqueta(otroUsuarioId, itemId, 'Otro nombre')).toBe(false);
  });

  it('desarchivar no deja tocar un ítem de otro usuario', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');
    await repositorio.archivar(usuarioId, itemId);

    const otroUsuarioId = await crearUsuario();
    expect(await repositorio.desarchivar(otroUsuarioId, itemId)).toBe(false);
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

  it('rechaza un ítem de categoría cuya categoría es de ingresos', async () => {
    const sueldo = await crearCategoria('Sueldo', 'income');

    await expect(
      repositorio.crear(usuarioId, {
        kind: 'category',
        currency: 'COP',
        categoryId: sueldo.id,
        accountId: null,
        label: null,
        amount: '100000',
        mesEfectivoDesde: MES,
      }),
    ).rejects.toThrow();
  });
});

describe('un monto de presupuesto nunca reescribe el pasado, ni siquiera a mano', () => {
  it('rechaza crear un ítem con el monto efectivo en un mes ya pasado', async () => {
    const comida = await crearCategoria('Comida');

    await expect(
      repositorio.crear(usuarioId, {
        kind: 'category',
        currency: 'COP',
        categoryId: comida.id,
        accountId: null,
        label: null,
        amount: '100000',
        mesEfectivoDesde: MES_ANTERIOR,
      }),
    ).rejects.toThrow();
  });

  it('rechaza agregar un objetivo con el monto efectivo en un mes ya pasado', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');

    await expect(
      repositorio.agregarObjetivo(usuarioId, itemId, '400000', MES_ANTERIOR),
    ).rejects.toThrow();
  });

  it('rechaza modificar o borrar un monto ya guardado, incluso con SQL directo', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');

    await expect(
      db.execute(
        sql`update budget_item_targets set amount = '999999' where budget_item_id = ${itemId}::uuid`,
      ),
    ).rejects.toThrow();

    await expect(
      db.execute(sql`delete from budget_item_targets where budget_item_id = ${itemId}::uuid`),
    ).rejects.toThrow();

    // Ninguno de los dos intentos dejó rastro: el monto original sigue intacto.
    const [item] = await repositorio.objetivosDelMes(usuarioId, MES, 'COP');
    expect(item!.target).toBe('350000.0000');
  });
});
