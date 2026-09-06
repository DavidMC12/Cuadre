/**
 * Pruebas de la API de punta a punta, sin abrir un puerto: `app.inject()`
 * mete la petición por dentro de Fastify y devuelve la respuesta real.
 *
 * Cada tanda crea su propio usuario, así que sus datos no se cruzan con los de
 * nadie. No se limpia al final porque los movimientos son inmutables y no se
 * pueden borrar: es el precio de que el libro sea de verdad un libro.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construirApp } from './app.js';
import { sql } from 'drizzle-orm';
import { closeDb, db } from './db/client.js';
import { categories, users } from './db/schema/index.js';

let app: FastifyInstance;
let usuarioId: string;

beforeAll(async () => {
  const marca = randomUUID();
  const [usuario] = await db
    .insert(users)
    .values({ email: `pruebas-${marca}@cuadre.test`, displayName: 'Pruebas' })
    .returning({ id: users.id });

  usuarioId = usuario!.id;
  app = await construirApp({ silencioso: true, resolverUsuario: async () => usuarioId });
  await app.ready();
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

const HOY = '2026-09-05T12:00:00Z';

async function registrarGasto(cuentaId: string, monto: string, extras = {}): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/transactions', {
    accountId: cuentaId,
    amount: monto,
    occurredAt: HOY,
    description: 'Prueba',
    ...extras,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function saldoDe(cuentaId: string): Promise<string> {
  const { cuerpo } = await pedir('GET', `/api/v1/accounts/${cuentaId}`);
  return cuerpo.data.balance;
}

// -----------------------------------------------------------------------------

describe('salud y rutas inexistentes', () => {
  it('responde que está vivo', async () => {
    const { estado, cuerpo } = await pedir('GET', '/salud');
    expect(estado).toBe(200);
    expect(cuerpo.estado).toBe('vivo');
  });

  it('una ruta que no existe da 404 con un mensaje claro', async () => {
    const { estado, cuerpo } = await pedir('GET', '/api/v1/lo-que-sea');
    expect(estado).toBe(404);
    expect(cuerpo.error.code).toBe('NOT_FOUND');
  });
});

describe('crear cuentas', () => {
  it('crea una cuenta y arranca en cero', async () => {
    const cuenta = await crearCuenta({ name: 'Bancolombia' });
    expect(cuenta.balance).toBe('0.0000');
    expect(cuenta.movementCount).toBe(0);
    expect(cuenta.currency).toBe('COP');
    expect(cuenta.archivedAt).toBeNull();
  });

  it('el saldo inicial queda como movimiento, no como columna', async () => {
    const cuenta = await crearCuenta({ openingBalance: '1500000' });
    expect(cuenta.balance).toBe('1500000.0000');
    expect(cuenta.movementCount).toBe(1);

    const { cuerpo } = await pedir('GET', `/api/v1/transactions?accountId=${cuenta.id}`);
    expect(cuerpo.data).toHaveLength(1);
    expect(cuerpo.data[0].kind).toBe('opening');
    expect(cuerpo.data[0].description).toBe('Saldo inicial');
  });

  it('un saldo inicial de cero no registra ningún movimiento', async () => {
    const cuenta = await crearCuenta({ openingBalance: '0' });
    expect(cuenta.movementCount).toBe(0);
  });

  it('una tarjeta puede arrancar con deuda', async () => {
    const cuenta = await crearCuenta({ type: 'card', openingBalance: '-450000' });
    expect(cuenta.balance).toBe('-450000.0000');
  });

  it('rechaza un nombre en blanco', async () => {
    const { estado, cuerpo } = await pedir('POST', '/api/v1/accounts', {
      name: '   ',
      type: 'bank',
      currency: 'COP',
    });
    expect(estado).toBe(400);
    expect(cuerpo.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza un tipo de cuenta inventado', async () => {
    const { estado, cuerpo } = await pedir('POST', '/api/v1/accounts', {
      name: 'Cripto',
      type: 'bitcoin',
      currency: 'COP',
    });
    expect(estado).toBe(400);
    expect(cuerpo.error.details[0].campo).toBe('type');
  });

  it('rechaza una moneda mal escrita y lo explica', async () => {
    const { estado, cuerpo } = await pedir('POST', '/api/v1/accounts', {
      name: 'Dólares',
      type: 'bank',
      currency: 'usd',
    });
    expect(estado).toBe(400);
    expect(cuerpo.error.details[0].problema).toMatch(/tres letras/);
  });

  it('no deja dos cuentas activas con el mismo nombre', async () => {
    const nombre = `Repetida ${randomUUID().slice(0, 6)}`;
    await crearCuenta({ name: nombre });

    const { estado, cuerpo } = await pedir('POST', '/api/v1/accounts', {
      name: nombre,
      type: 'cash',
      currency: 'COP',
    });
    expect(estado).toBe(409);
    expect(cuerpo.error.message).toMatch(/ya tienes una cuenta con ese nombre/i);
  });
});

describe('registrar movimientos', () => {
  it('un gasto baja el saldo y un ingreso lo sube', async () => {
    const cuenta = await crearCuenta({ openingBalance: '1000000' });

    await registrarGasto(cuenta.id, '-250000');
    expect(await saldoDe(cuenta.id)).toBe('750000.0000');

    await registrarGasto(cuenta.id, '80000');
    expect(await saldoDe(cuenta.id)).toBe('830000.0000');
  });

  it('los centavos no se pierden aunque se sumen muchos', async () => {
    const cuenta = await crearCuenta();
    for (let i = 0; i < 20; i += 1) await registrarGasto(cuenta.id, '-0.01');
    expect(await saldoDe(cuenta.id)).toBe('-0.2000');
  });

  it('rechaza un monto de cero', async () => {
    const cuenta = await crearCuenta();
    const { estado, cuerpo } = await pedir('POST', '/api/v1/transactions', {
      accountId: cuenta.id,
      amount: '0.00',
      occurredAt: HOY,
    });
    expect(estado).toBe(400);
    expect(cuerpo.error.details[0].problema).toMatch(/cero/);
  });

  it('rechaza un monto con más de cuatro decimales', async () => {
    const cuenta = await crearCuenta();
    const { estado } = await pedir('POST', '/api/v1/transactions', {
      accountId: cuenta.id,
      amount: '10.123456',
      occurredAt: HOY,
    });
    expect(estado).toBe(400);
  });

  it('rechaza un movimiento en una cuenta que no existe', async () => {
    const { estado, cuerpo } = await pedir('POST', '/api/v1/transactions', {
      accountId: randomUUID(),
      amount: '-100',
      occurredAt: HOY,
    });
    expect(estado).toBe(404);
    expect(cuerpo.error.message).toMatch(/no existe/i);
  });

  it('no acepta movimientos en una cuenta archivada', async () => {
    const cuenta = await crearCuenta();
    await pedir('POST', `/api/v1/accounts/${cuenta.id}/archive`);

    const { estado } = await pedir('POST', '/api/v1/transactions', {
      accountId: cuenta.id,
      amount: '-100',
      occurredAt: HOY,
    });
    expect(estado).toBe(404);
  });
});

describe('anular movimientos', () => {
  it('anular deja el saldo como estaba y conserva los dos movimientos', async () => {
    const cuenta = await crearCuenta({ openingBalance: '500000' });
    const gasto = await registrarGasto(cuenta.id, '-120000');
    expect(await saldoDe(cuenta.id)).toBe('380000.0000');

    const { estado, cuerpo } = await pedir('POST', `/api/v1/transactions/${gasto.id}/reversal`);
    expect(estado).toBe(201);
    expect(cuerpo.data.amount).toBe('120000.0000');
    expect(cuerpo.data.reversesTransactionId).toBe(gasto.id);
    expect(await saldoDe(cuenta.id)).toBe('500000.0000');

    const lista = await pedir('GET', `/api/v1/transactions?accountId=${cuenta.id}`);
    expect(lista.cuerpo.data).toHaveLength(3);
  });

  it('la anulación lleva la fecha del movimiento anulado, no la de hoy', async () => {
    const cuenta = await crearCuenta();
    const gasto = await registrarGasto(cuenta.id, '-1000', {
      occurredAt: '2026-01-15T10:00:00Z',
    });

    const { cuerpo } = await pedir('POST', `/api/v1/transactions/${gasto.id}/reversal`);
    expect(cuerpo.data.occurredAt).toBe(gasto.occurredAt);
  });

  it('el movimiento anulado queda marcado como anulado', async () => {
    const cuenta = await crearCuenta();
    const gasto = await registrarGasto(cuenta.id, '-1000');
    const { cuerpo } = await pedir('POST', `/api/v1/transactions/${gasto.id}/reversal`);

    const revisado = await pedir('GET', `/api/v1/transactions/${gasto.id}`);
    expect(revisado.cuerpo.data.reversedByTransactionId).toBe(cuerpo.data.id);
  });

  it('no deja anular dos veces', async () => {
    const cuenta = await crearCuenta();
    const gasto = await registrarGasto(cuenta.id, '-1000');
    await pedir('POST', `/api/v1/transactions/${gasto.id}/reversal`);

    const { estado, cuerpo } = await pedir('POST', `/api/v1/transactions/${gasto.id}/reversal`);
    expect(estado).toBe(409);
    expect(cuerpo.error.message).toMatch(/ya está anulado/i);
  });

  it('no deja anular una anulación', async () => {
    const cuenta = await crearCuenta();
    const gasto = await registrarGasto(cuenta.id, '-1000');
    const anulacion = await pedir('POST', `/api/v1/transactions/${gasto.id}/reversal`);

    const { estado, cuerpo } = await pedir(
      'POST',
      `/api/v1/transactions/${anulacion.cuerpo.data.id}/reversal`,
    );
    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/anulación no se anula/i);
  });

  it('no deja anular el saldo inicial, y dice qué hacer en su lugar', async () => {
    const cuenta = await crearCuenta({ openingBalance: '1000' });
    const { cuerpo: lista } = await pedir('GET', `/api/v1/transactions?accountId=${cuenta.id}`);
    const apertura = lista.data[0];

    const { estado, cuerpo } = await pedir('POST', `/api/v1/transactions/${apertura.id}/reversal`);
    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/movimiento de ajuste/i);
  });

  it('un movimiento que no existe da 404', async () => {
    const { estado } = await pedir('POST', `/api/v1/transactions/${randomUUID()}/reversal`);
    expect(estado).toBe(404);
  });
});

describe('transferencias', () => {
  it('mueve el saldo entre cuentas sin cambiar el total', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const efectivo = await crearCuenta({ type: 'cash' });

    const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: efectivo.id,
      amount: '300000',
      occurredAt: HOY,
      description: 'Retiro del cajero',
    });

    expect(estado).toBe(201);
    expect(cuerpo.data.legs).toHaveLength(2);
    expect(await saldoDe(banco.id)).toBe('700000.0000');
    expect(await saldoDe(efectivo.id)).toBe('300000.0000');
  });

  it('rechaza transferir a la misma cuenta', async () => {
    const cuenta = await crearCuenta();
    const { estado } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: cuenta.id,
      toAccountId: cuenta.id,
      amount: '100',
      occurredAt: HOY,
    });
    expect(estado).toBe(400);
  });

  it('rechaza transferir entre monedas distintas', async () => {
    const pesos = await crearCuenta({ openingBalance: '1000000' });
    const dolares = await crearCuenta({ currency: 'USD' });

    const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: pesos.id,
      toAccountId: dolares.id,
      amount: '100',
      occurredAt: HOY,
    });
    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/misma moneda/i);
  });

  it('anular una transferencia deshace las dos patas juntas', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const efectivo = await crearCuenta({ type: 'cash' });

    const { cuerpo: transferencia } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: efectivo.id,
      amount: '300000',
      occurredAt: HOY,
    });

    const { estado } = await pedir(
      'POST',
      `/api/v1/transfers/${transferencia.data.transferGroupId}/reversal`,
    );

    expect(estado).toBe(201);
    expect(await saldoDe(banco.id)).toBe('1000000.0000');
    expect(await saldoDe(efectivo.id)).toBe('0.0000');
  });

  it('no deja anular una sola mitad de la transferencia', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const efectivo = await crearCuenta({ type: 'cash' });

    const { cuerpo: transferencia } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: efectivo.id,
      amount: '100000',
      occurredAt: HOY,
    });

    const { estado, cuerpo } = await pedir(
      'POST',
      `/api/v1/transactions/${transferencia.data.legs[0].id}/reversal`,
    );
    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/transferencia completa/i);
  });
});

describe('listar movimientos', () => {
  it('vienen del más reciente al más viejo', async () => {
    const cuenta = await crearCuenta();
    await registrarGasto(cuenta.id, '-100', { occurredAt: '2026-01-01T10:00:00Z' });
    await registrarGasto(cuenta.id, '-200', { occurredAt: '2026-03-01T10:00:00Z' });
    await registrarGasto(cuenta.id, '-300', { occurredAt: '2026-02-01T10:00:00Z' });

    const { cuerpo } = await pedir('GET', `/api/v1/transactions?accountId=${cuenta.id}`);
    expect(cuerpo.data.map((m: any) => m.amount)).toEqual(['-200.0000', '-300.0000', '-100.0000']);
  });

  it('filtra por rango de fechas', async () => {
    const cuenta = await crearCuenta();
    await registrarGasto(cuenta.id, '-100', { occurredAt: '2026-01-01T10:00:00Z' });
    await registrarGasto(cuenta.id, '-200', { occurredAt: '2026-06-01T10:00:00Z' });

    const { cuerpo } = await pedir(
      'GET',
      `/api/v1/transactions?accountId=${cuenta.id}&from=2026-05-01T00:00:00Z`,
    );
    expect(cuerpo.data).toHaveLength(1);
    expect(cuerpo.data[0].amount).toBe('-200.0000');
  });

  it('pagina con cursor sin repetir ni saltarse movimientos', async () => {
    const cuenta = await crearCuenta();
    for (let i = 1; i <= 5; i += 1) {
      await registrarGasto(cuenta.id, `-${i}00`, {
        occurredAt: `2026-04-0${i}T10:00:00Z`,
      });
    }

    const primera = await pedir('GET', `/api/v1/transactions?accountId=${cuenta.id}&limit=2`);
    expect(primera.cuerpo.data).toHaveLength(2);
    expect(primera.cuerpo.nextCursor).toBeTruthy();

    const segunda = await pedir(
      'GET',
      `/api/v1/transactions?accountId=${cuenta.id}&limit=2&cursor=${encodeURIComponent(primera.cuerpo.nextCursor)}`,
    );
    expect(segunda.cuerpo.data).toHaveLength(2);

    const ids = [...primera.cuerpo.data, ...segunda.cuerpo.data].map((m: any) => m.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('rechaza un cursor inventado', async () => {
    const { estado, cuerpo } = await pedir('GET', '/api/v1/transactions?cursor=basura');
    expect(estado).toBe(400);
    expect(cuerpo.error.message).toMatch(/cursor/i);
  });

  it('solo muestra los movimientos del usuario de la petición', async () => {
    const cuenta = await crearCuenta();
    await registrarGasto(cuenta.id, '-999');

    const { cuerpo } = await pedir('GET', '/api/v1/transactions?limit=200');
    const ajenos = cuerpo.data.filter((m: any) => m.accountId === undefined);
    expect(ajenos).toHaveLength(0);
  });
});

describe('archivar cuentas', () => {
  it('archivar la esconde de la lista pero conserva su historia', async () => {
    const cuenta = await crearCuenta({ openingBalance: '5000' });
    await pedir('POST', `/api/v1/accounts/${cuenta.id}/archive`);

    const activas = await pedir('GET', '/api/v1/accounts');
    expect(activas.cuerpo.data.find((c: any) => c.id === cuenta.id)).toBeUndefined();

    const todas = await pedir('GET', '/api/v1/accounts?includeArchived=true');
    const archivada = todas.cuerpo.data.find((c: any) => c.id === cuenta.id);
    expect(archivada.archivedAt).not.toBeNull();
    expect(archivada.balance).toBe('5000.0000');
  });

  it('no deja archivar dos veces', async () => {
    const cuenta = await crearCuenta();
    await pedir('POST', `/api/v1/accounts/${cuenta.id}/archive`);

    const { estado, cuerpo } = await pedir('POST', `/api/v1/accounts/${cuenta.id}/archive`);
    expect(estado).toBe(409);
    expect(cuerpo.error.message).toMatch(/ya está archivada/i);
  });

  it('desarchivar la devuelve a la lista', async () => {
    const cuenta = await crearCuenta();
    await pedir('POST', `/api/v1/accounts/${cuenta.id}/archive`);
    await pedir('POST', `/api/v1/accounts/${cuenta.id}/unarchive`);

    const activas = await pedir('GET', '/api/v1/accounts');
    expect(activas.cuerpo.data.find((c: any) => c.id === cuenta.id)).toBeDefined();
  });
});

describe('los errores hablan español', () => {
  it('un identificador mal formado no dice "Invalid UUID"', async () => {
    const { estado, cuerpo } = await pedir('POST', '/api/v1/transactions', {
      accountId: 'esto-no-es-un-uuid',
      amount: '-100',
      occurredAt: HOY,
    });

    expect(estado).toBe(400);
    expect(cuerpo.error.details[0].problema).toBe('no es un identificador válido');
  });

  it('una fecha inventada se explica en español', async () => {
    const cuenta = await crearCuenta();
    const { cuerpo } = await pedir('POST', '/api/v1/transactions', {
      accountId: cuenta.id,
      amount: '-100',
      occurredAt: 'el martes pasado',
    });

    expect(cuerpo.error.details[0].problema).toMatch(/fecha válida/);
  });

  it('un campo que falta se nombra, no se adivina', async () => {
    const { cuerpo } = await pedir('POST', '/api/v1/accounts', { type: 'bank', currency: 'COP' });

    expect(cuerpo.error.details[0].campo).toBe('name');
    expect(cuerpo.error.details[0].problema).toBe('hace falta');
  });

  it('un tipo de cuenta inventado lista las opciones que sí valen', async () => {
    const { cuerpo } = await pedir('POST', '/api/v1/accounts', {
      name: 'Cripto',
      type: 'bitcoin',
      currency: 'COP',
    });

    expect(cuerpo.error.details[0].problema).toMatch(/bank, card, cash/);
  });
});

// -----------------------------------------------------------------------------

describe('corregir la categoría de un movimiento', () => {
  /**
   * Las categorías se siembran directo en la base y no por la API a propósito:
   * el módulo de categorías lo está construyendo otro agente en paralelo, y
   * estas pruebas son del libro de movimientos, no de aquel catálogo.
   */
  async function crearCategoria(nombre: string, kind: 'income' | 'expense' = 'expense') {
    const [fila] = await db
      .insert(categories)
      .values({ userId: usuarioId, name: `${nombre} ${randomUUID().slice(0, 8)}`, kind })
      .returning({ id: categories.id });
    return fila!.id;
  }

  it('cambia la categoría de un gasto', async () => {
    const cuenta = await crearCuenta();
    const gasto = await registrarGasto(cuenta.id, '-50000');
    const comida = await crearCategoria('Comida');

    const { estado, cuerpo } = await pedir(
      'PATCH',
      `/api/v1/transactions/${gasto.id}/category`,
      { categoryId: comida },
    );

    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.categoryId).toBe(comida);
    expect(cuerpo.data.amount).toBe(gasto.amount);
    expect(cuerpo.data.occurredAt).toBe(gasto.occurredAt);
  });

  it('deja quitar la categoría', async () => {
    const cuenta = await crearCuenta();
    const salud = await crearCategoria('Salud');
    const gasto = await registrarGasto(cuenta.id, '-9000', { categoryId: salud });

    const { estado, cuerpo } = await pedir(
      'PATCH',
      `/api/v1/transactions/${gasto.id}/category`,
      { categoryId: null },
    );

    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.categoryId).toBeNull();
  });

  /**
   * La razón de ser de toda esta función. Si la anulación se quedara en la
   * categoría vieja, el par dejaría -50.000 en la nueva y +50.000 en la vieja,
   * y las dos gráficas mentirían a la vez.
   */
  it('arrastra la anulación a la categoría nueva', async () => {
    const cuenta = await crearCuenta();
    const vieja = await crearCategoria('Ocio');
    const nueva = await crearCategoria('Salud');

    const gasto = await registrarGasto(cuenta.id, '-50000', { categoryId: vieja });
    const { cuerpo: anulado } = await pedir('POST', `/api/v1/transactions/${gasto.id}/reversal`);
    expect(anulado.data.categoryId).toBe(vieja);

    await pedir('PATCH', `/api/v1/transactions/${gasto.id}/category`, { categoryId: nueva });

    const { cuerpo: revisada } = await pedir('GET', `/api/v1/transactions/${anulado.data.id}`);
    expect(revisada.data.categoryId).toBe(nueva);
  });

  it('no deja recategorizar una anulación por su cuenta', async () => {
    const cuenta = await crearCuenta();
    const gasto = await registrarGasto(cuenta.id, '-1000');
    const { cuerpo: anulado } = await pedir('POST', `/api/v1/transactions/${gasto.id}/reversal`);
    const otra = await crearCategoria('Otros');

    const { estado, cuerpo } = await pedir(
      'PATCH',
      `/api/v1/transactions/${anulado.data.id}/category`,
      { categoryId: otra },
    );

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/anulaci/i);
  });

  it('no le pone categoría a un saldo inicial', async () => {
    const cuenta = await crearCuenta({ openingBalance: '100000' });
    const { cuerpo: lista } = await pedir('GET', `/api/v1/transactions?accountId=${cuenta.id}`);
    const apertura = lista.data.find((m: any) => m.kind === 'opening');
    const alguna = await crearCategoria('Otros');

    const { estado, cuerpo } = await pedir(
      'PATCH',
      `/api/v1/transactions/${apertura.id}/category`,
      { categoryId: alguna },
    );

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/saldo inicial/i);
  });

  it('no le pone categoría a una transferencia', async () => {
    const origen = await crearCuenta();
    const destino = await crearCuenta();
    await pedir('POST', '/api/v1/accounts', {});

    const { cuerpo: transferencia } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: origen.id,
      toAccountId: destino.id,
      amount: '20000',
      occurredAt: HOY,
    });
    const alguna = await crearCategoria('Otros');

    const { estado, cuerpo } = await pedir(
      'PATCH',
      `/api/v1/transactions/${transferencia.data.legs[0].id}/category`,
      { categoryId: alguna },
    );

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/transferencia/i);
  });

  it('no toca un movimiento que no existe', async () => {
    const { estado } = await pedir(
      'PATCH',
      `/api/v1/transactions/${randomUUID()}/category`,
      { categoryId: null },
    );
    expect(estado).toBe(404);
  });

  /**
   * La prueba que de verdad importa: la rendija que abrió la migración 0002 es
   * SOLO para la categoría. Aunque alguien entre con un cliente de SQL y
   * escriba a mano, el monto sigue siendo intocable.
   */
  it('la base sigue rechazando cambiar el monto a mano', async () => {
    const cuenta = await crearCuenta();
    const gasto = await registrarGasto(cuenta.id, '-7000');

    // Drizzle envuelve el error de Postgres: su mensaje solo dice 'Failed
    // query' y el de verdad queda en `.cause`. Hay que ir a buscarlo, igual
    // que hace `buscarErrorDePostgres` en src/http/errores.ts.
    const fallo = await db
      .execute(sql`update transactions set amount = -1 where id = ${gasto.id}::uuid`)
      .then(() => null, (error: unknown) => error);

    expect(fallo, 'la base tenia que rechazar el cambio de monto').not.toBeNull();

    let mensajes = '';
    for (let e: any = fallo, saltos = 0; e && saltos < 5; e = e.cause, saltos += 1) {
      mensajes += ` ${e.message ?? ''}`;
    }
    expect(mensajes).toMatch(/inmutables/i);

    const { cuerpo } = await pedir('GET', `/api/v1/transactions/${gasto.id}`);
    expect(cuerpo.data.amount).toBe(gasto.amount);
  });
});
