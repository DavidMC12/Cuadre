/**
 * Pruebas del servicio de ahorro explícito, de punta a punta con `app.inject()`.
 *
 * La regla del dueño: el SALDO de una cuenta y lo AHORRADO son cosas distintas.
 * Que una cuenta esté marcada como de ahorro, o que reciba un ingreso, no lo
 * convierte en ahorro. Solo cuenta lo que la persona decide: un registro manual
 * aquí (o una transferencia hacia/desde una cuenta de ahorro, que ya prueba el
 * núcleo). Un registro de ahorro tampoco mueve el saldo de ninguna cuenta.
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
    .values({ email: `ahorro-servicio-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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
  metodo: 'GET' | 'POST',
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

async function anotar(
  cuentaId: string,
  amount: string,
  extras: Record<string, unknown> = {},
): Promise<Respuesta> {
  return pedir('POST', '/api/v1/savings-entries', { accountId: cuentaId, amount, ...extras });
}

async function ahorradoDe(cuentaId: string): Promise<string> {
  const { cuerpo } = await pedir('GET', `/api/v1/accounts/${cuentaId}`);
  return cuerpo.data.saved;
}

async function saldoDe(cuentaId: string): Promise<string> {
  const { cuerpo } = await pedir('GET', `/api/v1/accounts/${cuentaId}`);
  return cuerpo.data.balance;
}

const DIA_5 = '2026-06-05T17:00:00Z';
const DIA_6 = '2026-06-06T17:00:00Z';
const DIA_7 = '2026-06-07T17:00:00Z';

// -----------------------------------------------------------------------------

describe('anotar un ahorro', () => {
  it('suma lo que apartaste y resta lo que retiraste: solo cambia lo ahorrado, no el saldo', async () => {
    const ahorros = await crearCuenta({ isSavings: true, openingBalance: '1000000' });

    // Arranca en cero: el saldo inicial no es ahorro.
    expect(await ahorradoDe(ahorros.id)).toBe('0.0000');
    expect(await saldoDe(ahorros.id)).toBe('1000000.0000');

    const aparte = await anotar(ahorros.id, '500000', {
      occurredAt: DIA_5,
      description: 'Aparté del sueldo',
    });
    expect(aparte.estado, JSON.stringify(aparte.cuerpo)).toBe(201);
    expect(aparte.cuerpo.data).toMatchObject({
      accountId: ahorros.id,
      currency: 'COP',
      amount: '500000.0000',
      occurredAt: expect.any(String),
      description: 'Aparté del sueldo',
    });
    expect(await ahorradoDe(ahorros.id)).toBe('500000.0000');

    const retiro = await anotar(ahorros.id, '-120000', { occurredAt: DIA_6 });
    expect(retiro.estado, JSON.stringify(retiro.cuerpo)).toBe(201);
    expect(retiro.cuerpo.data.amount).toBe('-120000.0000');
    expect(await ahorradoDe(ahorros.id)).toBe('380000.0000');

    // El saldo no se movió: anotar ahorro no mueve plata de la cuenta.
    expect(await saldoDe(ahorros.id)).toBe('1000000.0000');
  });

  it('sin fecha usa ahora y sin descripción deja null', async () => {
    const ahorros = await crearCuenta({ isSavings: true });

    const { estado, cuerpo } = await anotar(ahorros.id, '250000');

    expect(estado, JSON.stringify(cuerpo)).toBe(201);
    expect(typeof cuerpo.data.occurredAt).toBe('string');
    expect(Number.isNaN(Date.parse(cuerpo.data.occurredAt))).toBe(false);
    expect(cuerpo.data.description).toBeNull();
  });

  it('el cero no es un ahorro: 400', async () => {
    const ahorros = await crearCuenta({ isSavings: true });

    for (const amount of ['0', '0.0000', '00', '-0']) {
      expect((await anotar(ahorros.id, amount)).estado, amount).toBe(400);
    }
    expect(await ahorradoDe(ahorros.id)).toBe('0.0000');
  });

  it('una cuenta que no está marcada como de ahorro responde 422', async () => {
    const normal = await crearCuenta();

    const { estado, cuerpo } = await anotar(normal.id, '100000');

    expect(estado).toBe(422);
    expect(cuerpo.error.code).toBe('RULE_VIOLATION');
    expect(cuerpo.error.message).toBe(
      'Solo puedes anotar ahorro en una cuenta marcada como de ahorro.',
    );
  });

  it('una cuenta archivada responde 422 que lo dice', async () => {
    const ahorros = await crearCuenta({ isSavings: true });
    await pedir('POST', `/api/v1/accounts/${ahorros.id}/archive`);

    const { estado, cuerpo } = await anotar(ahorros.id, '100000');

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toContain('archivada');
  });

  it('responde 404 si la cuenta no existe o es de otra persona', async () => {
    const ahorros = await crearCuenta({ isSavings: true });

    const inexistente = await anotar(randomUUID(), '100000');
    expect(inexistente.estado).toBe(404);
    expect(inexistente.cuerpo.error.message).toBe('Esa cuenta no existe.');

    usuarioId = await crearUsuario();
    const ajena = await anotar(ahorros.id, '100000');
    expect(ajena.estado).toBe(404);
    expect(ajena.cuerpo.error.message).toBe('Esa cuenta no existe.');
  });

  it('rechaza una descripción en blanco con 400', async () => {
    const ahorros = await crearCuenta({ isSavings: true });

    expect((await anotar(ahorros.id, '1000', { description: '   ' })).estado).toBe(400);
    expect((await anotar(ahorros.id, '1000', { description: 'x'.repeat(501) })).estado).toBe(400);
  });
});

// -----------------------------------------------------------------------------

describe('listar los ahorros de una cuenta', () => {
  it('salen del más reciente al más viejo', async () => {
    const ahorros = await crearCuenta({ isSavings: true });
    await anotar(ahorros.id, '1000', { occurredAt: DIA_5 });
    await anotar(ahorros.id, '2000', { occurredAt: DIA_7 });
    await anotar(ahorros.id, '3000', { occurredAt: DIA_6 });

    const { estado, cuerpo } = await pedir('GET', `/api/v1/savings-entries?accountId=${ahorros.id}`);

    expect(estado).toBe(200);
    expect(cuerpo.data.map((r: any) => r.amount)).toEqual([
      '2000.0000',
      '3000.0000',
      '1000.0000',
    ]);
  });

  it('no mezcla las cuentas y respeta el límite', async () => {
    const una = await crearCuenta({ isSavings: true });
    const otra = await crearCuenta({ isSavings: true });
    await anotar(una.id, '1000', { occurredAt: DIA_5 });
    await anotar(una.id, '2000', { occurredAt: DIA_6 });
    await anotar(una.id, '3000', { occurredAt: DIA_7 });
    await anotar(otra.id, '9000', { occurredAt: DIA_7 });

    const { cuerpo } = await pedir('GET', `/api/v1/savings-entries?accountId=${una.id}&limit=2`);
    expect(cuerpo.data.map((r: any) => r.amount)).toEqual(['3000.0000', '2000.0000']);

    // El máximo es 200; 201 es un error de validación del borde.
    expect((await pedir('GET', `/api/v1/savings-entries?accountId=${una.id}&limit=201`)).estado).toBe(400);
    expect((await pedir('GET', `/api/v1/savings-entries?accountId=${una.id}&limit=0`)).estado).toBe(400);
  });

  it('responde 404 si la cuenta no existe o es de otra persona', async () => {
    const ahorros = await crearCuenta({ isSavings: true });
    await anotar(ahorros.id, '1000', { occurredAt: DIA_5 });

    expect((await pedir('GET', `/api/v1/savings-entries?accountId=${randomUUID()}`)).estado).toBe(404);

    usuarioId = await crearUsuario();
    const ajena = await pedir('GET', `/api/v1/savings-entries?accountId=${ahorros.id}`);
    expect(ajena.estado).toBe(404);
    expect(ajena.cuerpo.data).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------

describe('lo ahorrado no es el saldo', () => {
  it('un ingreso que cae en la cuenta de ahorro NO sube lo ahorrado', async () => {
    const ahorros = await crearCuenta({ isSavings: true });

    const { estado } = await pedir('POST', '/api/v1/transactions', {
      accountId: ahorros.id,
      amount: '350000',
      occurredAt: DIA_5,
      description: 'Me consignaron',
    });
    expect(estado).toBe(201);

    // El saldo sube porque entró plata; lo ahorrado no, porque nadie decidió
    // apartarla. Esa es toda la diferencia.
    expect(await saldoDe(ahorros.id)).toBe('350000.0000');
    expect(await ahorradoDe(ahorros.id)).toBe('0.0000');

    // Y solo cuando la persona lo aparta a mano, lo ahorrado sube.
    await anotar(ahorros.id, '100000', { occurredAt: DIA_6 });
    expect(await ahorradoDe(ahorros.id)).toBe('100000.0000');
    expect(await saldoDe(ahorros.id)).toBe('350000.0000');
  });
});
