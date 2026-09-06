/**
 * Quién está haciendo la petición.
 *
 * TEMPORAL — Fase 1a. Todavía no hay inicio de sesión (llega en la Fase 1c con
 * Neon Auth), así que por ahora todas las peticiones son del mismo usuario de
 * desarrollo, que se crea solo la primera vez.
 *
 * Esto existe como un punto de conexión, no como un atajo: cuando llegue la
 * autenticación de verdad, lo único que cambia es cómo se resuelve
 * `peticion.usuarioId`. Ni los servicios ni los repositorios se enteran, porque
 * ya reciben el usuario como parámetro explícito.
 *
 * Se niega a funcionar en producción, a propósito.
 */
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import { env } from '../env.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Dueño de los datos de esta petición. Nunca es implícito más abajo. */
    usuarioId: string;
  }
}

const CORREO_DE_DESARROLLO = 'dev@cuadre.local';

let idEnCache: string | null = null;

async function resolverUsuarioDeDesarrollo(): Promise<string> {
  if (idEnCache) return idEnCache;

  // onConflictDoNothing evita que dos peticiones simultáneas la primera vez se
  // pisen: la segunda no falla, simplemente no inserta.
  await db
    .insert(users)
    .values({ email: CORREO_DE_DESARROLLO, displayName: 'Usuario de desarrollo' })
    .onConflictDoNothing();

  const [usuario] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, CORREO_DE_DESARROLLO))
    .limit(1);

  if (!usuario) throw new Error('No se pudo crear el usuario de desarrollo.');

  idEnCache = usuario.id;
  return idEnCache;
}

/** Solo para pruebas: olvida el usuario recordado. */
export function limpiarCacheDeUsuario(): void {
  idEnCache = null;
}

export interface OpcionesDeUsuario {
  /**
   * De dónde sale el usuario de la petición. Las pruebas pasan el suyo para
   * que cada tanda trabaje con datos propios y no se pisen entre sí.
   * En Fase 1c aquí entra Neon Auth y este parámetro deja de tener sentido.
   */
  resolver?: () => Promise<string>;
}

async function plugin(app: FastifyInstance, opciones: OpcionesDeUsuario): Promise<void> {
  const resolver = opciones.resolver ?? resolverUsuarioDeDesarrollo;

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'El usuario de desarrollo no puede usarse en producción. Falta implementar la autenticación (Fase 1c).',
    );
  }

  app.decorateRequest('usuarioId', '');

  app.addHook('onRequest', async (peticion) => {
    peticion.usuarioId = await resolver();
  });
}

export const usuarioActual = fp(plugin, { name: 'usuario-actual' });
