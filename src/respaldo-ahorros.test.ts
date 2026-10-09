/**
 * Pruebas del respaldo de los registros de ahorro:
 * `GET /api/v1/savings-entries/export`.
 *
 * Es un archivo aparte del de movimientos porque un registro de ahorro no es
 * un movimiento. Lo que se comprueba es que cuente la verdad completa: montos
 * exactos con signo, cada registro con su cuenta (también si se archivó) y nada
 * de otra persona adentro.
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
    .values({ email: `respaldo-ahorros-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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

async function pedir(metodo: 'GET' | 'POST', url: string, cuerpo?: unknown): Promise<any> {
  const respuesta = await app.inject({
    method: metodo,
    url,
    ...(cuerpo === undefined ? {} : { payload: cuerpo as object }),
  });
  return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
}

async function exportar(): Promise<{ estado: number; texto: string; cabeceras: any }> {
  const respuesta = await app.inject({ method: 'GET', url: '/api/v1/savings-entries/export' });
  return { estado: respuesta.statusCode, texto: respuesta.body, cabeceras: respuesta.headers };
}

/** Las líneas del archivo, sin la marca de Excel ni la línea vacía del final. */
async function lineas(): Promise<string[]> {
  const { estado, texto } = await exportar();
  expect(estado).toBe(200);
  return texto.replace(/^﻿/, '').trimEnd().split('\r\n');
}

async function filas(): Promise<string[]> {
  return (await lineas()).slice(1);
}

let contador = 0;
async function crearCuenta(extras: Record<string, unknown> = {}): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/accounts', {
    name: `Ahorro ${(contador += 1)}`,
    type: 'bank',
    currency: 'COP',
    isSavings: true,
    ...extras,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function anotar(
  cuentaId: string,
  amount: string,
  extras: Record<string, unknown> = {},
): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/savings-entries', {
    accountId: cuentaId,
    amount,
    occurredAt: '2026-09-05T17:00:00Z',
    ...extras,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

// -----------------------------------------------------------------------------

describe('el archivo', () => {
  it('sin registros trae el encabezado solo, no un archivo vacío', async () => {
    const todas = await lineas();

    expect(todas).toEqual(['Fecha,Cuenta,Moneda,Qué fue,Descripción,Monto,Id']);
  });

  it('se manda como descarga, con la fecha en el nombre y la marca de Excel', async () => {
    const { cabeceras, texto } = await exportar();

    expect(cabeceras['content-type']).toContain('text/csv');
    expect(cabeceras['content-disposition']).toMatch(
      /attachment; filename="cuadre-ahorros-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    expect(texto.startsWith('﻿')).toBe(true);
  });
});

describe('las filas', () => {
  it('dicen con palabras si apartaste o retiraste, y el monto sale exacto con su signo', async () => {
    const cuenta = await crearCuenta({ name: 'Bancolombía ahorros' });
    const aparte = await anotar(cuenta.id, '500000.1234', { description: 'Prima, junio' });
    const retiro = await anotar(cuenta.id, '-120000', {
      occurredAt: '2026-09-06T17:00:00Z',
    });

    expect(await filas()).toEqual([
      `2026-09-05,Bancolombía ahorros,COP,Aparté,"Prima, junio",500000.1234,${aparte.id}`,
      `2026-09-06,Bancolombía ahorros,COP,Retiré,,-120000.0000,${retiro.id}`,
    ]);
  });

  it('van del más viejo al más nuevo, sin importar el orden en que se anotaron', async () => {
    const cuenta = await crearCuenta();
    await anotar(cuenta.id, '300', { occurredAt: '2026-09-20T17:00:00Z' });
    await anotar(cuenta.id, '100', { occurredAt: '2026-09-02T17:00:00Z' });
    await anotar(cuenta.id, '200', { occurredAt: '2026-09-10T17:00:00Z' });

    expect((await filas()).map((fila) => fila.split(',')[0])).toEqual([
      '2026-09-02',
      '2026-09-10',
      '2026-09-20',
    ]);
  });

  it('la fecha es el día de la persona en Bogotá, no el de UTC', async () => {
    const cuenta = await crearCuenta();
    // 11:30 pm del 30 de septiembre en Bogotá = 1 de octubre en UTC.
    await anotar(cuenta.id, '1000', { occurredAt: '2026-10-01T04:30:00Z' });

    expect((await filas())[0]!.startsWith('2026-09-30,')).toBe(true);
  });

  it('también salen los de una cuenta que ya se archivó, con su nombre', async () => {
    const cuenta = await crearCuenta({ name: 'Ahorro viejo' });
    await anotar(cuenta.id, '750000');

    const archivada = await pedir('POST', `/api/v1/accounts/${cuenta.id}/archive`);
    expect(archivada.estado).toBe(200);

    const todas = await filas();
    expect(todas).toHaveLength(1);
    expect(todas[0]).toContain('Ahorro viejo');
  });

  it('nunca trae lo de otra persona', async () => {
    const mia = await crearCuenta({ name: 'La mía' });
    await anotar(mia.id, '111');

    const propia = usuarioId;
    usuarioId = await crearUsuario();
    const ajena = await crearCuenta({ name: 'La ajena' });
    await anotar(ajena.id, '999');

    usuarioId = propia;
    const todas = await filas();
    expect(todas).toHaveLength(1);
    expect(todas[0]).toContain('La mía');
    expect(todas.join('\n')).not.toContain('La ajena');
  });
});
