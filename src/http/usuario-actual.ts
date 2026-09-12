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
import { sinAutorizar, sinPermiso } from './errores.js';
import { verificarSesion } from './neon-auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Dueño de los datos de esta petición. Nunca es implícito más abajo. */
    usuarioId: string;
    /**
     * Si quien pide administra el sistema. Solo lo miran las rutas de
     * administración; el resto de la app trata a todo el mundo igual, y esa es
     * la razón de que suplantar a alguien no necesite tocar ningún módulo.
     */
    esAdmin: boolean;
    /** Si esta sesión es la de alguien a quien un administrador está viendo. */
    suplantada: boolean;
  }
}

const ROL_ADMIN = 'admin';

/**
 * Better Auth admite varios roles a la vez y los guarda separados por comas
 * ("admin,user"), así que comparar el texto completo contra 'admin' dejaría
 * fuera a un administrador de verdad.
 *
 * La comparación es exacta —sin recortar espacios ni ignorar mayúsculas— a
 * propósito: es literalmente lo que hace Neon Auth al decidir lo mismo. Ser
 * más generoso aquí abriría la puerta al desacuerdo contrario, donde Cuadre te
 * deja entrar al panel y Neon te rechaza a media operación. Que los dos digan
 * lo mismo importa más que aceptar un " Admin " escrito a mano.
 */
export function esRolAdmin(rol: string | null): boolean {
  if (!rol) return false;
  return rol.split(',').includes(ROL_ADMIN);
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
  /** Solo para pruebas: si ese usuario administra el sistema. */
  esAdmin?: boolean;
  /** Solo para pruebas: si la sesión es una suplantación. */
  suplantada?: boolean;
}

/**
 * Métodos que cambian algo. Dar soporte es entender qué pasó, no escribir en
 * las cuentas de nadie.
 */
const METODOS_QUE_ESCRIBEN = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

const SOLO_MIRAR =
  'Estás viendo la cuenta de otra persona: desde aquí solo puedes mirar. Vuelve a la tuya para registrar algo.';

/**
 * Cierra con llave todo lo que escriba mientras se está viendo la cuenta de
 * alguien más.
 *
 * Va por método y no ruta por ruta a propósito: así una ruta nueva nace
 * protegida en vez de acordarse de protegerla. Y va aquí, en el borde, porque
 * el libro de movimientos no se edita —un gasto registrado por error en la
 * cuenta equivocada queda escrito para siempre— y esa clase de error no se
 * arregla con cuidado, se arregla haciéndolo imposible.
 */
function exigirSoloLectura(metodo: string, suplantada: boolean): void {
  if (suplantada && METODOS_QUE_ESCRIBEN.has(metodo)) throw sinPermiso(SOLO_MIRAR);
}

async function plugin(app: FastifyInstance, opciones: OpcionesDeUsuario): Promise<void> {
  app.decorateRequest('usuarioId', '');
  app.decorateRequest('esAdmin', false);
  app.decorateRequest('suplantada', false);

  app.addHook('onRequest', async (peticion, respuesta) => {
    if (RUTAS_PUBLICAS.has(peticion.url)) return;

    if (opciones.resolver) {
      peticion.usuarioId = await opciones.resolver();
      peticion.suplantada = opciones.suplantada ?? false;
      // La misma regla que abajo, para que las pruebas la comprueben de verdad
      // en vez de comprobar un atajo que se porta distinto.
      peticion.esAdmin = (opciones.esAdmin ?? false) && !peticion.suplantada;
      exigirSoloLectura(peticion.method, peticion.suplantada);
      return;
    }

    const identidad = await verificarSesion(peticion, respuesta);
    if (!identidad) throw sinAutorizar();

    peticion.suplantada = identidad.suplantadaPor !== null;

    // Antes de `encontrarOCrearUsuario`, que puede insertar una fila: no tiene
    // sentido escribir en la base por una petición que se va a rechazar igual.
    exigirSoloLectura(peticion.method, peticion.suplantada);

    peticion.usuarioId = await encontrarOCrearUsuario(identidad);

    // La segunda mitad no sobra aunque Neon Auth ya impida suplantar a un
    // administrador: esa garantía vive en la configuración del servidor de
    // Neon, fuera de este repositorio, y un paquete en beta puede cambiar un
    // valor por defecto sin que aquí se entere nadie. La regla está escrita en
    // CLAUDE.md como no negociable, así que la hace cumplir esta app.
    peticion.esAdmin = esRolAdmin(identidad.rol) && !peticion.suplantada;
  });
}

export const usuarioActual = fp(plugin, { name: 'usuario-actual' });
