/**
 * Pruebas HTTP de "cada movimiento cuenta para un solo ítem": registrar un
 * movimiento con ítem, pagar una tarjeta con ítem y corregir el ítem después.
 *
 * El núcleo de dinero (la base y las consultas) lo cubre
 * `items-independientes.test.ts`; aquí se prueba la capa de servicio y rutas:
 * la validación antes de escribir, los mensajes llanos y las reglas de cada
 * tipo de movimiento.
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
    .values({ email: `items-svc-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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
const DIA_5 = `${MES}-05T17:00:00Z`;

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

async function crearCategoria(nombre: string, kind: 'expense' | 'income' = 'expense'): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/categories', {
    name: `${nombre} ${(contador += 1)}`,
    kind,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function crearItem(
  categoriaId: string,
  extras: Record<string, unknown> = {},
): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/budgets/items', {
    kind: 'category',
    categoryId: categoriaId,
    currency: 'COP',
    amount: '100000',
    ...extras,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function crearItemDeAhorro(cuentaId: string): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/budgets/items', {
    kind: 'savings',
    accountId: cuentaId,
    amount: '100000',
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function registrar(cuentaId: string, monto: string, extras = {}): Promise<Respuesta> {
  return pedir('POST', '/api/v1/transactions', {
    accountId: cuentaId,
    amount: monto,
    occurredAt: DIA_5,
    ...extras,
  });
}

/** Un ítem de otra persona, para probar que no se puede usar. */
async function itemAjeno(): Promise<string> {
  const mio = usuarioId;
  usuarioId = await crearUsuario();
  const categoria = await crearCategoria('Ajena');
  const item = await crearItem(categoria.id);
  usuarioId = mio;
  return item.id;
}

// -----------------------------------------------------------------------------

describe('registrar un movimiento con ítem', () => {
  it('lo asigna y lo devuelve', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const item = await crearItem(comida.id);

    const { estado, cuerpo } = await registrar(cuenta.id, '-30000', {
      categoryId: comida.id,
      budgetItemId: item.id,
    });

    expect(estado, JSON.stringify(cuerpo)).toBe(201);
    expect(cuerpo.data.budgetItemId).toBe(item.id);
  });

  it('sin categoría el ítem no tiene dónde colgar: 422 llano', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const item = await crearItem(comida.id);

    const { estado, cuerpo } = await registrar(cuenta.id, '-30000', {
      budgetItemId: item.id,
    });

    expect(estado).toBe(422);
    expect(cuerpo.error.code).toBe('RULE_VIOLATION');
    expect(cuerpo.error.message).toBe('Para asignar un ítem, el movimiento necesita categoría.');
  });

  it('un ítem que no existe es 404', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');

    const { estado, cuerpo } = await registrar(cuenta.id, '-30000', {
      categoryId: comida.id,
      budgetItemId: randomUUID(),
    });

    expect(estado).toBe(404);
    expect(cuerpo.error.message).toBe('Ese ítem del presupuesto no existe.');
  });

  it('un ítem de otra persona también es 404', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');

    const { estado } = await registrar(cuenta.id, '-30000', {
      categoryId: comida.id,
      budgetItemId: await itemAjeno(),
    });

    expect(estado).toBe(404);
  });

  it('un ítem archivado es 422', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const item = await crearItem(comida.id);
    await pedir('POST', `/api/v1/budgets/items/${item.id}/archive`);

    const { estado, cuerpo } = await registrar(cuenta.id, '-30000', {
      categoryId: comida.id,
      budgetItemId: item.id,
    });

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/archivado/i);
  });

  it('un ítem de ahorro no se asigna a un movimiento', async () => {
    const ahorro = await crearCuenta({ isSavings: true });
    const itemAhorro = await crearItemDeAhorro(ahorro.id);
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');

    const { estado, cuerpo } = await registrar(cuenta.id, '-30000', {
      categoryId: comida.id,
      budgetItemId: itemAhorro.id,
    });

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/ahorro/i);
  });

  it('un ítem de otra categoría es 422', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const ocio = await crearCategoria('Ocio');
    const itemOcio = await crearItem(ocio.id);

    const { estado, cuerpo } = await registrar(cuenta.id, '-30000', {
      categoryId: comida.id,
      budgetItemId: itemOcio.id,
    });

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/categoría/i);
  });

  it('un ítem de otra moneda es 422', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const itemUsd = await crearItem(comida.id, { currency: 'USD' });

    const { estado, cuerpo } = await registrar(cuenta.id, '-30000', {
      categoryId: comida.id,
      budgetItemId: itemUsd.id,
    });

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/moneda/i);
  });
});

describe('pagar una tarjeta con ítem', () => {
  async function escenario() {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const tarjeta = await crearCuenta({ type: 'card', openingBalance: '-300000' });
    const deudas = await crearCategoria('Deudas');
    return { banco, tarjeta, deudas };
  }

  it('la transferencia a la tarjeta paga el ítem de la deuda', async () => {
    const { banco, tarjeta, deudas } = await escenario();
    const item = await crearItem(deudas.id);

    const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: tarjeta.id,
      amount: '100000',
      occurredAt: DIA_5,
      budgetItemId: item.id,
    });

    expect(estado, JSON.stringify(cuerpo)).toBe(201);
    const salida = cuerpo.data.legs.find((pata: any) => pata.amount.startsWith('-'));
    const entrada = cuerpo.data.legs.find((pata: any) => !pata.amount.startsWith('-'));
    expect(salida.budgetItemId).toBe(item.id);
    expect(entrada.budgetItemId).toBeNull();
  });

  it('si el destino no es una tarjeta, no se admite ítem', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const efectivo = await crearCuenta({ type: 'cash' });
    const deudas = await crearCategoria('Deudas');
    const item = await crearItem(deudas.id);

    const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: efectivo.id,
      amount: '100000',
      occurredAt: DIA_5,
      budgetItemId: item.id,
    });

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/tarjeta/i);
  });

  it('solo paga un ítem de categoría de gasto: uno de ingreso no vale', async () => {
    const { banco, tarjeta } = await escenario();
    const sueldo = await crearCategoria('Sueldo', 'income');
    const item = await crearItem(sueldo.id);

    const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: tarjeta.id,
      amount: '100000',
      occurredAt: DIA_5,
      budgetItemId: item.id,
    });

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/gasto/i);
  });

  it('un ítem archivado es 422', async () => {
    const { banco, tarjeta, deudas } = await escenario();
    const item = await crearItem(deudas.id);
    await pedir('POST', `/api/v1/budgets/items/${item.id}/archive`);

    const { estado } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: tarjeta.id,
      amount: '100000',
      occurredAt: DIA_5,
      budgetItemId: item.id,
    });

    expect(estado).toBe(422);
  });

  it('un ítem de otra moneda es 422', async () => {
    const { banco, tarjeta, deudas } = await escenario();
    const itemUsd = await crearItem(deudas.id, { currency: 'USD' });

    const { estado, cuerpo } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: tarjeta.id,
      amount: '100000',
      occurredAt: DIA_5,
      budgetItemId: itemUsd.id,
    });

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/moneda/i);
  });
});

describe('corregir el ítem de un movimiento', () => {
  it('asigna un ítem y lo puede dejar sin asignar', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const item = await crearItem(comida.id);
    const { cuerpo: gasto } = await registrar(cuenta.id, '-30000', { categoryId: comida.id });

    const { estado, cuerpo } = await pedir(
      'PATCH',
      `/api/v1/transactions/${gasto.data.id}/budget-item`,
      { budgetItemId: item.id },
    );
    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.budgetItemId).toBe(item.id);

    const { cuerpo: sinItem } = await pedir(
      'PATCH',
      `/api/v1/transactions/${gasto.data.id}/budget-item`,
      { budgetItemId: null },
    );
    expect(sinItem.data.budgetItemId).toBeNull();
  });

  it('404 si el movimiento no existe', async () => {
    const comida = await crearCategoria('Comida');
    const item = await crearItem(comida.id);

    const { estado } = await pedir(
      'PATCH',
      `/api/v1/transactions/${randomUUID()}/budget-item`,
      { budgetItemId: item.id },
    );
    expect(estado).toBe(404);
  });

  it('un saldo inicial no lleva ítem', async () => {
    const cuenta = await crearCuenta({ openingBalance: '100000' });
    const comida = await crearCategoria('Comida');
    const item = await crearItem(comida.id);
    const { cuerpo: lista } = await pedir('GET', `/api/v1/transactions?accountId=${cuenta.id}`);
    const apertura = lista.data.find((m: any) => m.kind === 'opening');

    const { estado, cuerpo } = await pedir(
      'PATCH',
      `/api/v1/transactions/${apertura.id}/budget-item`,
      { budgetItemId: item.id },
    );
    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/saldo inicial/i);
  });

  it('un ajuste de saldo tampoco', async () => {
    const cuenta = await crearCuenta({ openingBalance: '100000' });
    await pedir('POST', `/api/v1/accounts/${cuenta.id}/adjust-balance`, { balance: '150000' });
    const comida = await crearCategoria('Comida');
    const item = await crearItem(comida.id);
    const { cuerpo: lista } = await pedir('GET', `/api/v1/transactions?accountId=${cuenta.id}`);
    const ajuste = lista.data.find((m: any) => m.kind === 'adjustment');

    const { estado, cuerpo } = await pedir(
      'PATCH',
      `/api/v1/transactions/${ajuste.id}/budget-item`,
      { budgetItemId: item.id },
    );
    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/ajuste/i);
  });

  it('una anulación no se toca sola', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const item = await crearItem(comida.id);
    const { cuerpo: gasto } = await registrar(cuenta.id, '-30000', { categoryId: comida.id });
    const { cuerpo: anulado } = await pedir(
      'POST',
      `/api/v1/transactions/${gasto.data.id}/reversal`,
    );

    const { estado, cuerpo } = await pedir(
      'PATCH',
      `/api/v1/transactions/${anulado.data.id}/budget-item`,
      { budgetItemId: item.id },
    );
    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/anulaci/i);
  });

  it('un gasto sin categoría no puede recibir ítem', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const item = await crearItem(comida.id);
    const { cuerpo: gasto } = await registrar(cuenta.id, '-30000');

    const { estado, cuerpo } = await pedir(
      'PATCH',
      `/api/v1/transactions/${gasto.data.id}/budget-item`,
      { budgetItemId: item.id },
    );
    expect(estado).toBe(422);
    expect(cuerpo.error.message).toBe('Para asignar un ítem, el movimiento necesita categoría.');
  });

  it('un ítem de otra categoría es 422', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const ocio = await crearCategoria('Ocio');
    const itemOcio = await crearItem(ocio.id);
    const { cuerpo: gasto } = await registrar(cuenta.id, '-30000', { categoryId: comida.id });

    const { estado } = await pedir(
      'PATCH',
      `/api/v1/transactions/${gasto.data.id}/budget-item`,
      { budgetItemId: itemOcio.id },
    );
    expect(estado).toBe(422);
  });

  it('arrastra la anulación: el original y su anulación cambian juntos', async () => {
    const cuenta = await crearCuenta();
    const comida = await crearCategoria('Comida');
    const primero = await crearItem(comida.id);
    const segundo = await crearItem(comida.id);
    const { cuerpo: gasto } = await registrar(cuenta.id, '-30000', {
      categoryId: comida.id,
      budgetItemId: primero.id,
    });
    const { cuerpo: anulado } = await pedir(
      'POST',
      `/api/v1/transactions/${gasto.data.id}/reversal`,
    );
    expect(anulado.data.budgetItemId).toBe(primero.id);

    const { estado } = await pedir(
      'PATCH',
      `/api/v1/transactions/${gasto.data.id}/budget-item`,
      { budgetItemId: segundo.id },
    );
    expect(estado).toBe(200);

    const { cuerpo: original } = await pedir('GET', `/api/v1/transactions/${gasto.data.id}`);
    const { cuerpo: revisada } = await pedir('GET', `/api/v1/transactions/${anulado.data.id}`);
    expect(original.data.budgetItemId).toBe(segundo.id);
    expect(revisada.data.budgetItemId).toBe(segundo.id);
  });

  it('en una transferencia el ítem vive en la pata de salida, se pida por la que se pida', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const tarjeta = await crearCuenta({ type: 'card', openingBalance: '-300000' });
    const deudas = await crearCategoria('Deudas');
    const item = await crearItem(deudas.id);
    const { cuerpo: transferencia } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: tarjeta.id,
      amount: '100000',
      occurredAt: DIA_5,
    });
    const salida = transferencia.data.legs.find((pata: any) => pata.amount.startsWith('-'));
    const entrada = transferencia.data.legs.find((pata: any) => !pata.amount.startsWith('-'));

    // Se pide por la pata de ENTRADA; el ítem tiene que quedar en la salida.
    const { estado } = await pedir(
      'PATCH',
      `/api/v1/transactions/${entrada.id}/budget-item`,
      { budgetItemId: item.id },
    );
    expect(estado).toBe(200);

    const { cuerpo: salidaRevisada } = await pedir('GET', `/api/v1/transactions/${salida.id}`);
    const { cuerpo: entradaRevisada } = await pedir('GET', `/api/v1/transactions/${entrada.id}`);
    expect(salidaRevisada.data.budgetItemId).toBe(item.id);
    expect(entradaRevisada.data.budgetItemId).toBeNull();
  });

  it('una transferencia a una cuenta que no es tarjeta no recibe ítem', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const efectivo = await crearCuenta({ type: 'cash' });
    const deudas = await crearCategoria('Deudas');
    const item = await crearItem(deudas.id);
    const { cuerpo: transferencia } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: efectivo.id,
      amount: '100000',
      occurredAt: DIA_5,
    });
    const salida = transferencia.data.legs.find((pata: any) => pata.amount.startsWith('-'));

    const { estado } = await pedir(
      'PATCH',
      `/api/v1/transactions/${salida.id}/budget-item`,
      { budgetItemId: item.id },
    );
    expect(estado).toBe(422);
  });

  it('una transferencia ya anulada no admite cambios de ítem (409)', async () => {
    const banco = await crearCuenta({ openingBalance: '1000000' });
    const tarjeta = await crearCuenta({ type: 'card', openingBalance: '-300000' });
    const deudas = await crearCategoria('Deudas');
    const item = await crearItem(deudas.id);
    const { cuerpo: transferencia } = await pedir('POST', '/api/v1/transfers', {
      fromAccountId: banco.id,
      toAccountId: tarjeta.id,
      amount: '100000',
      occurredAt: DIA_5,
    });
    await pedir('POST', `/api/v1/transfers/${transferencia.data.transferGroupId}/reversal`);
    const salida = transferencia.data.legs.find((pata: any) => pata.amount.startsWith('-'));

    const { estado, cuerpo } = await pedir(
      'PATCH',
      `/api/v1/transactions/${salida.id}/budget-item`,
      { budgetItemId: item.id },
    );
    expect(estado).toBe(409);
    expect(cuerpo.error.code).toBe('CONFLICT');
  });
});
