/**
 * Quién está haciendo la petición.
 *
 * La autenticación de verdad la hace Neon Auth (ver `neon-auth.ts`): aquí solo
 * se traduce esa identidad externa a un usuario de ESTA app. La tabla `users`
 * ya traía las columnas para esto desde la Fase 0 (`auth_provider`,
 * `auth_subject`) — este archivo es el que finalmente las usa.
 *
 * Ni los servicios ni los repositorios se enteran de nada de esto: reciben
 * `peticion.usuarioId`, que ya es el id de la fila de `users`, igual que
 * siempre.
 */
import { and, eq, isNotNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { db } from '../db/client.js';
import { users } from '../db/schema/index.js';
import { sinAutorizar } from './errores.js';
import { verificarSesion } from './neon-auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Dueño de los datos de esta petición. Nunca es implícito más abajo. */
    usuarioId: string;
  }
}

const PROVEEDOR = 'neon-auth';

/**
 * Rutas donde no hace falta sesión. `/api/salud` la consultan cosas como el
 * monitor de Vercel, que no van a mandar una cookie de sesión.
 */
const RUTAS_PUBLICAS = new Set(['/api/salud']);

/**
 * Encuentra el usuario de esta app para una identidad de Neon Auth, o lo crea
 * la primera vez que esa persona hace una petición.
 *
 * `onConflictDoNothing` cubre la carrera de dos peticiones simultáneas de
 * alguien que entra por primera vez (dos pestañas, por ejemplo): la segunda
 * no falla, simplemente no inserta, y ambas terminan leyendo la misma fila.
 */
async function encontrarOCrearUsuario(identidad: {
  id: string;
  email: string;
  displayName: string | null;
}): Promise<string> {
  const [existente] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.authProvider, PROVEEDOR), eq(users.authSubject, identidad.id)))
    .limit(1);

  if (existente) return existente.id;

  await db
    .insert(users)
    .values({
      email: identidad.email.toLowerCase(),
      displayName: identidad.displayName?.trim() || identidad.email,
      authProvider: PROVEEDOR,
      authSubject: identidad.id,
    })
    // El indice unico es PARCIAL (`where auth_subject is not null`, ver
    // schema/users.ts): sin repetir aqui esa condicion, Postgres no la
    // reconoce como blanco valido y el insert falla con 42P10.
    .onConflictDoNothing({
      target: [users.authProvider, users.authSubject],
      where: isNotNull(users.authSubject),
    });

  const [creado] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.authProvider, PROVEEDOR), eq(users.authSubject, identidad.id)))
    .limit(1);

  if (!creado) throw new Error('No se pudo crear el usuario a partir de la sesion de Neon Auth.');
  return creado.id;
}

export interface OpcionesDeUsuario {
  /**
   * De dónde sale el usuario de la petición. Solo lo usan las pruebas, para
   * que cada tanda trabaje con su propio usuario sin pasar por una sesión de
   * verdad. Cuando se da, la verificación de Neon Auth ni se intenta.
   */
  resolver?: () => Promise<string>;
}

async function plugin(app: FastifyInstance, opciones: OpcionesDeUsuario): Promise<void> {
  app.decorateRequest('usuarioId', '');

  app.addHook('onRequest', async (peticion, respuesta) => {
    if (RUTAS_PUBLICAS.has(peticion.url)) return;

    if (opciones.resolver) {
      peticion.usuarioId = await opciones.resolver();
      return;
    }

    const identidad = await verificarSesion(peticion, respuesta);
    if (!identidad) throw sinAutorizar();

    peticion.usuarioId = await encontrarOCrearUsuario(identidad);
  });
}

export const usuarioActual = fp(plugin, { name: 'usuario-actual' });
