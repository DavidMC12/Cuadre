/**
 * Pruebas del ajuste de saldo, de punta a punta con `app.inject()`.
 *
 * "Editar la deuda" de una tarjeta (o el saldo de cualquier cuenta) no cambia
 * ningún número: el saldo se calcula sumando movimientos inmutables. Se escribe
 * un movimiento de ajuste por la diferencia hasta llegar al saldo deseado. Lo
 * que importa aquí: que el saldo quede EXACTO, que el ajuste no cuente como
 * gasto ni ingreso ni ahorro en ningún reporte, que no se anule ni se
 * categorice, y que dos ajustes simultáneos no se pisen.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from './aplicacion.js';
import { closeDb, db } from './db/client.js';
import { users } from './db/schema/index.js';
import { traducirErrorDePostgres } from './http/errores.js';

let app: FastifyInstance;
let usuarioId: string;

async function crearUsuario(): Promise<string> {
  const [usuario] = await db
    .insert(users)
    .values({ email: `ajuste-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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

/** El mes de hoy en Bogotá, como lo calcula el servidor. */
function mesActual(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const anio = partes.find((parte) => parte.type === 'year')!.value;
  const mes = partes.find((parte) => parte.type === 'month')!.value;
  return `${anio}-${mes}`;
}

const MES = mesActual();
const DIA_15 = `${MES}-15T17:00:00Z`;

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

async function saldoDe(cuentaId: string): Promise<string> {
  const { cuerpo } = await pedir('GET', `/api/v1/accounts/${cuentaId}`);
  return cuerpo.data.balance;
}

async function ajustar(cuentaId: string, balance: string): Promise<Respuesta> {
  return pedir('POST', `/api/v1/accounts/${cuentaId}/adjust-balance`, { balance });
}

async function crearCategoria(nombre: string, tipo = 'expense'): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/categories', { name: nombre, kind: tipo });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function contarAjustes(cuentaId: string): Promise<number> {
  const filas = (await db.execute(sql`
    select count(*)::int as n from transactions
    where account_id = ${cuentaId}::uuid and kind = 'adjustment'
  `)) as unknown as { n: number }[];
  return filas[0]!.n;
}

// -----------------------------------------------------------------------------

describe('ajustar el saldo de una cuenta', () => {
  it('sube la deuda de una tarjeta: el saldo queda exacto y el ajuste lleva la diferencia', async () => {
    const tarjeta = await crearCuenta({ type: 'card', openingBalance: '-100000' });

    const { estado, cuerpo } = await ajustar(tarjeta.id, '-350000');

    expect(estado, JSON.stringify(cuerpo)).toBe(201);
    expect(cuerpo.data).toMatchObject({
      accountId: tarjeta.id,
      kind: 'adjustment',
      amount: '-250000.0000',
      currency: 'COP',
      categoryId: null,
      description: 'Ajuste de saldo',
      reversesTransactionId: null,
    });
    expect(await saldoDe(tarjeta.id)).toBe('-350000.0000');
  });

  it('baja la deuda, y también puede dejarla sobrepagada (saldo a favor)', async () => {
    const tarjeta = await crearCuenta({ type: 'card', openingBalance: '-350000' });

    const bajo = await ajustar(tarjeta.id, '-80000');
    expect(bajo.cuerpo.data.amount).toBe('270000.0000');
    expect(await saldoDe(tarjeta.id)).toBe('-80000.0000');

    const sobrepagada = await ajustar(tarjeta.id, '50000.50');
    expect(sobrepagada.cuerpo.data.amount).toBe('130000.5000');
    expect(await saldoDe(tarjeta.id)).toBe('50000.5000');
  });

  it('deja una cuenta en cero, con el cero escrito como sea', async () => {
    const cuenta = await crearCuenta({ openingBalance: '120000' });

    const { estado, cuerpo } = await ajustar(cuenta.id, '00');

    expect(estado, JSON.stringify(cuerpo)).toBe(201);
    expect(cuerpo.data.amount).toBe('-120000.0000');
    expect(await saldoDe(cuenta.id)).toBe('0.0000');
  });

  it('funciona sobre una cuenta sin movimientos', async () => {
    const cuenta = await crearCuenta();

    const { estado, cuerpo } = await ajustar(cuenta.id, '75000');

    expect(estado, JSON.stringify(cuerpo)).toBe(201);
    expect(cuerpo.data.amount).toBe('75000.0000');
    expect(await saldoDe(cuenta.id)).toBe('75000.0000');
  });

  it('si ya tiene ese saldo no escribe nada: 422 con mensaje', async () => {
    const cuenta = await crearCuenta({ openingBalance: '90000' });

    for (const balance of ['90000', '90000.0000']) {
      const { estado, cuerpo } = await ajustar(cuenta.id, balance);
      expect(estado, balance).toBe(422);
      expect(cuerpo.error.code).toBe('RULE_VIOLATION');
      expect(cuerpo.error.message).toBe('Esa cuenta ya tiene ese saldo.');
    }
    expect(await contarAjustes(cuenta.id)).toBe(0);
  });

  it('una cuenta archivada no se ajusta: 422 que lo dice', async () => {
    const cuenta = await crearCuenta({ openingBalance: '90000' });
    await pedir('POST', `/api/v1/accounts/${cuenta.id}/archive`);

    const { estado, cuerpo } = await ajustar(cuenta.id, '10000');

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toContain('archivada');
    expect(await saldoDe(cuenta.id)).toBe('90000.0000');
  });

  it('responde 404 si la cuenta no existe o es de otra persona', async () => {
    const cuenta = await crearCuenta({ openingBalance: '90000' });

    expect((await ajustar(randomUUID(), '1000')).estado).toBe(404);

    usuarioId = await crearUsuario();
    expect((await ajustar(cuenta.id, '1000')).estado).toBe(404);
  });

  it('el cruce de un extremo al otro de lo que cabe responde 422, no 500', async () => {
    const cuenta = await crearCuenta({ openingBalance: '999999999999999.9999' });

    // De +999999999999999.9999 a -999999999999999.9999 la diferencia no cabe en
    // NUMERIC(19,4): es una entrada válida para el borde que la base no puede
    // guardar. Lo que importa es que sea un error claro y que no se escriba nada.
    const { estado, cuerpo } = await ajustar(cuenta.id, '-999999999999999.9999');

    expect(estado, JSON.stringify(cuerpo)).toBe(422);
    expect(cuerpo.error.message).toBe('Ese monto es demasiado grande para guardarlo.');
    expect(await saldoDe(cuenta.id)).toBe('999999999999999.9999');
    expect(await contarAjustes(cuenta.id)).toBe(0);

    // En una sola dirección sí cabe, y el saldo queda exacto.
    expect((await ajustar(cuenta.id, '0')).estado).toBe(201);
    expect(await saldoDe(cuenta.id)).toBe('0.0000');
  });

  it('rechaza un saldo mal escrito con 400', async () => {
    const cuenta = await crearCuenta();

    for (const balance of ['abc', '', '1.00001', '1,5']) {
      expect((await ajustar(cuenta.id, balance)).estado, balance).toBe(400);
    }
    const sinCampo = await pedir('POST', `/api/v1/accounts/${cuenta.id}/adjust-balance`, {});
    expect(sinCampo.estado).toBe(400);
  });
});

// -----------------------------------------------------------------------------

describe('dos ajustes a la vez', () => {
  // La garantía tiene dos capas: el `for update` de la fila de la cuenta y el
  // lock de fila que toma, por la llave foránea compuesta, cualquier INSERT en
  // `transactions` de esa misma cuenta. Esta prueba comprueba el resultado, que
  // es lo que importa; no distingue cuál de las dos capas lo aseguró.
  it('se hacen en fila: uno escribe y los demás ven que ya coincide', async () => {
    const tarjeta = await crearCuenta({ type: 'card', openingBalance: '-100000' });

    const respuestas = await Promise.all(
      Array.from({ length: 6 }, () => ajustar(tarjeta.id, '-350000')),
    );

    const exitos = respuestas.filter((r) => r.estado === 201);
    const rechazos = respuestas.filter((r) => r.estado === 422);
    expect(exitos).toHaveLength(1);
    expect(rechazos).toHaveLength(5);
    expect(await contarAjustes(tarjeta.id)).toBe(1);
    expect(await saldoDe(tarjeta.id)).toBe('-350000.0000');
  });

  it('dos ajustes distintos a la vez terminan en el último que se ejecutó, sin perder plata', async () => {
    const cuenta = await crearCuenta({ openingBalance: '100000' });

    const respuestas = await Promise.all([ajustar(cuenta.id, '300000'), ajustar(cuenta.id, '500000')]);

    expect(respuestas.map((r) => r.estado)).toEqual([201, 201]);
    // Cualquiera de los dos órdenes es válido; lo que no puede pasar es un saldo
    // que no sea ninguno de los dos pedidos.
    expect(['300000.0000', '500000.0000']).toContain(await saldoDe(cuenta.id));
  });
});

// -----------------------------------------------------------------------------

describe('el ajuste no es gasto, ingreso ni ahorro', () => {
  it('no cambia el resumen del mes ni los gastos por categoría', async () => {
    const cuenta = await crearCuenta({ openingBalance: '1000000' });
    const comida = await crearCategoria('Comida');
    const salario = await crearCategoria('Salario', 'income');
    await pedir('POST', '/api/v1/transactions', {
      accountId: cuenta.id,
      amount: '-60000',
      categoryId: comida.id,
      occurredAt: DIA_15,
    });
    await pedir('POST', '/api/v1/transactions', {
      accountId: cuenta.id,
      amount: '400000',
      categoryId: salario.id,
      occurredAt: DIA_15,
    });

    const antes = await pedir('GET', `/api/v1/reports/summary?month=${MES}&currency=COP`);
    const gastosAntes = await pedir(
      'GET',
      `/api/v1/reports/by-category?month=${MES}&currency=COP&kind=expense`,
    );

    // Un ajuste hacia arriba y otro hacia abajo: ninguno debe tocar los reportes.
    expect((await ajustar(cuenta.id, '2000000')).estado).toBe(201);
    expect((await ajustar(cuenta.id, '150000')).estado).toBe(201);

    const despues = await pedir('GET', `/api/v1/reports/summary?month=${MES}&currency=COP`);
    const gastosDespues = await pedir(
      'GET',
      `/api/v1/reports/by-category?month=${MES}&currency=COP&kind=expense`,
    );
    expect(antes.cuerpo.data).toMatchObject({ income: '400000.0000', expense: '60000.0000' });
    expect(despues.cuerpo.data).toEqual(antes.cuerpo.data);
    expect(gastosDespues.cuerpo.data).toEqual(gastosAntes.cuerpo.data);
    expect(await saldoDe(cuenta.id)).toBe('150000.0000');
  });

  it('no cuenta como ahorro del mes en una cuenta de ahorro', async () => {
    const ahorro = await crearCuenta({ openingBalance: '100000', isSavings: true });

    const antes = await pedir('GET', '/api/v1/reports/savings-trend?months=1&currency=COP');
    expect((await ajustar(ahorro.id, '900000')).estado).toBe(201);
    const despues = await pedir('GET', '/api/v1/reports/savings-trend?months=1&currency=COP');

    expect(despues.cuerpo.data).toEqual(antes.cuerpo.data);
    expect(despues.cuerpo.data.at(-1).amount).toBe('0.0000');
  });

  it('el ajuste aparece en el listado con su tipo y sale en el respaldo con su nombre', async () => {
    const cuenta = await crearCuenta({ openingBalance: '1000' });
    await ajustar(cuenta.id, '5000');

    const lista = await pedir('GET', `/api/v1/transactions?accountId=${cuenta.id}`);
    expect(lista.cuerpo.data.map((m: any) => m.kind).sort()).toEqual(['adjustment', 'opening']);

    const respaldo = await app.inject({ method: 'GET', url: '/api/v1/transactions/export' });
    expect(respaldo.body).toContain('Ajuste de saldo');
  });
});

// -----------------------------------------------------------------------------

describe('un ajuste no se corrige: se hace otro', () => {
  it('no se anula', async () => {
    const cuenta = await crearCuenta({ openingBalance: '1000' });
    const ajuste = (await ajustar(cuenta.id, '5000')).cuerpo.data;

    const { estado, cuerpo } = await pedir('POST', `/api/v1/transactions/${ajuste.id}/reversal`);

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toContain('otro ajuste');
    expect(await saldoDe(cuenta.id)).toBe('5000.0000');
  });

  it('no lleva categoría', async () => {
    const cuenta = await crearCuenta({ openingBalance: '1000' });
    const comida = await crearCategoria('Comida');
    const ajuste = (await ajustar(cuenta.id, '5000')).cuerpo.data;

    const { estado } = await pedir('PATCH', `/api/v1/transactions/${ajuste.id}/category`, {
      categoryId: comida.id,
    });

    expect(estado).toBe(422);
  });

  it('la base de datos tampoco deja un ajuste con categoría ni que anule algo', async () => {
    const cuenta = await crearCuenta({ openingBalance: '1000' });
    const comida = await crearCategoria('Comida');

    const error = await db
      .execute(sql`
        insert into transactions (user_id, account_id, category_id, kind, amount, currency, occurred_at)
        values (${usuarioId}::uuid, ${cuenta.id}::uuid, ${comida.id}::uuid, 'adjustment', 500, 'COP', now())
      `)
      .then(
        () => null,
        (causa: unknown) => causa,
      );

    expect(error).not.toBeNull();
    expect(traducirErrorDePostgres(error)).toMatchObject({
      estado: 422,
      mensaje: 'Un ajuste de saldo no lleva categoría y no anula nada.',
    });
  });

  it('se corrige con otro ajuste, y el saldo final es el último pedido', async () => {
    const tarjeta = await crearCuenta({ type: 'card', openingBalance: '-100000' });

    await ajustar(tarjeta.id, '-999999');
    await ajustar(tarjeta.id, '-350000');

    expect(await saldoDe(tarjeta.id)).toBe('-350000.0000');
    expect(await contarAjustes(tarjeta.id)).toBe(2);
  });
});
