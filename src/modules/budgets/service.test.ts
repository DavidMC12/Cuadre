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
): Promise<void> {
  const respuesta = await app.inject({
    method: 'POST',
    url: '/api/v1/transactions',
    payload: {
      accountId: cuentaId,
      amount: monto,
      categoryId: categoriaId,
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

  it('rechaza un monto no positivo con 422, todo en texto exacto', async () => {
    const categoriaId = await crearCategoriaDeGasto();
    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: categoriaId,
      currency: 'COP',
      amount: '100000',
    });

    for (const amount of ['0', '-50', '0.0000', 'abc', '']) {
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
    // porque ganar de más no es algo que avisar en rojo.
    await registrarIngreso(cuerpo.data.id, '500000', categoriaId);

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
    await registrarIngreso(cuenta.id, '100000', categoriaId);

    const { data } = await servicio.checklistDelMes(usuarioId, { month: MES, currency: 'COP' });
    const renglon = data.items.find((i) => i.id === itemId);
    expect(renglon).toMatchObject({
      progress: '100000.0000',
      checked: false,
      exceeded: false,
    });
  });

  it('un renglón de ingresos no se contaminó con lo gastado en categorías de gasto', async () => {
    const gastoId = await crearCategoriaDeGasto();
    const ingresoId = await crearCategoriaDeIngreso();

    const banco = await app
      .inject({
        method: 'POST',
        url: '/api/v1/accounts',
        payload: { name: `Cuenta ${(contador += 1)}`, type: 'bank', currency: 'COP' },
      })
      .then((r) => r.json().data);

    await registrarIngreso(banco.id, '800000', ingresoId);
    const gasto = await app
      .inject({
        method: 'POST',
        url: '/api/v1/transactions',
        payload: { accountId: banco.id, amount: '-75000', occurredAt: DIA_15 },
      })
      .then((r) => r.json().data);
    expect(gasto.id).toBeDefined();

    const item = await servicio.crearItem(usuarioId, {
      kind: 'category',
      categoryId: ingresoId,
      currency: 'COP',
      amount: '600000',
    });
    const itemId = item.id;

    const { data } = await servicio.checklistDelMes(usuarioId, { month: MES, currency: 'COP' });
    const renglon = data.items.find((i) => i.id === itemId);
    expect(renglon!.progress).toBe('800000.0000');
  });
});
