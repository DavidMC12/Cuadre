/**
 * Pruebas del saldo y el ahorro "al cierre de un mes": las cuentas cortadas en
 * una fecha y las gráficas mensuales que terminan en un mes elegido.
 *
 * Los datos se crean por la API (así pasan por las reglas de siempre) y la
 * consulta se llama directo al repositorio: la ruta HTTP de estas lecturas
 * vive aparte. Cada prueba trabaja con un usuario recién creado.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from './aplicacion.js';
import { closeDb, db } from './db/client.js';
import { users } from './db/schema/index.js';
import * as cuentasRepo from './modules/accounts/repository.js';
import type { Cuenta } from './modules/accounts/schemas.js';
import * as reportesRepo from './modules/reports/repository.js';

let app: FastifyInstance;
let usuarioId: string;

async function crearUsuario(): Promise<string> {
  const [usuario] = await db
    .insert(users)
    .values({ email: `cierre-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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

async function pedir(metodo: 'GET' | 'POST', url: string, cuerpo?: unknown) {
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

/** Mediodía en Bogotá del día 10 de un mes: lejos de los bordes. */
const dia10 = (mes: string) => `${mes}-10T17:00:00Z`;

async function registrar(cuentaId: string, monto: string, mes: string): Promise<void> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/transactions', {
    accountId: cuentaId,
    amount: monto,
    occurredAt: dia10(mes),
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
}

async function transferir(desde: string, hacia: string, monto: string, mes: string): Promise<void> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
    fromAccountId: desde,
    toAccountId: hacia,
    amount: monto,
    occurredAt: dia10(mes),
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
}

async function apartar(cuentaId: string, monto: string, mes: string): Promise<void> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/savings-entries', {
    accountId: cuentaId,
    amount: monto,
    occurredAt: dia10(mes),
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
}

const porId = (cuentas: Cuenta[], id: string): Cuenta | undefined =>
  cuentas.find((cuenta) => cuenta.id === id);

// -----------------------------------------------------------------------------

describe('cuentas al cierre de un mes', () => {
  it('el saldo suma solo lo ocurrido hasta el último instante de ese mes', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '1000000', '2026-07');
    await registrar(cuenta.id, '-250000', '2026-08');
    await registrar(cuenta.id, '-100000', '2026-09');

    const alCierreDeJulio = await cuentasRepo.listarAlCierreDelMes(usuarioId, '2026-07', false);
    const alCierreDeAgosto = await cuentasRepo.listarAlCierreDelMes(usuarioId, '2026-08', false);
    const alCierreDeSeptiembre = await cuentasRepo.listarAlCierreDelMes(usuarioId, '2026-09', false);

    expect(porId(alCierreDeJulio, cuenta.id)?.balance).toBe('1000000.0000');
    expect(porId(alCierreDeAgosto, cuenta.id)?.balance).toBe('750000.0000');
    expect(porId(alCierreDeSeptiembre, cuenta.id)?.balance).toBe('650000.0000');
  });

  it('un movimiento del último día del mes entra, y el del primer día del siguiente no', async () => {
    const cuenta = await crearCuenta();
    // 23:30 del 30 de septiembre en Bogotá (UTC-5) = 04:30 UTC del 1 de octubre.
    await pedir('POST', '/api/v1/transactions', {
      accountId: cuenta.id,
      amount: '-40000',
      occurredAt: '2026-10-01T04:30:00Z',
    });
    // 00:30 del 1 de octubre en Bogotá = 05:30 UTC del 1 de octubre.
    await pedir('POST', '/api/v1/transactions', {
      accountId: cuenta.id,
      amount: '-7000',
      occurredAt: '2026-10-01T05:30:00Z',
    });

    const alCierre = await cuentasRepo.listarAlCierreDelMes(usuarioId, '2026-09', false);

    expect(porId(alCierre, cuenta.id)?.balance).toBe('-40000.0000');
    expect(porId(alCierre, cuenta.id)?.movementCount).toBe(1);
  });

  it('lo ahorrado cuenta transferencias y registros manuales hasta el cierre, no el saldo', async () => {
    const banco = await crearCuenta();
    const ahorro = await crearCuenta({ isSavings: true });
    await registrar(banco.id, '2000000', '2026-07');
    await transferir(banco.id, ahorro.id, '300000', '2026-08');
    await apartar(ahorro.id, '50000', '2026-08');
    await transferir(banco.id, ahorro.id, '200000', '2026-09');
    await apartar(ahorro.id, '-20000', '2026-09');
    // Un ingreso que cae en la cuenta de ahorro es saldo, nunca ahorro.
    await registrar(ahorro.id, '999000', '2026-08');

    const alCierreDeJulio = await cuentasRepo.listarAlCierreDelMes(usuarioId, '2026-07', false);
    const alCierreDeAgosto = await cuentasRepo.listarAlCierreDelMes(usuarioId, '2026-08', false);
    const alCierreDeSeptiembre = await cuentasRepo.listarAlCierreDelMes(usuarioId, '2026-09', false);

    expect(porId(alCierreDeJulio, ahorro.id)?.saved).toBe('0.0000');
    expect(porId(alCierreDeAgosto, ahorro.id)?.saved).toBe('350000.0000');
    expect(porId(alCierreDeSeptiembre, ahorro.id)?.saved).toBe('530000.0000');
    // El saldo de la cuenta de ahorro sí incluye el ingreso.
    expect(porId(alCierreDeAgosto, ahorro.id)?.balance).toBe('1299000.0000');
    // Una cuenta que no es de ahorro nunca tiene "ahorrado".
    expect(porId(alCierreDeSeptiembre, banco.id)?.saved).toBe('0.0000');
  });

  it('una cuenta archivada después del cierre cuenta como abierta; antes, no', async () => {
    const vieja = await crearCuenta();
    await registrar(vieja.id, '500000', '2026-06');

    // Archivar es "hoy" (octubre de 2026 o después): el cierre de junio es anterior.
    const archivada = await pedir('POST', `/api/v1/accounts/${vieja.id}/archive`);
    expect(archivada.estado, JSON.stringify(archivada.cuerpo)).toBe(200);

    const sinArchivadasEnJunio = await cuentasRepo.listarAlCierreDelMes(usuarioId, '2026-06', false);
    expect(porId(sinArchivadasEnJunio, vieja.id)?.balance).toBe('500000.0000');
    expect(porId(sinArchivadasEnJunio, vieja.id)?.archivedAt).toBeNull();

    // Hoy sí está archivada: sin incluir archivadas, no sale; incluyéndolas, sale marcada.
    const hoy = new Date();
    const mesDeHoy = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, '0')}`;
    const hoySinArchivadas = await cuentasRepo.listarAlCierreDelMes(usuarioId, mesDeHoy, false);
    expect(porId(hoySinArchivadas, vieja.id)).toBeUndefined();
    const hoyConArchivadas = await cuentasRepo.listarAlCierreDelMes(usuarioId, mesDeHoy, true);
    expect(porId(hoyConArchivadas, vieja.id)?.archivedAt).not.toBeNull();
  });

  it('un mes sin ningún movimiento da saldo cero, y nunca mezcla a otra persona', async () => {
    const mia = await crearCuenta();
    await registrar(mia.id, '123456', '2026-05');

    const otraPersona = await crearUsuario();
    const lasDeOtra = await cuentasRepo.listarAlCierreDelMes(otraPersona, '2026-05', true);
    expect(lasDeOtra).toEqual([]);

    const antes = await cuentasRepo.listarAlCierreDelMes(usuarioId, '2026-04', false);
    expect(porId(antes, mia.id)?.balance).toBe('0.0000');
    expect(porId(antes, mia.id)?.movementCount).toBe(0);
    expect(porId(antes, mia.id)?.lastMovementAt).toBeNull();
  });
});

describe('gráficas mensuales que terminan en un mes elegido', () => {
  it('la tendencia termina en el mes pedido y conserva los meses vacíos', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '800000', '2026-03');
    await registrar(cuenta.id, '-300000', '2026-05');

    const filas = await reportesRepo.tendencia(usuarioId, 4, 'COP', '2026-05');

    expect(filas.map((fila) => fila.month)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05']);
    expect(filas.map((fila) => fila.income)).toEqual([
      '0.0000',
      '800000.0000',
      '0.0000',
      '0.0000',
    ]);
    expect(filas.map((fila) => fila.expense)).toEqual([
      '0.0000',
      '0.0000',
      '0.0000',
      '300000.0000',
    ]);
  });

  it('sin mes pedido sigue terminando en el mes de hoy', async () => {
    const filas = await reportesRepo.tendencia(usuarioId, 3, 'COP');
    const ultimo = filas[filas.length - 1]!.month;

    const hoy = new Date();
    const hoyEnBogota = new Date(hoy.getTime() - 5 * 60 * 60 * 1000);
    const esperado = `${hoyEnBogota.getUTCFullYear()}-${String(hoyEnBogota.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(ultimo).toBe(esperado);
    expect(filas).toHaveLength(3);
  });

  it('el ahorro mensual termina en el mes pedido y suma solo traslados y registros', async () => {
    const banco = await crearCuenta();
    const ahorro = await crearCuenta({ isSavings: true });
    await registrar(banco.id, '1000000', '2026-02');
    await transferir(banco.id, ahorro.id, '100000', '2026-03');
    await apartar(ahorro.id, '25000', '2026-04');
    await transferir(banco.id, ahorro.id, '70000', '2026-06');

    const filas = await reportesRepo.ahorroMensual(usuarioId, 3, 'COP', '2026-04');

    expect(filas.map((fila) => [fila.month, fila.amount])).toEqual([
      ['2026-02', '0.0000'],
      ['2026-03', '100000.0000'],
      ['2026-04', '25000.0000'],
    ]);
  });
});
