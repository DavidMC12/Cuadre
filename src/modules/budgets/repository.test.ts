/**
 * Pruebas de la capa SQL del checklist de presupuesto, contra la base real
 * (rama efímera de Neon). Todavía no hay rutas HTTP para este módulo —esas
 * las escribe quien construya `service.ts`/`routes.ts`—, así que aquí se
 * llama al repository directamente y se usan las rutas de cuentas,
 * categorías y movimientos (ya existentes) solo para preparar los datos.
 *
 * Lo que importa probar aquí es lo que hace único a este módulo: que cada mes
 * del checklist tiene su monto propio (fijable también en meses ya pasados,
 * ver `fijarObjetivoDelMes`) y que las dos funciones nuevas de `reports`
 * (gastado en una categoría, ahorro de una cuenta puntual) cuentan lo que de
 * verdad se movió.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../../aplicacion.js';
import { closeDb, db } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import { traducirErrorDePostgres } from '../../http/errores.js';
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
 * Los meses se calculan relativos a "hoy" y no se escriben fijos:
 * `crear` usa por defecto el mes actual, y las pruebas de fijar un mes pasado
 * necesitan saber qué es "pasado" — una fecha escrita a mano dejaría de serlo
 * el día en que estas pruebas corran después de esa fecha, y el archivo
 * empezaría a fallar solo.
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
    categoryKind: 'expense',
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

describe('fijarObjetivoDelMes', () => {
  it('fija el monto de un mes ya pasado sin mover el actual ni el siguiente', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');

    // "El mercado de enero se cambió a 200000": enero ya pasó y el monto se
    // arregla igual, pero el mes actual y el siguiente siguen viéndose como
    // se veían — fijar un mes no reescribe a nadie más: para eso está el
    // ancla del mes siguiente en el repository.
    expect(await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES_ANTERIOR, '200000')).toBe(
      true,
    );

    const [deAntes] = await repositorio.objetivosDelMes(usuarioId, MES_ANTERIOR, 'COP');
    const [deEsteMes] = await repositorio.objetivosDelMes(usuarioId, MES, 'COP');
    const [delSiguiente] = await repositorio.objetivosDelMes(usuarioId, MES_SIGUIENTE, 'COP');

    expect(deAntes!.target).toBe('200000.0000');
    expect(deEsteMes!.target).toBe('350000.0000');
    expect(delSiguiente!.target).toBe('350000.0000');
  });

  it('editar un mes no arranca el monto de otro mes que ya tiene fila propia', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '300000');
    await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES_SIGUIENTE, '500000');

    await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES, '400000');

    const [deEsteMes] = await repositorio.objetivosDelMes(usuarioId, MES, 'COP');
    const [delSiguiente] = await repositorio.objetivosDelMes(usuarioId, MES_SIGUIENTE, 'COP');
    expect(deEsteMes!.target).toBe('400000.0000');
    // El mes siguiente ya tenía su propio 500000: este mes no lo toca.
    expect(delSiguiente!.target).toBe('500000.0000');
  });

  it('ediciones repetidas del mismo mes: gana la última, y el futuro sigue heredando', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '300000');

    await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES, '400000');
    await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES, '450000');

    const [deEsteMes] = await repositorio.objetivosDelMes(usuarioId, MES, 'COP');
    const [delSiguiente] = await repositorio.objetivosDelMes(usuarioId, MES_SIGUIENTE, 'COP');
    expect(deEsteMes!.target).toBe('450000.0000');
    // El mes siguiente es futuro: no se ancla, hereda el monto final — subir
    // el tope de hoy rige "de aquí en adelante".
    expect(delSiguiente!.target).toBe('450000.0000');
  });

  it('no deja fijar el monto de un ítem que no es de este usuario', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');

    const otroUsuarioId = await crearUsuario();
    expect(await repositorio.fijarObjetivoDelMes(otroUsuarioId, itemId, MES, '999999')).toBe(false);

    const [item] = await repositorio.objetivosDelMes(usuarioId, MES, 'COP');
    expect(item!.target).toBe('350000.0000');
  });

  it('un monto de cero rige solo ese mes: el siguiente, aunque sea futuro, se ancla al anterior', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '300000');

    await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES, '0');

    const [deEsteMes] = await repositorio.objetivosDelMes(usuarioId, MES, 'COP');
    const [delSiguiente] = await repositorio.objetivosDelMes(usuarioId, MES_SIGUIENTE, 'COP');
    expect(deEsteMes!.target).toBe('0.0000');
    expect(delSiguiente!.target).toBe('300000.0000');
  });

  it('cero en un mes cuyo siguiente ya tiene su propio monto no lo pisa', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '300000');
    await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES_SIGUIENTE, '500000');

    await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES, '0');

    const [delSiguiente] = await repositorio.objetivosDelMes(usuarioId, MES_SIGUIENTE, 'COP');
    expect(delSiguiente!.target).toBe('500000.0000');
  });

  it('la base de datos no deja un monto negativo en un mes', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '300000');

    // Que sea ESA regla la que dispara (no un NOT NULL ni una llave foránea) y
    // que el borde la traduzca a un mensaje, no al genérico.
    const error = await db
      .execute(sql`
        insert into budget_item_targets (budget_item_id, effective_from, amount)
        values (${itemId}::uuid, (${MES}::text || '-01')::date, -1)
      `)
      .then(
        () => null,
        (causa: unknown) => causa,
      );
    expect(error).not.toBeNull();
    expect(traducirErrorDePostgres(error)).toMatchObject({
      estado: 422,
      mensaje: 'El monto del objetivo no puede ser negativo.',
    });
  });

  it('dos ceros seguidos en el mismo mes no agregan filas ni mueven el siguiente', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '300000');

    await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES, '0');
    await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES, '0.0000');

    const filas = (await db.execute(sql`
      select count(*)::int as n from budget_item_targets where budget_item_id = ${itemId}::uuid
    `)) as unknown as { n: number }[];
    // La del ítem al crearse, la del cero y el ancla del mes siguiente.
    expect(filas[0]!.n).toBe(3);

    const [delSiguiente] = await repositorio.objetivosDelMes(usuarioId, MES_SIGUIENTE, 'COP');
    expect(delSiguiente!.target).toBe('300000.0000');
  });

  it('un cero no toca los meses de después del siguiente: heredan del ancla', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '300000');

    await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES, '0');

    const [dentroDeDos] = await repositorio.objetivosDelMes(usuarioId, mesRelativo(2).etiqueta, 'COP');
    expect(dentroDeDos!.target).toBe('300000.0000');
  });

  it('repetir el mismo monto en el mismo mes no agrega filas', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '300000');

    // La fila original ya dice 300000: el reintento (doble toque, webhook
    // repetido) debe terminar sin insertar nada.
    await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES, '300000');

    const [cuenta] = (await db.execute(sql`
      select count(*)::int as n from budget_item_targets where budget_item_id = ${itemId}::uuid
    `)) as unknown as { n: number }[];
    expect(Number(cuenta!.n)).toBe(1);
  });

  it('subir el monto del mes actual cambia también los meses futuros que no tienen fila propia', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '300000');

    await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES, '600000');

    const [delSiguiente] = await repositorio.objetivosDelMes(usuarioId, MES_SIGUIENTE, 'COP');
    expect(delSiguiente!.target).toBe('600000.0000');
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

describe('ítem de categoría de ingresos', () => {
  it('se crea con el tipo de ingreso copiado de la categoría y lo devuelve en categoryKind', async () => {
    const salario = await crearCategoria('Salario', 'income');
    const itemId = await repositorio.crear(usuarioId, {
      kind: 'category',
      currency: 'COP',
      categoryId: salario.id,
      categoryKind: 'income',
      accountId: null,
      label: null,
      amount: '900000',
      mesEfectivoDesde: MES,
    });

    const [item] = await repositorio.objetivosDelMes(usuarioId, MES, 'COP');
    expect(item).toMatchObject({
      id: itemId,
      kind: 'category',
      categoryKind: 'income',
      target: '900000.0000',
    });
  });
});

describe('ítem de ahorro', () => {
  it('se crea contra una cuenta de ahorro real y se lee de vuelta con su nombre', async () => {
    const ahorro = await crearCuenta({ isSavings: true });
    const itemId = await repositorio.crear(usuarioId, {
      kind: 'savings',
      currency: 'COP',
      categoryId: null,
      categoryKind: null,
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
  it('fijarObjetivoDelMes no deja tocar un ítem de otro usuario', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');

    const otroUsuarioId = await crearUsuario();
    expect(await repositorio.fijarObjetivoDelMes(otroUsuarioId, itemId, MES, '999999')).toBe(false);

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
        categoryKind: 'expense',
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
        categoryKind: null,
        accountId: ahorroUsd.id,
        label: null,
        amount: '100',
        mesEfectivoDesde: MES,
      }),
    ).rejects.toThrow();
  });

  it('la llave foránea rechaza un category_kind que no es el real de la categoría', async () => {
    const sueldo = await crearCategoria('Sueldo', 'income');

    await expect(
      repositorio.crear(usuarioId, {
        kind: 'category',
        currency: 'COP',
        categoryId: sueldo.id,
        categoryKind: 'expense',
        accountId: null,
        label: null,
        amount: '100000',
        mesEfectivoDesde: MES,
      }),
    ).rejects.toThrow();
  });

  it('la llave foránea rechaza una categoría que no es de este usuario', async () => {
    const comida = await crearCategoria('Comida');
    const otroUsuarioId = await crearUsuario();

    await expect(
      repositorio.crear(otroUsuarioId, {
        kind: 'category',
        currency: 'COP',
        categoryId: comida.id,
        categoryKind: 'expense',
        accountId: null,
        label: null,
        amount: '100000',
        mesEfectivoDesde: MES,
      }),
    ).rejects.toThrow();
  });
});

/**
 * Con la migración 0008 ya se PUEDE insertar un monto con `effective_from` en
 * un mes pasado (fijar el mercado de enero, aunque sea octubre) — la primera
 * versión de este archivo probaba lo contrario, cuando un disparador de 0006
 * lo bloqueaba. Lo que sigue firme, y garantizado por la base y no por la
 * app, es que un monto NUNCA se pisa: solo se agrega, nunca se edita ni se
 * borra.
 */
describe('un monto de presupuesto nunca se pisa, ni siquiera a mano', () => {
  it('un monto pasado se inserta hoy, sin que eso edite nada ya guardado', async () => {
    const comida = await crearCategoria('Comida');
    const itemId = await itemDeCategoria(comida.id, '350000');

    await repositorio.fijarObjetivoDelMes(usuarioId, itemId, MES_ANTERIOR, '200000');

    // El monto viejo del mes actual sigue intacto: insertar filas nuevas no
    // reescribe las ya guardadas.
    const [item] = await repositorio.objetivosDelMes(usuarioId, MES, 'COP');
    expect(item!.target).toBe('350000.0000');
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
