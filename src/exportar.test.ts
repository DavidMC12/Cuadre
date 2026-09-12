/**
 * Pruebas del respaldo: `GET /api/v1/transactions/export`.
 *
 * Lo que se comprueba aquí no es que el archivo se vea bonito, sino que cuente
 * la verdad completa: los montos exactos, las correcciones visibles, y nada de
 * otra persona adentro.
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
    .values({ email: `exportar-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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

async function pedirJson(metodo: 'GET' | 'POST', url: string, cuerpo?: unknown): Promise<any> {
  const respuesta = await app.inject({
    method: metodo,
    url,
    ...(cuerpo === undefined ? {} : { payload: cuerpo as object }),
  });
  return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
}

async function exportar(): Promise<{ estado: number; texto: string; cabeceras: any }> {
  const respuesta = await app.inject({ method: 'GET', url: '/api/v1/transactions/export' });
  return { estado: respuesta.statusCode, texto: respuesta.body, cabeceras: respuesta.headers };
}

/** Las líneas del archivo, sin la marca de Excel ni la línea vacía del final. */
async function lineas(): Promise<string[]> {
  const { estado, texto } = await exportar();
  expect(estado).toBe(200);
  return texto.replace(/^﻿/, '').trimEnd().split('\r\n');
}

/** Las filas de datos: todo menos el encabezado. */
async function filas(): Promise<string[]> {
  return (await lineas()).slice(1);
}

let contador = 0;
async function crearCuenta(extras: Record<string, unknown> = {}): Promise<any> {
  const { estado, cuerpo } = await pedirJson('POST', '/api/v1/accounts', {
    name: `Cuenta ${(contador += 1)}`,
    type: 'bank',
    currency: 'COP',
    ...extras,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function registrar(cuentaId: string, monto: string, extras = {}): Promise<any> {
  const { estado, cuerpo } = await pedirJson('POST', '/api/v1/transactions', {
    accountId: cuentaId,
    amount: monto,
    occurredAt: '2026-09-05T12:00:00Z',
    ...extras,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

// -----------------------------------------------------------------------------

describe('el archivo', () => {
  it('sin movimientos trae el encabezado solo, no un archivo vacío', async () => {
    const todas = await lineas();

    expect(todas).toHaveLength(1);
    expect(todas[0]).toBe(
      'Fecha,Cuenta,Moneda,Tipo,Categoría,Descripción,Monto,Estado,Id,Anula a,Transferencia',
    );
  });

  it('se manda como descarga, con la fecha en el nombre', async () => {
    const { cabeceras } = await exportar();

    expect(cabeceras['content-type']).toContain('text/csv');
    expect(cabeceras['content-disposition']).toMatch(
      /attachment; filename="cuadre-movimientos-\d{4}-\d{2}-\d{2}\.csv"/,
    );
  });

  it('arranca con la marca que hace que Excel lea bien las tildes', async () => {
    const cuenta = await crearCuenta({ name: 'Bancolombía' });
    await registrar(cuenta.id, '-1000', { description: 'Camión' });

    const { texto } = await exportar();
    expect(texto.startsWith('﻿')).toBe(true);
    expect(texto).toContain('Bancolombía');
    expect(texto).toContain('Camión');
  });
});

describe('los montos', () => {
  it('salen exactos, con los cuatro decimales de la base', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '-1234.5678');

    expect((await filas())[0]).toContain('-1234.5678');
  });

  it('no se redondean ni se les cambia el separador decimal', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '-0.0001');

    const fila = (await filas())[0]!;
    expect(fila).toContain('-0.0001');
    expect(fila).not.toContain('-0,0001');
  });

  it('los centavos de muchos movimientos no se pierden por el camino', async () => {
    const cuenta = await crearCuenta();
    for (let i = 0; i < 10; i += 1) await registrar(cuenta.id, '-0.3333');

    const conMonto = (await filas()).filter((fila) => fila.includes('-0.3333'));
    expect(conMonto).toHaveLength(10);
  });
});

describe('qué es cada movimiento', () => {
  it('distingue el gasto del ingreso por el signo', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '-5000', { description: 'Almuerzo' });
    await registrar(cuenta.id, '9000', { description: 'Devolución' });

    // La celda vacía del medio es la categoría, que estos dos no tienen.
    const texto = (await exportar()).texto;
    expect(texto).toContain('Gasto,,Almuerzo,-5000.0000');
    expect(texto).toContain('Ingreso,,Devolución,9000.0000');
  });

  it('dos movimientos del mismo instante salen en el orden en que se registraron', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '-5000', { description: 'Primero' });
    await registrar(cuenta.id, '9000', { description: 'Segundo' });

    const descripciones = (await filas()).map((fila) => fila.split(',')[5]);
    expect(descripciones).toEqual(['Primero', 'Segundo']);
  });

  it('el saldo inicial se llama por su nombre y no cuenta como ingreso', async () => {
    await crearCuenta({ openingBalance: '500000' });

    const fila = (await filas())[0]!;
    expect(fila).toContain('Saldo inicial');
    expect(fila).not.toContain('Ingreso');
  });

  it('trae el nombre de la cuenta y de la categoría, no sus identificadores', async () => {
    const cuenta = await crearCuenta({ name: 'Efectivo' });
    const { cuerpo } = await pedirJson('POST', '/api/v1/categories', {
      name: 'Mercado',
      kind: 'expense',
    });
    await registrar(cuenta.id, '-30000', { categoryId: cuerpo.data.id });

    const fila = (await filas())[0]!;
    expect(fila).toContain('Efectivo');
    expect(fila).toContain('Mercado');
    expect(fila).not.toContain(cuenta.id.slice(0, 8) + ',');
  });

  it('un movimiento sin categoría deja la celda vacía', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '-1000', { description: 'Sin clasificar' });

    expect((await filas())[0]).toContain(',,Sin clasificar,');
  });
});

describe('las correcciones se ven', () => {
  it('la anulación y el movimiento original aparecen los dos, marcados', async () => {
    const cuenta = await crearCuenta();
    const gasto = await registrar(cuenta.id, '-7000', { description: 'Error' });
    await pedirJson('POST', `/api/v1/transactions/${gasto.id}/reversal`);

    const todas = await filas();
    expect(todas).toHaveLength(2);
    expect(todas.filter((fila) => fila.includes('Anulado'))).toHaveLength(1);
    expect(todas.filter((fila) => fila.includes('Anula otro movimiento'))).toHaveLength(1);
  });

  it('la anulación apunta al movimiento que anula', async () => {
    const cuenta = await crearCuenta();
    const gasto = await registrar(cuenta.id, '-7000');
    await pedirJson('POST', `/api/v1/transactions/${gasto.id}/reversal`);

    const anulacion = (await filas()).find((fila) => fila.includes('Anula otro movimiento'))!;
    expect(anulacion).toContain(gasto.id);
    expect(anulacion).toContain('7000');
  });

  it('una transferencia sale con sus dos patas y su grupo', async () => {
    const origen = await crearCuenta({ openingBalance: '100000' });
    const destino = await crearCuenta();
    const { cuerpo } = await pedirJson('POST', '/api/v1/transfers', {
      fromAccountId: origen.id,
      toAccountId: destino.id,
      amount: '25000',
      occurredAt: '2026-09-06T12:00:00Z',
    });

    const patas = (await filas()).filter((fila) => fila.includes('Transferencia'));
    expect(patas).toHaveLength(2);
    for (const pata of patas) expect(pata).toContain(cuerpo.data.transferGroupId);
  });
});

describe('el orden y la fecha', () => {
  it('va del movimiento más viejo al más nuevo', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '-100', { occurredAt: '2026-03-15T12:00:00Z' });
    await registrar(cuenta.id, '-200', { occurredAt: '2026-01-10T12:00:00Z' });
    await registrar(cuenta.id, '-300', { occurredAt: '2026-07-20T12:00:00Z' });

    const fechas = (await filas()).map((fila) => fila.split(',')[0]);
    expect(fechas).toEqual(['2026-01-10', '2026-03-15', '2026-07-20']);
  });

  it('la fecha se corta en hora de Bogotá, igual que el tablero', async () => {
    const cuenta = await crearCuenta();
    // Las 11 de la noche del 30 en Bogotá son el 1 de octubre en UTC.
    await registrar(cuenta.id, '-100', { occurredAt: '2026-10-01T04:00:00Z' });

    expect((await filas())[0]).toMatch(/^2026-09-30,/);
  });
});

describe('el texto libre no rompe el archivo', () => {
  it('una descripción con comas no corre las columnas', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '-1000', { description: 'Café, pan y leche' });

    const { texto } = await exportar();
    expect(texto).toContain('"Café, pan y leche"');
    expect(await filas()).toHaveLength(1);
  });

  it('una descripción con comillas sale con las comillas duplicadas', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '-1000', { description: 'El "mercado" del barrio' });

    expect((await exportar()).texto).toContain('"El ""mercado"" del barrio"');
  });

  it('un nombre de cuenta con coma tampoco la rompe', async () => {
    const cuenta = await crearCuenta({ name: 'Ahorros, los de verdad' });
    await registrar(cuenta.id, '-1000');

    expect((await exportar()).texto).toContain('"Ahorros, los de verdad"');
    expect(await filas()).toHaveLength(1);
  });
});

describe('nunca sale la plata de otra persona', () => {
  it('el archivo trae solo los movimientos de quien lo pide', async () => {
    const miCuenta = await crearCuenta({ name: 'Mi cuenta' });
    await registrar(miCuenta.id, '-1111', { description: 'Mi gasto' });

    // La misma app, pero respondiendo como otra persona.
    const otro = await crearUsuario();
    const appDelOtro = await construirApp({
      silencioso: true,
      resolverUsuario: async () => otro,
    });
    await appDelOtro.ready();

    const creada = await appDelOtro.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      payload: { name: 'Cuenta ajena', type: 'cash', currency: 'COP' },
    });
    expect(creada.statusCode, creada.body).toBe(201);

    const registrado = await appDelOtro.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      payload: {
        accountId: creada.json().data.id,
        amount: '-9999',
        occurredAt: '2026-09-05T12:00:00Z',
        description: 'Gasto ajeno',
      },
    });
    expect(registrado.statusCode, registrado.body).toBe(201);

    const mio = (await exportar()).texto;
    expect(mio).toContain('Mi gasto');
    expect(mio).not.toContain('Gasto ajeno');
    expect(mio).not.toContain('Cuenta ajena');
    expect(mio).not.toContain('-9999');

    await appDelOtro.close();
  });
});
