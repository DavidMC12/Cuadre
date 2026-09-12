/**
 * Pruebas de la administración.
 *
 * Lo que se comprueba aquí no es que el panel funcione, sino que la puerta
 * esté cerrada: quien no administra el sistema no puede ni mirar el registro
 * de suplantaciones ni escribir en él.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { construirApp } from './aplicacion.js';
import { closeDb, db } from './db/client.js';
import { users } from './db/schema/index.js';

let appAdmin: FastifyInstance;
let appNormal: FastifyInstance;

/** Ambas apps miran esta variable, así cada prueba estrena administrador. */
let adminId: string;
/** Una persona cualquiera, sin permisos. */
let normalId: string;

async function crearUsuario(prefijo: string): Promise<string> {
  const [usuario] = await db
    .insert(users)
    .values({ email: `${prefijo}-${randomUUID()}@cuadre.test`, displayName: 'Pruebas' })
    .returning({ id: users.id });

  return usuario!.id;
}

beforeAll(async () => {
  adminId = await crearUsuario('admin');
  normalId = await crearUsuario('normal');

  appAdmin = await construirApp({
    silencioso: true,
    resolverUsuario: async () => adminId,
    esAdmin: true,
  });
  appNormal = await construirApp({
    silencioso: true,
    resolverUsuario: async () => normalId,
    esAdmin: false,
  });

  await appAdmin.ready();
  await appNormal.ready();
});

beforeEach(async () => {
  adminId = await crearUsuario('admin');
  normalId = await crearUsuario('normal');
});

afterAll(async () => {
  await appAdmin.close();
  await appNormal.close();
  await closeDb();
});

// -----------------------------------------------------------------------------
// Atajos

interface Respuesta<T = any> {
  estado: number;
  cuerpo: T;
}

async function pedir(
  app: FastifyInstance,
  metodo: 'GET' | 'POST',
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

const ALGUIEN = { targetAuthSubject: 'auth-sub-123', targetEmail: 'alguien@ejemplo.com' };

// -----------------------------------------------------------------------------

describe('la puerta está cerrada para quien no administra', () => {
  it('no deja dejar constancia de una suplantación', async () => {
    const { estado, cuerpo } = await pedir(
      appNormal,
      'POST',
      '/api/v1/admin/impersonations',
      ALGUIEN,
    );

    expect(estado).toBe(403);
    expect(cuerpo.error.code).toBe('FORBIDDEN');
  });

  it('no deja ni asomarse al registro', async () => {
    const { estado, cuerpo } = await pedir(appNormal, 'GET', '/api/v1/admin/impersonations');

    expect(estado).toBe(403);
    expect(cuerpo.error.code).toBe('FORBIDDEN');
  });

  it('el mensaje no cuenta qué haría falta para entrar', async () => {
    const { cuerpo } = await pedir(appNormal, 'GET', '/api/v1/admin/impersonations');

    expect(cuerpo.error.message).toBe('No tienes permiso para esto.');
    expect(cuerpo.error.message).not.toMatch(/admin|rol|permiso de/i);
  });
});

describe('dejar constancia', () => {
  it('guarda a quién se entró y cuándo', async () => {
    const { estado, cuerpo } = await pedir(
      appAdmin,
      'POST',
      '/api/v1/admin/impersonations',
      ALGUIEN,
    );

    expect(estado, JSON.stringify(cuerpo)).toBe(201);
    expect(cuerpo.data.targetAuthSubject).toBe('auth-sub-123');
    expect(cuerpo.data.targetEmail).toBe('alguien@ejemplo.com');
    expect(typeof cuerpo.data.startedAt).toBe('string');
  });

  it('guarda el correo en minúsculas, como el resto de la app', async () => {
    const { cuerpo } = await pedir(appAdmin, 'POST', '/api/v1/admin/impersonations', {
      ...ALGUIEN,
      targetEmail: 'ALGUIEN@Ejemplo.COM',
    });

    expect(cuerpo.data.targetEmail).toBe('alguien@ejemplo.com');
  });

  it('rechaza un correo que no es correo', async () => {
    const { estado } = await pedir(appAdmin, 'POST', '/api/v1/admin/impersonations', {
      ...ALGUIEN,
      targetEmail: 'no-es-un-correo',
    });

    expect(estado).toBe(400);
  });

  it('rechaza un identificador en blanco', async () => {
    const { estado } = await pedir(appAdmin, 'POST', '/api/v1/admin/impersonations', {
      ...ALGUIEN,
      targetAuthSubject: '   ',
    });

    expect(estado).toBe(400);
  });

  it('no deja colar campos inventados', async () => {
    const { estado } = await pedir(appAdmin, 'POST', '/api/v1/admin/impersonations', {
      ...ALGUIEN,
      adminUserId: randomUUID(),
    });

    expect(estado).toBe(400);
  });
});

describe('el registro', () => {
  it('sale del más reciente al más viejo', async () => {
    for (const correo of ['primero@ejemplo.com', 'segundo@ejemplo.com', 'tercero@ejemplo.com']) {
      await pedir(appAdmin, 'POST', '/api/v1/admin/impersonations', {
        ...ALGUIEN,
        targetEmail: correo,
      });
    }

    const { cuerpo } = await pedir(appAdmin, 'GET', '/api/v1/admin/impersonations');
    const correos = cuerpo.data.map((fila: any) => fila.targetEmail);

    expect(correos.slice(0, 3)).toEqual([
      'tercero@ejemplo.com',
      'segundo@ejemplo.com',
      'primero@ejemplo.com',
    ]);
  });

  it('un administrador no ve lo que hizo otro', async () => {
    await pedir(appAdmin, 'POST', '/api/v1/admin/impersonations', ALGUIEN);

    // Otro administrador, con su propia sesión.
    const otroId = await crearUsuario('admin-otro');
    const appOtro = await construirApp({
      silencioso: true,
      resolverUsuario: async () => otroId,
      esAdmin: true,
    });
    await appOtro.ready();

    const { cuerpo } = await pedir(appOtro, 'GET', '/api/v1/admin/impersonations');
    expect(cuerpo.data).toEqual([]);

    await appOtro.close();
  });

  it('empieza vacío', async () => {
    const { estado, cuerpo } = await pedir(appAdmin, 'GET', '/api/v1/admin/impersonations');

    expect(estado).toBe(200);
    expect(cuerpo.data).toEqual([]);
  });
});

describe('el perfil dice si administras', () => {
  it('a quien administra le dice que sí', async () => {
    const { cuerpo } = await pedir(appAdmin, 'GET', '/api/v1/profile');
    expect(cuerpo.data.isAdmin).toBe(true);
  });

  it('a todo el mundo más le dice que no', async () => {
    const { cuerpo } = await pedir(appNormal, 'GET', '/api/v1/profile');
    expect(cuerpo.data.isAdmin).toBe(false);
  });
});
