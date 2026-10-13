/**
 * Pruebas de punta a punta de las lecturas "al cierre de un mes" por HTTP:
 * el saldo y el ahorro de las cuentas con `?month=YYYY-MM`, y las gráficas de
 * tendencia y ahorro con `?until=YYYY-MM`.
 *
 * El núcleo de dinero (repository + sus pruebas) ya existe; aquí lo que se
 * comprueba es que la ruta lo exponga, valide el mes en el borde y no deje
 * asomar nada de otra persona. Cada prueba trabaja con un usuario recién
 * creado y con números escritos a mano.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from './aplicacion.js';
import { closeDb, db } from './db/client.js';
import { accounts, users } from './db/schema/index.js';

let app: FastifyInstance;
let usuarioId: string;

async function crearUsuario(): Promise<string> {
  const [usuario] = await db
    .insert(users)
    .values({ email: `cierre-api-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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

async function pedir(metodo: 'GET' | 'POST', url: string, cuerpo?: unknown): Promise<Respuesta> {
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

/** Mediodía en Bogotá del día 10 de un mes: bien lejos de los bordes. */
const dia10 = (mes: string) => `${mes}-10T17:00:00Z`;

async function registrarEn(
  cuentaId: string,
  monto: string,
  occurredAt: string,
): Promise<void> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/transactions', {
    accountId: cuentaId,
    amount: monto,
    occurredAt,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
}

const registrar = (cuentaId: string, monto: string, mes: string) =>
  registrarEn(cuentaId, monto, dia10(mes));

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

async function archivar(cuentaId: string): Promise<void> {
  const { estado, cuerpo } = await pedir('POST', `/api/v1/accounts/${cuentaId}/archive`);
  expect(estado, JSON.stringify(cuerpo)).toBe(200);
}

/** Lista las cuentas por HTTP; `month` es opcional. Devuelve `data`. */
async function listar(opciones: { month?: string; includeArchived?: boolean } = {}): Promise<any[]> {
  const query = new URLSearchParams();
  if (opciones.month !== undefined) query.set('month', opciones.month);
  if (opciones.includeArchived) query.set('includeArchived', 'true');
  const cadena = query.toString();

  const { estado, cuerpo } = await pedir('GET', `/api/v1/accounts${cadena ? `?${cadena}` : ''}`);
  expect(estado, JSON.stringify(cuerpo)).toBe(200);
  return cuerpo.data;
}

// `any` a propósito: el helper solo busca por id y devuelve la fila tal cual.
const porId = (cuentas: any[], id: string): any => cuentas.find((cuenta) => cuenta.id === id);

/** El mes de hoy en Bogotá, corrido tantos meses hacia atrás. */
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

// -----------------------------------------------------------------------------

describe('cuentas al cierre por HTTP', () => {
  it('con month, el balance y lo ahorrado son del cierre; sin month, los de hoy', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '1000000', '2026-07');
    await registrar(cuenta.id, '-250000', '2026-08');
    await registrar(cuenta.id, '-100000', '2026-09');
    await registrar(cuenta.id, '-400000', '2026-10');

    const banco = await crearCuenta();
    const ahorro = await crearCuenta({ isSavings: true });
    await transferir(banco.id, ahorro.id, '300000', '2026-08');
    await apartar(ahorro.id, '50000', '2026-08');
    await transferir(banco.id, ahorro.id, '200000', '2026-09');

    const cierre = await listar({ month: '2026-09' });
    expect(porId(cierre, cuenta.id).balance).toBe('650000.0000');
    expect(porId(cierre, ahorro.id).saved).toBe('550000.0000');

    // Sin `month` sigue siendo el saldo de hoy: el movimiento de octubre entra.
    const hoy = await listar();
    expect(porId(hoy, cuenta.id).balance).toBe('250000.0000');
    expect(porId(hoy, ahorro.id).saved).toBe('550000.0000');
  });

  it('un mes inválido responde 400, no 500', async () => {
    for (const mes of ['2026-13', '1999-12', 'septiembre']) {
      const { estado, cuerpo } = await pedir('GET', `/api/v1/accounts?month=${mes}`);
      expect(estado, `mes ${mes}`).toBe(400);
      expect(cuerpo.error.code, `mes ${mes}`).toBe('VALIDATION_ERROR');
    }
  });

  it('el borde del mes se corta en hora de Bogotá', async () => {
    const cuenta = await crearCuenta();
    // 23:30 del 30 de septiembre en Bogotá (UTC-5) = 04:30 UTC del 1 de octubre.
    await registrarEn(cuenta.id, '-40000', '2026-10-01T04:30:00Z');
    // 00:30 del 1 de octubre en Bogotá = 05:30 UTC del 1 de octubre.
    await registrarEn(cuenta.id, '-7000', '2026-10-01T05:30:00Z');

    const cierre = await listar({ month: '2026-09' });
    expect(porId(cierre, cuenta.id).balance).toBe('-40000.0000');
    expect(porId(cierre, cuenta.id).movementCount).toBe(1);
  });

  it('una cuenta archivada después del cierre sale abierta, y hoy ya no', async () => {
    const vieja = await crearCuenta();
    await registrar(vieja.id, '500000', '2026-06');
    await archivar(vieja.id);

    // El cierre de junio es anterior a que la archiváramos: entonces estaba abierta.
    const enJunio = await listar({ month: '2026-06' });
    expect(porId(enJunio, vieja.id).balance).toBe('500000.0000');
    expect(porId(enJunio, vieja.id).archivedAt).toBeNull();

    const enJunioConArchivadas = await listar({ month: '2026-06', includeArchived: true });
    expect(porId(enJunioConArchivadas, vieja.id).archivedAt).toBeNull();

    // Hoy sí está archivada: sin incluir archivadas no sale; incluyéndolas, sí y marcada.
    expect(porId(await listar(), vieja.id)).toBeUndefined();
    const hoyConArchivadas = await listar({ includeArchived: true });
    expect(porId(hoyConArchivadas, vieja.id).archivedAt).not.toBeNull();
  });

  it('una cuenta archivada ANTES del cierre no sale sin incluir archivadas', async () => {
    const vieja = await crearCuenta();
    await registrar(vieja.id, '500000', '2026-06');
    // La archivamos antes del cierre de junio, para probar el otro lado del borde.
    await db
      .update(accounts)
      .set({ archivedAt: new Date('2026-05-20T17:00:00Z') })
      .where(eq(accounts.id, vieja.id));

    const sin = await listar({ month: '2026-06' });
    expect(porId(sin, vieja.id)).toBeUndefined();

    const con = await listar({ month: '2026-06', includeArchived: true });
    expect(porId(con, vieja.id).archivedAt).not.toBeNull();
  });

  it('no deja asomar las cuentas de otra persona', async () => {
    const mia = await crearCuenta();
    await registrar(mia.id, '700000', '2026-06');

    usuarioId = await crearUsuario();

    expect(await listar({ month: '2026-06', includeArchived: true })).toEqual([]);
  });
});

describe('gráficas que terminan en until por HTTP', () => {
  it('la tendencia termina en el mes pedido y conserva los meses vacíos', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '800000', '2026-03');
    await registrar(cuenta.id, '-300000', '2026-05');

    const { estado, cuerpo } = await pedir(
      'GET',
      '/api/v1/reports/trend?months=4&currency=COP&until=2026-05',
    );

    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data).toEqual([
      { month: '2026-02', income: '0.0000', expense: '0.0000' },
      { month: '2026-03', income: '800000.0000', expense: '0.0000' },
      { month: '2026-04', income: '0.0000', expense: '0.0000' },
      { month: '2026-05', income: '0.0000', expense: '300000.0000' },
    ]);
  });

  it('el ahorro mensual termina en el mes pedido', async () => {
    const banco = await crearCuenta();
    const ahorro = await crearCuenta({ isSavings: true });
    await transferir(banco.id, ahorro.id, '100000', '2026-03');
    await transferir(banco.id, ahorro.id, '70000', '2026-06');

    const { estado, cuerpo } = await pedir(
      'GET',
      '/api/v1/reports/savings-trend?months=3&currency=COP&until=2026-04',
    );

    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data).toEqual([
      { month: '2026-02', amount: '0.0000' },
      { month: '2026-03', amount: '100000.0000' },
      { month: '2026-04', amount: '0.0000' },
    ]);
  });

  it('un until inválido responde 400 en las dos gráficas', async () => {
    for (const until of ['2026-13', '1999-12', 'septiembre']) {
      const tendencia = await pedir(
        'GET',
        `/api/v1/reports/trend?currency=COP&until=${until}`,
      );
      expect(tendencia.estado, `trend until ${until}`).toBe(400);

      const ahorro = await pedir(
        'GET',
        `/api/v1/reports/savings-trend?currency=COP&until=${until}`,
      );
      expect(ahorro.estado, `savings until ${until}`).toBe(400);
    }
  });

  it('sin until siguen terminando en el mes de hoy, como antes', async () => {
    const tendencia = await pedir('GET', '/api/v1/reports/trend?months=3&currency=COP');
    expect(tendencia.cuerpo.data).toHaveLength(3);
    expect(tendencia.cuerpo.data[2].month).toBe(mesRelativo(0));

    const ahorro = await pedir('GET', '/api/v1/reports/savings-trend?months=2&currency=COP');
    expect(ahorro.cuerpo.data).toHaveLength(2);
    expect(ahorro.cuerpo.data[1].month).toBe(mesRelativo(0));
  });

  it('no mezcla los datos de otra persona', async () => {
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '-100000', '2026-06');

    usuarioId = await crearUsuario();

    const tendencia = await pedir(
      'GET',
      '/api/v1/reports/trend?months=1&currency=COP&until=2026-06',
    );
    expect(tendencia.cuerpo.data).toEqual([
      { month: '2026-06', income: '0.0000', expense: '0.0000' },
    ]);
  });
});

describe('durante una suplantación estas lecturas se pueden (solo mirar)', () => {
  it('el saldo al cierre y las gráficas responden 200', async () => {
    usuarioId = await crearUsuario();
    const cuenta = await crearCuenta();
    await registrar(cuenta.id, '500000', '2026-06');

    const appSuplantando = await construirApp({
      silencioso: true,
      resolverUsuario: async () => usuarioId,
      esAdmin: true,
      suplantada: true,
    });
    await appSuplantando.ready();

    const rutas = [
      '/api/v1/accounts?month=2026-06',
      '/api/v1/accounts?month=2026-06&includeArchived=true',
      '/api/v1/reports/trend?months=3&currency=COP&until=2026-06',
      '/api/v1/reports/savings-trend?months=3&currency=COP&until=2026-06',
    ];

    for (const url of rutas) {
      const respuesta = await appSuplantando.inject({ method: 'GET', url });
      expect(respuesta.statusCode, url).toBe(200);
    }

    const cuentas = await appSuplantando.inject({ method: 'GET', url: '/api/v1/accounts?month=2026-06' });
    expect(cuentas.json().data[0].balance).toBe('500000.0000');

    await appSuplantando.close();
  });
});
