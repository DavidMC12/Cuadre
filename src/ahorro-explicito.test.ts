/**
 * Pruebas del núcleo del ahorro explícito.
 *
 * El saldo de una cuenta y lo ahorrado son cosas distintas: que una cuenta esté
 * marcada como de ahorro, o que le llegue un ingreso, no lo convierte en ahorro.
 * Cuenta como ahorro solo lo que la persona decide: una transferencia hacia o
 * desde una cuenta de ahorro, o un registro manual (`savings_entries`).
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from './aplicacion.js';
import { closeDb, db } from './db/client.js';
import { users } from './db/schema/index.js';
import * as reportes from './modules/reports/repository.js';
import * as ahorro from './modules/savings/repository.js';
import * as movimientos from './modules/transactions/repository.js';

let app: FastifyInstance;
let usuarioId: string;

async function crearUsuario(): Promise<string> {
  const [usuario] = await db
    .insert(users)
    .values({ email: `ahorro-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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

function mesRelativo(desplazamiento: number): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const anio = Number(partes.find((parte) => parte.type === 'year')!.value);
  const mes = Number(partes.find((parte) => parte.type === 'month')!.value);
  const total = anio * 12 + (mes - 1) + desplazamiento;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const MES = mesRelativo(0);
const MES_PASADO = mesRelativo(-1);
const DIA_5 = `${MES}-05T17:00:00Z`;
const DIA_5_PASADO = `${MES_PASADO}-05T17:00:00Z`;

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

async function transferir(origenId: string, destinoId: string, monto: string, ocurrioEn = DIA_5) {
  const resultado = await movimientos.registrarTransferencia(usuarioId, {
    origenId,
    destinoId,
    monto,
    ocurrioEn,
  });
  expect(resultado).not.toBeNull();
  return resultado!;
}

async function anotar(cuentaId: string, monto: string, ocurrioEn = DIA_5) {
  const registro = await ahorro.registrar(db, usuarioId, { cuentaId, monto, ocurrioEn });
  expect(registro).not.toBeNull();
  return registro!;
}

async function ahorradoEnElMes(cuentaId: string, mes = MES): Promise<string> {
  return reportes.ahorroDeUnaCuentaEnElMes(usuarioId, mes, cuentaId);
}

async function ahorradoDe(cuentaId: string): Promise<string> {
  const { cuerpo } = await pedir('GET', `/api/v1/accounts/${cuentaId}`);
  return cuerpo.data.saved;
}

// -----------------------------------------------------------------------------

describe('qué cuenta como ahorro', () => {
  it('un ingreso, un gasto, el saldo inicial y un ajuste NO son ahorro', async () => {
    const ahorros = await crearCuenta({ isSavings: true, openingBalance: '1000000' });

    await movimientos.registrar(db, usuarioId, { cuentaId: ahorros.id, monto: '2000000', ocurrioEn: DIA_5 });
    await movimientos.registrar(db, usuarioId, { cuentaId: ahorros.id, monto: '-267530', ocurrioEn: DIA_5 });
    await pedir('POST', `/api/v1/accounts/${ahorros.id}/adjust-balance`, { balance: '5000000' });

    expect(await ahorradoEnElMes(ahorros.id)).toBe('0.0000');
    expect(await ahorradoDe(ahorros.id)).toBe('0.0000');
    expect((await reportes.ahorroMensual(usuarioId, 1, 'COP'))[0]?.amount).toBe('0.0000');
    // El saldo, en cambio, sí tiene todo.
    const { cuerpo } = await pedir('GET', `/api/v1/accounts/${ahorros.id}`);
    expect(cuerpo.data.balance).toBe('5000000.0000');
  });

  it('una transferencia hacia la cuenta de ahorro sí lo es, y sacar plata lo baja', async () => {
    const banco = await crearCuenta({ openingBalance: '3000000' });
    const ahorros = await crearCuenta({ isSavings: true });

    await transferir(banco.id, ahorros.id, '500000');
    expect(await ahorradoEnElMes(ahorros.id)).toBe('500000.0000');
    expect(await ahorradoDe(ahorros.id)).toBe('500000.0000');
    expect((await reportes.ahorroMensual(usuarioId, 1, 'COP'))[0]?.amount).toBe('500000.0000');

    await transferir(ahorros.id, banco.id, '120000');
    expect(await ahorradoEnElMes(ahorros.id)).toBe('380000.0000');
    expect(await ahorradoDe(ahorros.id)).toBe('380000.0000');
  });

  it('anular la transferencia deshace el ahorro', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const ahorros = await crearCuenta({ isSavings: true });
    const t = await transferir(banco.id, ahorros.id, '200000');

    const grupoNuevo = randomUUID();
    await db.transaction(async (tx) => {
      for (const pata of t.patas) {
        await movimientos.registrar(tx, usuarioId, {
          cuentaId: pata.accountId,
          monto: pata.amount.startsWith('-') ? pata.amount.slice(1) : `-${pata.amount}`,
          ocurrioEn: DIA_5,
          tipo: 'transfer',
          grupoDeTransferencia: grupoNuevo,
          anula: pata.id,
        });
      }
      await tx.execute(sql`set constraints all immediate`);
    });

    expect(await ahorradoEnElMes(ahorros.id)).toBe('0.0000');
    expect(await ahorradoDe(ahorros.id)).toBe('0.0000');
  });

  it('un registro manual cuenta, positivo o negativo', async () => {
    const ahorros = await crearCuenta({ isSavings: true, openingBalance: '1629970' });

    await anotar(ahorros.id, '800000');
    await anotar(ahorros.id, '-100000');

    expect(await ahorradoEnElMes(ahorros.id)).toBe('700000.0000');
    expect(await ahorradoDe(ahorros.id)).toBe('700000.0000');
    expect((await reportes.ahorroMensual(usuarioId, 1, 'COP'))[0]?.amount).toBe('700000.0000');
    // El saldo no se movió: lo ahorrado y lo que tienes son cosas distintas.
    const { cuerpo } = await pedir('GET', `/api/v1/accounts/${ahorros.id}`);
    expect(cuerpo.data.balance).toBe('1629970.0000');
  });

  it('el ahorro de un mes no se mezcla con el de otro, y la gráfica lo reparte por mes', async () => {
    const banco = await crearCuenta({ openingBalance: '3000000' });
    const ahorros = await crearCuenta({ isSavings: true });

    await transferir(banco.id, ahorros.id, '100000', DIA_5_PASADO);
    await anotar(ahorros.id, '30000', DIA_5);

    expect(await ahorradoEnElMes(ahorros.id, MES_PASADO)).toBe('100000.0000');
    expect(await ahorradoEnElMes(ahorros.id, MES)).toBe('30000.0000');
    expect(await ahorradoDe(ahorros.id)).toBe('130000.0000');

    const meses = await reportes.ahorroMensual(usuarioId, 2, 'COP');
    expect(meses.map((m) => [m.month, m.amount])).toEqual([
      [MES_PASADO, '100000.0000'],
      [MES, '30000.0000'],
    ]);
  });

  it('una cuenta que no es de ahorro no ahorra, y nunca se mezclan monedas', async () => {
    const corriente = await crearCuenta({ openingBalance: '900000' });
    const otra = await crearCuenta();
    const usd = await crearCuenta({ currency: 'USD', isSavings: true });
    const usdBanco = await crearCuenta({ currency: 'USD', openingBalance: '500' });

    await transferir(corriente.id, otra.id, '100000');
    await transferir(usdBanco.id, usd.id, '50');

    expect(await ahorradoDe(otra.id)).toBe('0.0000');
    expect((await reportes.ahorroMensual(usuarioId, 1, 'COP'))[0]?.amount).toBe('0.0000');
    expect((await reportes.ahorroMensual(usuarioId, 1, 'USD'))[0]?.amount).toBe('50.0000');
  });
});

describe('registros manuales de ahorro', () => {
  it('solo se anotan en una cuenta de ahorro activa y propia', async () => {
    const normal = await crearCuenta();
    const archivada = await crearCuenta({ isSavings: true });
    await pedir('POST', `/api/v1/accounts/${archivada.id}/archive`);

    for (const cuentaId of [normal.id, archivada.id, randomUUID()]) {
      expect(await ahorro.registrar(db, usuarioId, { cuentaId, monto: '1000', ocurrioEn: DIA_5 })).toBeNull();
    }
  });

  it('toman la moneda de la cuenta y se listan, el más reciente primero', async () => {
    const ahorros = await crearCuenta({ isSavings: true, currency: 'USD' });
    await anotar(ahorros.id, '10', DIA_5_PASADO);
    await anotar(ahorros.id, '-3', DIA_5);

    const lista = await ahorro.listarDeUnaCuenta(db, usuarioId, ahorros.id, 10);
    expect(lista.map((r) => [r.amount, r.currency])).toEqual([
      ['-3.0000', 'USD'],
      ['10.0000', 'USD'],
    ]);
  });

  it('son inmutables: ni se editan ni se borran', async () => {
    const ahorros = await crearCuenta({ isSavings: true });
    const registro = await anotar(ahorros.id, '1000');

    await expect(
      db.execute(sql`update savings_entries set amount = 5 where id = ${registro.id}::uuid`),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`delete from savings_entries where id = ${registro.id}::uuid`),
    ).rejects.toThrow();
  });

  it('el cero no es un registro', async () => {
    const ahorros = await crearCuenta({ isSavings: true });

    await expect(ahorro.registrar(db, usuarioId, { cuentaId: ahorros.id, monto: '0', ocurrioEn: DIA_5 })).rejects.toThrow();
  });

  it('no se ven entre personas', async () => {
    const ahorros = await crearCuenta({ isSavings: true });
    await anotar(ahorros.id, '1000');

    const otro = await crearUsuario();
    expect(await ahorro.listarDeUnaCuenta(db, otro, ahorros.id, 10)).toEqual([]);
    expect(await ahorro.registrar(db, otro, { cuentaId: ahorros.id, monto: '1', ocurrioEn: DIA_5 })).toBeNull();
  });
});
