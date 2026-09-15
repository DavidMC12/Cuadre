/**
 * Pruebas de transferencias entre cuentas propias, de punta a punta con
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
    .values({ email: `transferencias-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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

async function crearCuenta(nombre: string, moneda: string, saldoInicial?: string): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/accounts', {
    name: nombre,
    type: 'bank',
    currency: moneda,
    ...(saldoInicial === undefined ? {} : { openingBalance: saldoInicial }),
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

// -----------------------------------------------------------------------------

describe('registrar una transferencia', () => {
  it('mueve la plata entre dos cuentas de la misma moneda', async () => {
    const banco = await crearCuenta('Banco', 'COP', '1000000');
    const efectivo = await crearCuenta('Efectivo', 'COP');

    const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: efectivo.id,
      amount: '300000',
      occurredAt: '2026-09-05T17:00:00Z',
    });

    expect(estado, JSON.stringify(cuerpo)).toBe(201);
    expect(cuerpo.data.legs).toHaveLength(2);

    const patas = cuerpo.data.legs as any[];
    const salida = patas.find((pata) => pata.accountId === banco.id);
    const entrada = patas.find((pata) => pata.accountId === efectivo.id);

    expect(salida.amount).toBe('-300000.0000');
    expect(entrada.amount).toBe('300000.0000');
    expect(salida.transferGroupId).toBe(cuerpo.data.transferGroupId);
    expect(entrada.transferGroupId).toBe(cuerpo.data.transferGroupId);
    // Pasar plata entre cuentas propias no es un gasto ni un ingreso.
    expect(salida.categoryId).toBeNull();
    expect(entrada.categoryId).toBeNull();

    const { cuerpo: cuentaBanco } = await pedir('GET', `/api/v1/accounts/${banco.id}`);
    const { cuerpo: cuentaEfectivo } = await pedir('GET', `/api/v1/accounts/${efectivo.id}`);
    expect(cuentaBanco.data.balance).toBe('700000.0000');
    expect(cuentaEfectivo.data.balance).toBe('300000.0000');
  });

  it('rechaza dos cuentas de monedas distintas, sin lenguaje técnico ni ids internos', async () => {
    const banco = await crearCuenta('Banco', 'COP', '1000000');
    const dolares = await crearCuenta('Banco USD', 'USD');

    const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: dolares.id,
      amount: '100',
      occurredAt: '2026-09-05T17:00:00Z',
    });

    expect(estado).toBe(422);
    expect(cuerpo.error.code).toBe('RULE_VIOLATION');
    expect(cuerpo.error.message).toBe(
      'Las dos cuentas deben ser de la misma moneda para transferir entre ellas.',
    );
    // Nada de "pata" ni de un id de grupo interno filtrándose al mensaje.
    expect(cuerpo.error.message).not.toMatch(/pata|grupo/i);

    // Y no quedó ningún movimiento a medias en ninguna de las dos cuentas.
    const { cuerpo: cuentaBanco } = await pedir('GET', `/api/v1/accounts/${banco.id}`);
    const { cuerpo: cuentaDolares } = await pedir('GET', `/api/v1/accounts/${dolares.id}`);
    expect(cuentaBanco.data.balance).toBe('1000000.0000');
    expect(cuentaDolares.data.balance).toBe('0.0000');
  });

  it('rechaza la misma cuenta como origen y destino', async () => {
    const banco = await crearCuenta('Banco', 'COP', '1000000');

    const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: banco.id,
      amount: '100',
      occurredAt: '2026-09-05T17:00:00Z',
    });

    expect(estado).toBe(400);
    expect(cuerpo.error.code).toBe('VALIDATION_ERROR');
  });

  it('una cuenta que no existe da 404, sin reclamar sobre la moneda', async () => {
    const banco = await crearCuenta('Banco', 'COP', '1000000');

    const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: randomUUID(),
      amount: '100',
      occurredAt: '2026-09-05T17:00:00Z',
    });

    expect(estado).toBe(404);
    expect(cuerpo.error.message).toMatch(/no existe o está archivada/i);
  });

  it('una transferencia no lleva descripción vacía ni categoría', async () => {
    const banco = await crearCuenta('Banco', 'COP', '1000000');
    const efectivo = await crearCuenta('Efectivo', 'COP');

    const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: efectivo.id,
      amount: '50000',
      occurredAt: '2026-09-05T17:00:00Z',
      description: 'Pago de la tarjeta',
    });

    expect(estado, JSON.stringify(cuerpo)).toBe(201);
    for (const pata of cuerpo.data.legs) {
      expect(pata.description).toBe('Pago de la tarjeta');
      expect(pata.kind).toBe('transfer');
    }
  });
});

describe('cada quien transfiere entre sus propias cuentas', () => {
  it('no deja transferir usando la cuenta de otra persona', async () => {
    const propia = await crearCuenta('Banco', 'COP', '1000000');

    // Cambia de persona: `resolverUsuario` lee esta variable en cada petición,
    // así que a partir de aquí las peticiones actúan como otro usuario.
    usuarioId = await crearUsuario();
    const ajena = await crearCuenta('Cuenta de otro', 'COP');

    const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: propia.id,
      toAccountId: ajena.id,
      amount: '100',
      occurredAt: '2026-09-05T17:00:00Z',
    });

    // "No existe", no "no es tuya": nunca se confirma que la cuenta ajena existe.
    expect(estado).toBe(404);
    expect(cuerpo.error.message).toMatch(/no existe o está archivada/i);
  });
});
