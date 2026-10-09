/**
 * Pruebas de la lógica de negocio del checklist, llamando al service directo
 * (sin HTTP): aquí se prueba la validación de entrada que el service hace por
 * su cuenta — mes con formato "YYYY-MM" y monto positivo exacto — porque no
 * puede depender de que la ruta haya pasado antes por Zod.
 *
 * El versionado de montos entre meses se prueba en `repository.test.ts`
 * (contra la base, donde vive) y en `presupuesto.test.ts` (punta a punta).
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from '../../aplicacion.js';
import { closeDb, db } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import * as repositorio from './repository.js';
import * as servicio from './service.js';

let app: FastifyInstance;
let usuarioId: string;

async function crearUsuario(): Promise<string> {
  const [usuario] = await db
    .insert(users)
    .values({ email: `presupuesto-svc-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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

function mesRelativo(desplazamiento: number): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  const anio = Number(partes.find((parte) => parte.type === 'year')!.value);
  const mes = Number(partes.find((parte) => parte.type === 'month')!.value);

  const corrido = anio * 12 + (mes - 1) + desplazamiento;
  return `${Math.floor(corrido / 12)}-${String((corrido % 12) + 1).padStart(2, '0')}`;
}

const MES = mesRelativo(0);
const MES_SIGUIENTE = mesRelativo(1);
const DIA_15 = `${MES}-15T17:00:00Z`;

let contador = 0;

async function crearCategoriaDeGasto(): Promise<string> {
  const respuesta = await app.inject({
    method: 'POST',
    url: '/api/v1/categories',
    payload: { name: `Mercado ${(contador += 1)}`, kind: 'expense' },
  });
  expect(respuesta.statusCode).toBe(201);
  return respuesta.json().data.id;
}

async function crearCategoriaDeIngreso(): Promise<string> {
  const respuesta = await app.inject({
    method: 'POST',
    url: '/api/v1/categories',
    payload: { name: `Salario ${(contador += 1)}`, kind: 'income' },
  });
  expect(respuesta.statusCode).toBe(201);
  return respuesta.json().data.id;
}

async function registrarIngreso(
  cuentaId: string,
  monto: string,
  categoriaId: string,
  itemId?: string,
): Promise<void> {
  const respuesta = await app.inject({
    method: 'POST',
    url: '/api/v1/transactions',
    payload: {
      accountId: cuentaId,
      amount: monto,
      categoryId: categoriaId,
      ...(itemId === undefined ? {} : { budgetItemId: itemId }),
      occurredAt: DIA_15,
    },
  });
  expect(respuesta.statusCode, respuesta.body ?? '').toBe(201);
}

// -----------------------------------------------------------------------------

describe('fijarObjetivoDelMes (service)', () => {
  it('fija el monto del mes pedido, y el actual queda como estaba', async () => {
    const categoriaId = await crearCategoriaDeGasto();
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: categoriaId,
      currency: 'COP',
      amount: '100000',
    });

    const fijado = await servicio.fijarObjetivoDelMes(usuarioId, item.id, MES_SIGUIENTE, '120000');

    // El service responde con el item visto hoy; el mes fijado se lee del repo.
    expect(fijado.currentAmount).toBe('100000.0000');
    const delSiguiente = await repositorio.obtener(usuarioId, item.id, MES_SIGUIENTE);
    expect(delSiguiente!.currentAmount).toBe('120000.0000');
  });

  it('crearItem acepta el mes del primer monto, aunque ya haya pasado', async () => {
    const categoriaId = await crearCategoriaDeGasto();
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: categoriaId,
      currency: 'COP',
      amount: '100000',
      month: mesRelativo(-1),
    });

    const delPasado = await repositorio.obtener(usuarioId, item.id, mesRelativo(-1));
    expect(delPasado!.currentAmount).toBe('100000.0000');
  });

  it('rechaza un mes mal escrito con 422, sin depender de la validación de la ruta', async () => {
    const categoriaId = await crearCategoriaDeGasto();
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: categoriaId,
      currency: 'COP',
      amount: '100000',
    });

    await expect(
      servicio.fijarObjetivoDelMes(usuarioId, item.id, '2026-3', '200000'),
    ).rejects.toMatchObject({ codigo: 'RULE_VIOLATION' });
    await expect(
      servicio.crearItem(usuarioId, {
        kind: 'category',
        categoryId: categoriaId,
        currency: 'COP',
        amount: '100000',
        month: '01/2026',
      }),
    ).rejects.toMatchObject({ codigo: 'RULE_VIOLATION' });
  });

  it('rechaza un monto negativo o mal escrito con 422, todo en texto exacto', async () => {
    const categoriaId = await crearCategoriaDeGasto();
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: categoriaId,
      currency: 'COP',
      amount: '100000',
    });

    for (const amount of ['-50', '-0', 'abc', '']) {
      await expect(
        servicio.fijarObjetivoDelMes(usuarioId, item.id, MES, amount),
      ).rejects.toMatchObject({ codigo: 'RULE_VIOLATION' });
    }
  });

  it('responde NOT_FOUND si el ítem no existe o es de otro usuario', async () => {
    await expect(
      servicio.fijarObjetivoDelMes(usuarioId, randomUUID(), MES, '200000'),
    ).rejects.toMatchObject({ codigo: 'NOT_FOUND' });
  });
});

describe('un mes sin monto: cero = "este mes no aplica" (service)', () => {
  async function cuentaNueva(): Promise<string> {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      payload: { name: `Cuenta ${(contador += 1)}`, type: 'bank', currency: 'COP' },
    });
    expect(respuesta.statusCode).toBe(201);
    return respuesta.json().data.id;
  }

  it('acepta cero al fijar un mes, y solo ese mes: el siguiente no lo hereda', async () => {
    const categoriaId = await crearCategoriaDeGasto();
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: categoriaId,
      currency: 'COP',
      amount: '100000',
    });

    for (const cero of ['0', '0.0000']) {
      await servicio.fijarObjetivoDelMes(usuarioId, item.id, MES, cero);
    }

    const esteMes = await repositorio.obtener(usuarioId, item.id, MES);
    const siguiente = await repositorio.obtener(usuarioId, item.id, MES_SIGUIENTE);
    expect(esteMes!.currentAmount).toBe('0.0000');
    // El agua de este mes no apaga el renglón para siempre.
    expect(siguiente!.currentAmount).toBe('100000.0000');
  });

  it('un cero en un mes futuro, escrito como "00", no apaga los meses de después', async () => {
    const categoriaId = await crearCategoriaDeGasto();
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: categoriaId,
      currency: 'COP',
      amount: '100000',
    });

    await servicio.fijarObjetivoDelMes(usuarioId, item.id, MES_SIGUIENTE, '00');

    expect((await repositorio.obtener(usuarioId, item.id, MES))!.currentAmount).toBe('100000.0000');
    expect((await repositorio.obtener(usuarioId, item.id, MES_SIGUIENTE))!.currentAmount).toBe(
      '0.0000',
    );
    // El mes de después del futuro hereda el monto de antes del cero, no el cero.
    expect((await repositorio.obtener(usuarioId, item.id, mesRelativo(2)))!.currentAmount).toBe(
      '100000.0000',
    );
  });

  it('un ítem nuevo sigue naciendo con un monto positivo: el cero, escrito como sea, se rechaza', async () => {
    const categoriaId = await crearCategoriaDeGasto();
    // El cero escrito de cualquier forma: antes la base lo frenaba con
    // `amount > 0`; ahora la única red es la validación.
    for (const amount of ['0', '0.0000', '00', '000.0000', '00.00']) {
      await expect(
        servicio.crearItem(usuarioId, {
          kind: 'category',
          categoryId: categoriaId,
          currency: 'COP',
          amount,
        }),
        amount,
      ).rejects.toMatchObject({ codigo: 'RULE_VIOLATION' });
    }
  });

  it('un cero con ceros de más ("00") también rige solo ese mes', async () => {
    const categoriaId = await crearCategoriaDeGasto();
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: categoriaId,
      currency: 'COP',
      amount: '100000',
    });

    await servicio.fijarObjetivoDelMes(usuarioId, item.id, MES, '00');

    expect((await repositorio.obtener(usuarioId, item.id, MES))!.currentAmount).toBe('0.0000');
    expect((await repositorio.obtener(usuarioId, item.id, MES_SIGUIENTE))!.currentAmount).toBe(
      '100000.0000',
    );
  });

  it('se puede volver a poner monto en un mes que estaba en cero', async () => {
    const categoriaId = await crearCategoriaDeGasto();
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: categoriaId,
      currency: 'COP',
      amount: '100000',
    });

    await servicio.fijarObjetivoDelMes(usuarioId, item.id, MES, '0');
    await servicio.fijarObjetivoDelMes(usuarioId, item.id, MES, '80000');

    expect((await repositorio.obtener(usuarioId, item.id, MES))!.currentAmount).toBe('80000.0000');
    expect((await repositorio.obtener(usuarioId, item.id, MES_SIGUIENTE))!.currentAmount).toBe(
      '100000.0000',
    );
  });

  it('en el checklist, un objetivo de cero nunca es logro (ingreso)', async () => {
    const categoriaId = await crearCategoriaDeIngreso();
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: categoriaId,
      currency: 'COP',
      amount: '400000',
    });
    await servicio.fijarObjetivoDelMes(usuarioId, item.id, MES, '0');

    const { data } = await servicio.checklistDelMes(usuarioId, { month: MES, currency: 'COP' });
    expect(data.items.find((i) => i.id === item.id)).toMatchObject({
      target: '0.0000',
      progress: '0.0000',
      status: 'none',
      checked: false,
      exceeded: false,
    });

    // Aunque llegue plata de esa categoría, un cero no es una meta que cumplir.
    await registrarIngreso(await cuentaNueva(), '100000', categoriaId, item.id);
    const despues = await servicio.checklistDelMes(usuarioId, { month: MES, currency: 'COP' });
    expect(despues.data.items.find((i) => i.id === item.id)).toMatchObject({
      status: 'none',
      checked: false,
      exceeded: false,
    });
  });

  it('en el checklist, gastar sobre un tope de cero sí es pasarse; no gastar no avisa nada', async () => {
    const categoriaId = await crearCategoriaDeGasto();
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: categoriaId,
      currency: 'COP',
      amount: '100000',
    });
    await servicio.fijarObjetivoDelMes(usuarioId, item.id, MES, '0');

    const sinGasto = await servicio.checklistDelMes(usuarioId, { month: MES, currency: 'COP' });
    expect(sinGasto.data.items.find((i) => i.id === item.id)).toMatchObject({
      target: '0.0000',
      status: 'none',
      checked: false,
      exceeded: false,
    });

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      payload: {
        accountId: await cuentaNueva(),
        amount: '-30000',
        categoryId: categoriaId,
        budgetItemId: item.id,
        occurredAt: DIA_15,
      },
    });
    expect(respuesta.statusCode, respuesta.body ?? '').toBe(201);

    const conGasto = await servicio.checklistDelMes(usuarioId, { month: MES, currency: 'COP' });
    expect(conGasto.data.items.find((i) => i.id === item.id)).toMatchObject({
      progress: '30000.0000',
      status: 'exceeded',
      checked: false,
      exceeded: true,
    });
  });
});

describe('checklist de ingresos (service)', () => {
  it('un renglón de ingreso se mide por lo recibido: llegar o más es logro, nunca un aviso rojo', async () => {
    const categoriaId = await crearCategoriaDeIngreso();
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: categoriaId,
      currency: 'COP',
      amount: '400000',
    });
    const itemId = item.id;

    const { estado, cuerpo } = await app
      .inject({
        method: 'POST',
        url: '/api/v1/accounts',
        payload: { name: `Cuenta ${(contador += 1)}`, type: 'bank', currency: 'COP' },
      })
      .then((r) => ({ estado: r.statusCode, cuerpo: r.json() }));
    expect(estado).toBe(201);

    // Recibió más de lo esperado: el logro se enciende y JAMÁS hay 'exceeded',
    // porque ganar de más no es algo que avisar en rojo. El ingreso se asigna
    // a su ítem: sin ítem no sumaría a ningún renglón.
    await registrarIngreso(cuerpo.data.id, '500000', categoriaId, itemId);

    const { data } = await servicio.checklistDelMes(usuarioId, { month: MES, currency: 'COP' });
    const renglon = data.items.find((i) => i.id === itemId);
    expect(renglon).toMatchObject({
      kind: 'category',
      categoryKind: 'income',
      target: '400000.0000',
      progress: '500000.0000',
      checked: true,
      exceeded: false,
    });
  });

  it('recibir menos de lo esperado es falta: checked en false, sin exceso', async () => {
    const categoriaId = await crearCategoriaDeIngreso();
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: categoriaId,
      currency: 'COP',
      amount: '400000',
    });
    const itemId = item.id;

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      payload: { name: `Cuenta ${(contador += 1)}`, type: 'bank', currency: 'COP' },
    });
    const cuenta = respuesta.json().data;
    await registrarIngreso(cuenta.id, '100000', categoriaId, itemId);

    const { data } = await servicio.checklistDelMes(usuarioId, { month: MES, currency: 'COP' });
    const renglon = data.items.find((i) => i.id === itemId);
    expect(renglon).toMatchObject({
      progress: '100000.0000',
      checked: false,
      exceeded: false,
    });
  });

  it('un renglón de ingresos no se contaminó con lo gastado en categorías de gasto', async () => {
    const ingresoId = await crearCategoriaDeIngreso();

    const banco = await app
      .inject({
        method: 'POST',
        url: '/api/v1/accounts',
        payload: { name: `Cuenta ${(contador += 1)}`, type: 'bank', currency: 'COP' },
      })
      .then((r) => r.json().data);

    // El ítem de ingresos se crea primero para poder asignarle lo recibido.
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: ingresoId,
      currency: 'COP',
      amount: '600000',
    });

    await registrarIngreso(banco.id, '800000', ingresoId, item.id);
    const gasto = await app
      .inject({
        method: 'POST',
        url: '/api/v1/transactions',
        payload: { accountId: banco.id, amount: '-75000', occurredAt: DIA_15 },
      })
      .then((r) => r.json().data);
    expect(gasto.id).toBeDefined();

    const { data } = await servicio.checklistDelMes(usuarioId, { month: MES, currency: 'COP' });
    const renglon = data.items.find((i) => i.id === item.id);
    expect(renglon!.progress).toBe('800000.0000');
  });
});

describe('estadoDelItem (función pura)', () => {
  const gasto = { kind: 'category' as const, categoryKind: 'expense' as const };
  const ingreso = { kind: 'category' as const, categoryKind: 'income' as const };
  const ahorro = { kind: 'savings' as const, categoryKind: null };

  it('sin meta (el ítem no existía ese mes) no hay estado', () => {
    expect(servicio.estadoDelItem(gasto, null, '0.0000')).toBe('none');
    expect(servicio.estadoDelItem(ingreso, null, '500000.0000')).toBe('none');
    expect(servicio.estadoDelItem(ahorro, null, '0.0000')).toBe('none');
  });

  it('meta de cero ("este mes no aplica"): solo un tope de gasto puede excederse', () => {
    // Tope de gasto: gastar algo cuando se dijo "no gasto nada" es un exceso.
    expect(servicio.estadoDelItem(gasto, '0', '0.0000')).toBe('none');
    expect(servicio.estadoDelItem(gasto, '0.0000', '30000.0000')).toBe('exceeded');
    // Ingreso y ahorro: recibir o ahorrar cuando no había meta no es un logro
    // ni una falta; nunca se marca "excedido".
    expect(servicio.estadoDelItem(ingreso, '0', '0.0000')).toBe('none');
    expect(servicio.estadoDelItem(ingreso, '00', '1000.0000')).toBe('none');
    expect(servicio.estadoDelItem(ahorro, '0', '0.0000')).toBe('none');
    expect(servicio.estadoDelItem(ahorro, '0', '5000.0000')).toBe('none');
  });

  it('tabla de casos: tope de gasto', () => {
    expect(servicio.estadoDelItem(gasto, '100000', '0.0000')).toBe('pending');
    expect(servicio.estadoDelItem(gasto, '100000', '40000.0000')).toBe('partial');
    expect(servicio.estadoDelItem(gasto, '100000', '100000.0000')).toBe('paid');
    expect(servicio.estadoDelItem(gasto, '100000', '100000.0001')).toBe('exceeded');
    // Un monto negativo (una devolución) no es "algo": sigue pendiente.
    expect(servicio.estadoDelItem(gasto, '100000', '-5000.0000')).toBe('pending');
  });

  it('tabla de casos: ingreso y ahorro (recibir o ahorrar de más nunca es exceso)', () => {
    for (const item of [ingreso, ahorro]) {
      expect(servicio.estadoDelItem(item, '100000', '0.0000')).toBe('pending');
      expect(servicio.estadoDelItem(item, '100000', '40000.0000')).toBe('partial');
      expect(servicio.estadoDelItem(item, '100000', '100000.0000')).toBe('paid');
      expect(servicio.estadoDelItem(item, '100000', '250000.0000')).toBe('paid');
      expect(servicio.estadoDelItem(item, '100000', '-1000.0000')).toBe('pending');
    }
  });
});
