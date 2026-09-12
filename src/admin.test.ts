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
import { leerSuplantadaPor } from './http/neon-auth.js';
import { esRolAdmin } from './http/usuario-actual.js';

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

  it('en una sesión normal dice que nadie te está viendo', async () => {
    const { cuerpo } = await pedir(appNormal, 'GET', '/api/v1/profile');
    expect(cuerpo.data.isImpersonated).toBe(false);
  });
});

describe('leer un rol', () => {
  it('reconoce al administrador', () => {
    expect(esRolAdmin('admin')).toBe(true);
  });

  it('lo reconoce aunque venga con otros roles al lado', () => {
    // Better Auth admite varios roles y los guarda separados por comas.
    expect(esRolAdmin('admin,user')).toBe(true);
    expect(esRolAdmin('user,admin')).toBe(true);
  });

  it('no confunde a quien no lo es', () => {
    expect(esRolAdmin('user')).toBe(false);
    expect(esRolAdmin('administrador')).toBe(false);
    expect(esRolAdmin('superadmin')).toBe(false);
    expect(esRolAdmin('')).toBe(false);
    expect(esRolAdmin(null)).toBe(false);
  });

  it('compara igual que Neon Auth, sin recortar ni ignorar mayúsculas', () => {
    // Si aquí se aceptara y allá no, Cuadre abriría el panel a alguien que el
    // proveedor de identidad rechaza a media operación.
    expect(esRolAdmin('ADMIN')).toBe(false);
    expect(esRolAdmin('user, admin')).toBe(false);
    expect(esRolAdmin(' admin')).toBe(false);
  });
});

describe('leer quién inició la sesión', () => {
  it('devuelve al administrador cuando la sesión es suplantada', () => {
    expect(leerSuplantadaPor({ impersonatedBy: 'admin-123' })).toBe('admin-123');
  });

  it('en una sesión normal no devuelve a nadie', () => {
    expect(leerSuplantadaPor({})).toBeNull();
    expect(leerSuplantadaPor({ impersonatedBy: null })).toBeNull();
    expect(leerSuplantadaPor(undefined)).toBeNull();
    expect(leerSuplantadaPor(null)).toBeNull();
  });

  it('un texto vacío no identifica a nadie, así que no cuenta', () => {
    expect(leerSuplantadaPor({ impersonatedBy: '' })).toBeNull();
    expect(leerSuplantadaPor({ impersonatedBy: '   ' })).toBeNull();
  });

  it('si el campo cambiara de forma, se entera alguien', () => {
    // Esta prueba existe para que renombrar el campo haga ruido: de él cuelgan
    // el aviso de suplantación y el cierre del panel, las dos a la vez.
    expect(leerSuplantadaPor({ impersonated_by: 'admin-123' })).toBeNull();
    expect(leerSuplantadaPor({ impersonatedBy: 42 })).toBeNull();
  });
});

describe('suplantar no devuelve al panel', () => {
  /**
   * La regla que sostiene todo lo demás: mientras un administrador ve la app
   * como otra persona, su sesión es la de ella. Si desde ahí pudiera volver al
   * panel, podría saltar a una tercera cuenta sin que quedara registro.
   */
  it('una sesión suplantada no administra, por más que el rol diga admin', async () => {
    const suplantadoId = await crearUsuario('suplantado');
    const appSuplantando = await construirApp({
      silencioso: true,
      resolverUsuario: async () => suplantadoId,
      esAdmin: true,
      suplantada: true,
    });
    await appSuplantando.ready();

    const perfil = await pedir(appSuplantando, 'GET', '/api/v1/profile');
    expect(perfil.cuerpo.data.isAdmin).toBe(false);
    expect(perfil.cuerpo.data.isImpersonated).toBe(true);

    const lectura = await pedir(appSuplantando, 'GET', '/api/v1/admin/impersonations');
    expect(lectura.estado).toBe(403);

    const escritura = await pedir(appSuplantando, 'POST', '/api/v1/admin/impersonations', ALGUIEN);
    expect(escritura.estado).toBe(403);

    await appSuplantando.close();
  });
});
