/**
 * Pruebas de editar una cuenta (nombre, cupo, cuenta vinculada) y de las
 * reglas propias de las tarjetas de crédito, de punta a punta con
 * `app.inject()`.
 *
 * Cada prueba trabaja con un usuario recién creado: así una no le deja
 * cuentas a la siguiente y ninguna depende del orden en que corran.
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
    .values({ email: `cuentas-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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

async function editar(cuentaId: string, cambios: Record<string, unknown>): Promise<Respuesta> {
  return pedir('PATCH', `/api/v1/accounts/${cuentaId}`, cambios);
}

// -----------------------------------------------------------------------------

describe('editar el nombre', () => {
  it('cambia el nombre y no toca nada más', async () => {
    const cuenta = await crearCuenta({ name: 'Bancolombia', openingBalance: '500000' });

    const { estado, cuerpo } = await editar(cuenta.id, { name: 'Ahorros Bancolombia' });

    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data).toMatchObject({
      id: cuenta.id,
      name: 'Ahorros Bancolombia',
      type: 'bank',
      currency: 'COP',
      balance: '500000.0000',
    });
  });

  it('rechaza un nombre vacío', async () => {
    const cuenta = await crearCuenta();
    const { estado } = await editar(cuenta.id, { name: '   ' });
    expect(estado).toBe(400);
  });

  it('rechaza un cuerpo vacío: no hay nada que cambiar', async () => {
    const cuenta = await crearCuenta();
    const { estado } = await editar(cuenta.id, {});
    expect(estado).toBe(400);
  });

  it('no deja editar una cuenta de otro usuario', async () => {
    const cuenta = await crearCuenta();
    usuarioId = await crearUsuario();

    const { estado } = await editar(cuenta.id, { name: 'Robada' });
    expect(estado).toBe(404);
  });
});

describe('el saldo y el tipo no se pueden editar por aquí', () => {
  it('ignora silenciosamente campos que no son editables', async () => {
    const cuenta = await crearCuenta({ openingBalance: '100000' });

    const { estado, cuerpo } = await editar(cuenta.id, {
      name: 'Igual pero con más nombre',
      type: 'cash',
      currency: 'USD',
      balance: '999999',
    });

    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data).toMatchObject({
      type: 'bank',
      currency: 'COP',
      balance: '100000.0000',
    });
  });
});

describe('cupo de una tarjeta', () => {
  it('se puede poner al crear y editar después', async () => {
    const tarjeta = await crearCuenta({ type: 'card', creditLimit: '2000000' });
    expect(tarjeta.creditLimit).toBe('2000000.0000');

    const { estado, cuerpo } = await editar(tarjeta.id, { creditLimit: '3000000' });
    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.creditLimit).toBe('3000000.0000');
  });

  it('se puede quitar mandando null', async () => {
    const tarjeta = await crearCuenta({ type: 'card', creditLimit: '2000000' });

    const { estado, cuerpo } = await editar(tarjeta.id, { creditLimit: null });
    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.creditLimit).toBeNull();
  });

  it('rechaza un cupo en una cuenta que no es tarjeta', async () => {
    const banco = await crearCuenta({ type: 'bank' });
    const { estado } = await editar(banco.id, { creditLimit: '1000000' });
    expect(estado).toBe(422);
  });

  it('rechaza un cupo de cero o negativo', async () => {
    const { estado } = await pedir('POST', '/api/v1/accounts', {
      name: `Cuenta ${(contador += 1)}`,
      type: 'card',
      currency: 'COP',
      creditLimit: '0',
    });
    expect(estado).toBe(400);
  });
});

describe('una tarjeta no puede ser cuenta de ahorro', () => {
  it('rechaza isSavings al crear una tarjeta', async () => {
    const { estado } = await pedir('POST', '/api/v1/accounts', {
      name: `Cuenta ${(contador += 1)}`,
      type: 'card',
      currency: 'COP',
      isSavings: true,
    });
    expect(estado).toBe(422);
  });

  it('un banco o efectivo sí pueden marcarse', async () => {
    const banco = await crearCuenta({ type: 'bank', isSavings: true });
    const efectivo = await crearCuenta({ type: 'cash', isSavings: true });
    expect(banco.isSavings).toBe(true);
    expect(efectivo.isSavings).toBe(true);
  });
});

describe('cuenta vinculada para pagar la tarjeta', () => {
  it('se puede vincular una tarjeta a un banco de la misma moneda', async () => {
    const banco = await crearCuenta({ type: 'bank', currency: 'COP' });
    const tarjeta = await crearCuenta({ type: 'card', currency: 'COP' });

    const { estado, cuerpo } = await editar(tarjeta.id, { linkedAccountId: banco.id });
    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.linkedAccountId).toBe(banco.id);
  });

  it('se puede fijar ya desde la creación', async () => {
    const banco = await crearCuenta({ type: 'bank', currency: 'COP' });
    const tarjeta = await crearCuenta({ type: 'card', currency: 'COP', linkedAccountId: banco.id });
    expect(tarjeta.linkedAccountId).toBe(banco.id);
  });

  it('rechaza vincular una cuenta que no es tarjeta', async () => {
    const banco1 = await crearCuenta({ type: 'bank' });
    const banco2 = await crearCuenta({ type: 'bank' });

    const { estado } = await editar(banco1.id, { linkedAccountId: banco2.id });
    expect(estado).toBe(422);
  });

  it('rechaza vincularse a sí misma', async () => {
    const tarjeta = await crearCuenta({ type: 'card' });
    const { estado } = await editar(tarjeta.id, { linkedAccountId: tarjeta.id });
    expect(estado).toBe(422);
  });

  it('rechaza vincular una cuenta de otra moneda', async () => {
    const bancoUsd = await crearCuenta({ type: 'bank', currency: 'USD' });
    const tarjeta = await crearCuenta({ type: 'card', currency: 'COP' });

    const { estado } = await editar(tarjeta.id, { linkedAccountId: bancoUsd.id });
    expect(estado).toBe(404);
  });

  it('rechaza vincular una cuenta que no existe o es de otro usuario', async () => {
    const tarjeta = await crearCuenta({ type: 'card' });
    const { estado } = await editar(tarjeta.id, { linkedAccountId: randomUUID() });
    expect(estado).toBe(404);
  });

  it('se puede desvincular mandando null', async () => {
    const banco = await crearCuenta({ type: 'bank' });
    const tarjeta = await crearCuenta({ type: 'card', linkedAccountId: banco.id });

    const { estado, cuerpo } = await editar(tarjeta.id, { linkedAccountId: null });
    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.linkedAccountId).toBeNull();
  });
});

describe('usar y pagar una tarjeta ya funciona con lo que existe', () => {
  it('un gasto en la tarjeta le sube la deuda, y transferir desde el banco se la baja', async () => {
    const banco = await crearCuenta({ type: 'bank', openingBalance: '1000000' });
    const tarjeta = await crearCuenta({ type: 'card', creditLimit: '2000000' });

    // "Usar la tarjeta" es un gasto normal en esa cuenta.
    await pedir('POST', '/api/v1/transactions', {
      accountId: tarjeta.id,
      amount: '-1200000',
      occurredAt: '2026-09-05T17:00:00Z',
    });

    let { cuerpo } = await pedir('GET', `/api/v1/accounts/${tarjeta.id}`);
    expect(cuerpo.data.balance).toBe('-1200000.0000');

    // "Pagar la tarjeta" es una transferencia normal desde el banco.
    const { estado } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: tarjeta.id,
      amount: '700000',
      occurredAt: '2026-09-10T17:00:00Z',
    });
    expect(estado).toBe(201);

    ({ cuerpo } = await pedir('GET', `/api/v1/accounts/${tarjeta.id}`));
    expect(cuerpo.data.balance).toBe('-500000.0000');
  });
});
