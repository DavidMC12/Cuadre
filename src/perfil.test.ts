/**
 * Pruebas del perfil y las preferencias, de punta a punta con `app.inject()`.
 *
 * Cada prueba arranca con un usuario recién creado, así que ninguna hereda las
 * preferencias que dejó la anterior ni depende del orden en que corran.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from './aplicacion.js';
import { closeDb, db } from './db/client.js';
import { users } from './db/schema/index.js';

let app: FastifyInstance;
let usuarioId: string;

async function crearUsuario(nombre = 'Persona de prueba'): Promise<string> {
  const [usuario] = await db
    .insert(users)
    .values({ email: `perfil-${randomUUID()}@cuadre.test`, displayName: nombre })
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

async function pedir(metodo: 'GET' | 'PATCH', cuerpo?: unknown): Promise<Respuesta> {
  const respuesta = await app.inject({
    method: metodo,
    url: '/api/v1/profile',
    ...(cuerpo === undefined ? {} : { payload: cuerpo as object }),
  });
  return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
}

async function perfilActual(): Promise<any> {
  const { estado, cuerpo } = await pedir('GET');
  expect(estado, JSON.stringify(cuerpo)).toBe(200);
  return cuerpo.data;
}

// -----------------------------------------------------------------------------

describe('leer el perfil', () => {
  it('devuelve quién eres, sin que hayas configurado nada', async () => {
    const perfil = await perfilActual();

    expect(perfil.id).toBe(usuarioId);
    expect(perfil.email).toMatch(/@cuadre\.test$/);
    expect(perfil.displayName).toBe('Persona de prueba');
    expect(typeof perfil.createdAt).toBe('string');
  });

  it('sin moneda elegida la deja en nulo, no la inventa', async () => {
    const perfil = await perfilActual();
    expect(perfil.defaultCurrency).toBeNull();
  });

  it('la pantalla de inicio arranca en el resumen', async () => {
    const perfil = await perfilActual();
    expect(perfil.startPage).toBe('resumen');
  });
});

describe('cambiar el nombre', () => {
  it('lo guarda', async () => {
    const { estado, cuerpo } = await pedir('PATCH', { displayName: 'Omar' });

    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.displayName).toBe('Omar');
    expect((await perfilActual()).displayName).toBe('Omar');
  });

  it('le quita los espacios de los lados', async () => {
    const { cuerpo } = await pedir('PATCH', { displayName: '  Omar  ' });
    expect(cuerpo.data.displayName).toBe('Omar');
  });

  it('no acepta un nombre en blanco', async () => {
    const { estado } = await pedir('PATCH', { displayName: '' });
    expect(estado).toBe(400);
  });

  it('no acepta un nombre que son puros espacios', async () => {
    const { estado } = await pedir('PATCH', { displayName: '     ' });
    expect(estado).toBe(400);
  });

  it('no acepta un nombre kilométrico', async () => {
    const { estado } = await pedir('PATCH', { displayName: 'a'.repeat(101) });
    expect(estado).toBe(400);
  });
});

describe('la moneda por defecto', () => {
  it('se guarda', async () => {
    const { estado, cuerpo } = await pedir('PATCH', { defaultCurrency: 'COP' });

    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.defaultCurrency).toBe('COP');
    expect((await perfilActual()).defaultCurrency).toBe('COP');
  });

  it('se puede borrar mandando nulo, y vuelve a deducirse de las cuentas', async () => {
    await pedir('PATCH', { defaultCurrency: 'USD' });
    const { estado, cuerpo } = await pedir('PATCH', { defaultCurrency: null });

    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data.defaultCurrency).toBeNull();
  });

  it('rechaza una moneda mal escrita', async () => {
    for (const moneda of ['cop', 'PESOS', 'CO', '$']) {
      const { estado } = await pedir('PATCH', { defaultCurrency: moneda });
      expect(estado, `moneda: ${moneda}`).toBe(400);
    }
  });
});

describe('la pantalla de inicio', () => {
  it('se puede mover a cualquiera de las tres del menú', async () => {
    for (const pantalla of ['cuentas', 'movimientos', 'resumen']) {
      const { estado, cuerpo } = await pedir('PATCH', { startPage: pantalla });
      expect(estado, JSON.stringify(cuerpo)).toBe(200);
      expect(cuerpo.data.startPage).toBe(pantalla);
    }
  });

  it('rechaza una pantalla que no existe', async () => {
    const { estado } = await pedir('PATCH', { startPage: 'presupuestos' });
    expect(estado).toBe(400);
  });
});

describe('reglas de la petición', () => {
  it('cambia varias cosas de una sola vez', async () => {
    const { estado, cuerpo } = await pedir('PATCH', {
      displayName: 'Omar',
      defaultCurrency: 'COP',
      startPage: 'movimientos',
    });

    expect(estado, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.data).toMatchObject({
      displayName: 'Omar',
      defaultCurrency: 'COP',
      startPage: 'movimientos',
    });
  });

  it('un cambio no pisa los otros', async () => {
    await pedir('PATCH', { displayName: 'Omar', defaultCurrency: 'COP' });
    await pedir('PATCH', { startPage: 'cuentas' });

    expect(await perfilActual()).toMatchObject({
      displayName: 'Omar',
      defaultCurrency: 'COP',
      startPage: 'cuentas',
    });
  });

  it('no acepta una petición que no pide ningún cambio', async () => {
    const { estado } = await pedir('PATCH', {});
    expect(estado).toBe(400);
  });

  it('no deja cambiar el correo, que lo manda el proveedor de identidad', async () => {
    const { estado } = await pedir('PATCH', { email: 'otro@cuadre.test' });
    expect(estado).toBe(400);
  });

  it('tampoco deja cambiar el id ni la fecha de registro', async () => {
    expect((await pedir('PATCH', { id: randomUUID() })).estado).toBe(400);
    expect((await pedir('PATCH', { createdAt: '2020-01-01T00:00:00Z' })).estado).toBe(400);
  });
});

describe('cada quien ve solo su perfil', () => {
  it('el perfil que devuelve es el de quien pregunta, no el de otro', async () => {
    const otro = await crearUsuario('Otra persona');

    const perfil = await perfilActual();

    expect(perfil.id).toBe(usuarioId);
    expect(perfil.id).not.toBe(otro);
    expect(perfil.displayName).toBe('Persona de prueba');
  });

  it('cambiar mis preferencias no toca las de nadie más', async () => {
    const otro = await crearUsuario('Otra persona');

    await pedir('PATCH', { displayName: 'Omar', defaultCurrency: 'COP', startPage: 'cuentas' });

    const [fila] = await db
      .select({
        displayName: users.displayName,
        defaultCurrency: users.defaultCurrency,
        startPage: users.startPage,
      })
      .from(users)
      .where(eq(users.id, otro));

    expect(fila).toMatchObject({
      displayName: 'Otra persona',
      defaultCurrency: null,
      startPage: 'resumen',
    });
  });
});
