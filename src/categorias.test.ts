/**
 * Pruebas del catálogo de categorías, de punta a punta con `app.inject()`.
 *
 * Cada prueba trabaja con un usuario recién creado: así una no le deja
 * categorías a la siguiente y ninguna depende del orden en que corran.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from './app.js';
import { closeDb, db } from './db/client.js';
import { users } from './db/schema/index.js';
import { sembrarCategoriasPorDefecto } from './modules/categories/service.js';

let app: FastifyInstance;
let usuarioId: string;

async function crearUsuario(): Promise<string> {
  const [usuario] = await db
    .insert(users)
    .values({ email: `categorias-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
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

async function crearCategoria(nombre: string, tipo = 'expense'): Promise<any> {
  const { estado, cuerpo } = await pedir('POST', '/api/v1/categories', {
    name: nombre,
    kind: tipo,
  });
  expect(estado, JSON.stringify(cuerpo)).toBe(201);
  return cuerpo.data;
}

async function nombresDeLaLista(consulta = ''): Promise<string[]> {
  const { cuerpo } = await pedir('GET', `/api/v1/categories${consulta}`);
  return cuerpo.data.map((categoria: any) => categoria.name);
}

// -----------------------------------------------------------------------------

describe('crear categorías', () => {
  it('un usuario nuevo arranca sin catálogo hasta que se le siembra', async () => {
    const { estado, cuerpo } = await pedir('GET', '/api/v1/categories');
    expect(estado).toBe(200);
    expect(cuerpo.data).toEqual([]);
  });

  it('crea una categoría de gasto', async () => {
    const categoria = await crearCategoria('Mercado');
    expect(categoria.name).toBe('Mercado');
    expect(categoria.kind).toBe('expense');
    expect(categoria.archivedAt).toBeNull();
  });

  it('las devuelve ordenadas por nombre', async () => {
    await crearCategoria('Transporte');
    await crearCategoria('Mercado');
    await crearCategoria('Ocio');

    expect(await nombresDeLaLista()).toEqual(['Mercado', 'Ocio', 'Transporte']);
  });

  it('recorta los espacios sobrantes del nombre', async () => {
    const categoria = await crearCategoria('   Mercado   ');
    expect(categoria.name).toBe('Mercado');
  });

  it('no deja dos categorías activas con el mismo nombre y el mismo tipo', async () => {
    await crearCategoria('Mercado');

    const { estado, cuerpo } = await pedir('POST', '/api/v1/categories', {
      name: 'Mercado',
      kind: 'expense',
    });
    expect(estado).toBe(409);
    expect(cuerpo.error.message).toMatch(/ya tienes una categoría con ese nombre/i);
  });

  it('el mismo nombre en el otro tipo sí se puede: "Otros" es de gasto y de ingreso', async () => {
    await crearCategoria('Otros', 'expense');
    const ingreso = await crearCategoria('Otros', 'income');

    expect(ingreso.kind).toBe('income');
    expect(await nombresDeLaLista()).toEqual(['Otros', 'Otros']);
  });

  it('una categoría archivada deja el nombre libre otra vez', async () => {
    const vieja = await crearCategoria('Mercado');
    await pedir('POST', `/api/v1/categories/${vieja.id}/archive`);

    const nueva = await crearCategoria('Mercado');
    expect(nueva.id).not.toBe(vieja.id);
  });

  it('rechaza un nombre en blanco', async () => {
    const { estado, cuerpo } = await pedir('POST', '/api/v1/categories', {
      name: '   ',
      kind: 'expense',
    });
    expect(estado).toBe(400);
    expect(cuerpo.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza un tipo inventado y lista los que sí valen', async () => {
    const { estado, cuerpo } = await pedir('POST', '/api/v1/categories', {
      name: 'Cripto',
      kind: 'ahorro',
    });
    expect(estado).toBe(400);
    expect(cuerpo.error.details[0].problema).toMatch(/income, expense/);
  });
});

describe('renombrar categorías', () => {
  it('cambia el nombre y conserva el identificador', async () => {
    const categoria = await crearCategoria('Mercado');

    const { estado, cuerpo } = await pedir('PATCH', `/api/v1/categories/${categoria.id}`, {
      name: 'Mercado y aseo',
    });

    expect(estado).toBe(200);
    expect(cuerpo.data.id).toBe(categoria.id);
    expect(cuerpo.data.name).toBe('Mercado y aseo');
  });

  it('no deja cambiar el tipo, y explica qué hacer en su lugar', async () => {
    const categoria = await crearCategoria('Mercado', 'expense');

    const { estado, cuerpo } = await pedir('PATCH', `/api/v1/categories/${categoria.id}`, {
      name: 'Mercado',
      kind: 'income',
    });

    expect(estado).toBe(422);
    expect(cuerpo.error.message).toMatch(/crea una categoría nueva/i);

    const { cuerpo: sinCambios } = await pedir('GET', `/api/v1/categories/${categoria.id}`);
    expect(sinCambios.data.kind).toBe('expense');
  });

  it('mandar el mismo tipo que ya tiene no molesta a nadie', async () => {
    const categoria = await crearCategoria('Mercado', 'expense');

    const { estado, cuerpo } = await pedir('PATCH', `/api/v1/categories/${categoria.id}`, {
      name: 'Mercado y aseo',
      kind: 'expense',
    });

    expect(estado).toBe(200);
    expect(cuerpo.data.name).toBe('Mercado y aseo');
  });

  it('no deja renombrar a un nombre que ya está ocupado', async () => {
    await crearCategoria('Mercado');
    const otra = await crearCategoria('Transporte');

    const { estado, cuerpo } = await pedir('PATCH', `/api/v1/categories/${otra.id}`, {
      name: 'Mercado',
    });

    expect(estado).toBe(409);
    expect(cuerpo.error.message).toMatch(/ya tienes una categoría con ese nombre/i);
  });

  it('una categoría que no existe da 404', async () => {
    const { estado } = await pedir('PATCH', `/api/v1/categories/${randomUUID()}`, {
      name: 'Lo que sea',
    });
    expect(estado).toBe(404);
  });
});

describe('archivar categorías', () => {
  it('archivar la esconde de la lista pero se puede seguir viendo', async () => {
    const categoria = await crearCategoria('Mercado');
    const { estado, cuerpo } = await pedir('POST', `/api/v1/categories/${categoria.id}/archive`);

    expect(estado).toBe(200);
    expect(cuerpo.data.archivedAt).not.toBeNull();
    expect(await nombresDeLaLista()).toEqual([]);
    expect(await nombresDeLaLista('?includeArchived=true')).toEqual(['Mercado']);
  });

  it('no deja archivar dos veces', async () => {
    const categoria = await crearCategoria('Mercado');
    await pedir('POST', `/api/v1/categories/${categoria.id}/archive`);

    const { estado, cuerpo } = await pedir('POST', `/api/v1/categories/${categoria.id}/archive`);
    expect(estado).toBe(409);
    expect(cuerpo.error.message).toMatch(/ya está archivada/i);
  });

  it('desarchivar la devuelve a la lista', async () => {
    const categoria = await crearCategoria('Mercado');
    await pedir('POST', `/api/v1/categories/${categoria.id}/archive`);
    await pedir('POST', `/api/v1/categories/${categoria.id}/unarchive`);

    expect(await nombresDeLaLista()).toEqual(['Mercado']);
  });

  it('los movimientos viejos siguen apuntando a la categoría archivada', async () => {
    const categoria = await crearCategoria('Mercado');

    const { cuerpo: cuenta } = await pedir('POST', '/api/v1/accounts', {
      name: 'Bancolombia',
      type: 'bank',
      currency: 'COP',
    });

    const { cuerpo: gasto } = await pedir('POST', '/api/v1/transactions', {
      accountId: cuenta.data.id,
      amount: '-50000',
      occurredAt: '2026-09-05T17:00:00Z',
      categoryId: categoria.id,
    });

    await pedir('POST', `/api/v1/categories/${categoria.id}/archive`);

    const { cuerpo: revisado } = await pedir('GET', `/api/v1/transactions/${gasto.data.id}`);
    expect(revisado.data.categoryId).toBe(categoria.id);
  });

  it('archivar una categoría que no existe da 404', async () => {
    const { estado } = await pedir('POST', `/api/v1/categories/${randomUUID()}/archive`);
    expect(estado).toBe(404);
  });
});

describe('catálogo inicial', () => {
  it('siembra las categorías de siempre', async () => {
    await sembrarCategoriasPorDefecto(db, usuarioId);

    const { cuerpo } = await pedir('GET', '/api/v1/categories');
    const nombres = cuerpo.data.map((categoria: any) => categoria.name);

    expect(nombres).toContain('Mercado');
    expect(nombres).toContain('Sueldo');
    expect(cuerpo.data).toHaveLength(14);
  });

  it('sembrar dos veces no duplica nada', async () => {
    const primera = await sembrarCategoriasPorDefecto(db, usuarioId);
    const segunda = await sembrarCategoriasPorDefecto(db, usuarioId);

    expect(primera).toBe(14);
    expect(segunda).toBe(0);

    const { cuerpo } = await pedir('GET', '/api/v1/categories');
    expect(cuerpo.data).toHaveLength(14);
  });

  it('no pisa lo que la persona ya tenía', async () => {
    const mia = await crearCategoria('Mercado');
    await sembrarCategoriasPorDefecto(db, usuarioId);

    const { cuerpo } = await pedir('GET', '/api/v1/categories');
    const mercados = cuerpo.data.filter((categoria: any) => categoria.name === 'Mercado');

    expect(mercados).toHaveLength(1);
    expect(mercados[0].id).toBe(mia.id);
  });
});

describe('cada quien ve su catálogo', () => {
  it('las categorías de otra persona no aparecen', async () => {
    const ajena = await crearCategoria('Solo mía');

    usuarioId = await crearUsuario();

    expect(await nombresDeLaLista('?includeArchived=true')).toEqual([]);

    const { estado } = await pedir('GET', `/api/v1/categories/${ajena.id}`);
    expect(estado).toBe(404);
  });
});
