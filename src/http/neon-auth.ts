/**
 * Cliente de Neon Auth (Better Auth administrado por Neon).
 *
 * Las credenciales de quien hace la petición no viven en esta app: viven en
 * el esquema `neon_auth` de la misma base, y el servidor de Neon Auth es
 * quien sabe leerlas. Aquí solo se le pregunta "¿esta cookie es una sesión
 * válida, y de quién?" — nunca se compara una contraseña a mano.
 *
 * El paquete espera un "contexto de la petición actual" que un framework como
 * Next.js resuelve solo (`next/headers`). Fastify no tiene ese concepto, así
 * que se arma a mano con `AsyncLocalStorage`: mientras dura la verificación de
 * una petición, la petición y la respuesta de Fastify quedan disponibles para
 * el adaptador de abajo.
 *
 * NOTA: `@neondatabase/auth` está en versión 0.5.0-beta. Si algo se comporta
 * raro (una sesión válida que no se reconoce, un tipo que no coincide), sospecha
 * primero de este paquete antes que del resto del código.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  createAuthServer,
  serializeSetCookie,
  type NeonAuthServer,
} from '@neondatabase/auth/server';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

interface PeticionActual {
  request: FastifyRequest;
  reply: FastifyReply;
}

const almacenDePeticion = new AsyncLocalStorage<PeticionActual>();

let clienteMemoizado: NeonAuthServer | null = null;

function clienteDeNeonAuth(): NeonAuthServer {
  if (clienteMemoizado) return clienteMemoizado;

  clienteMemoizado = createAuthServer({
    baseUrl: env.NEON_AUTH_BASE_URL,
    cookieSecret: env.NEON_AUTH_COOKIE_SECRET,

    // Fastify no tiene almacenamiento ambiental de la petición: se construye
    // aquí leyendo lo que `verificarSesion` guardó en el AsyncLocalStorage.
    context: () => {
      const actual = almacenDePeticion.getStore();
      if (!actual) {
        // Solo puede pasar por un error de programación: llamar al cliente
        // fuera de verificarSesion(). Ninguna petición real cae aquí.
        throw new Error('El cliente de Neon Auth se uso fuera de una peticion.');
      }
      const { request, reply } = actual;

      return {
        getCookies: () => request.headers.cookie ?? '',

        getHeader: (nombre: string) => {
          const valor = request.headers[nombre.toLowerCase()];
          if (typeof valor === 'string') return valor;
          return valor?.[0] ?? null;
        },

        getOrigin: () => {
          const origen = request.headers.origin;
          return typeof origen === 'string' ? origen : '';
        },

        // El servidor de Neon Auth puede pedir refrescar la cookie de sesion
        // cacheada (por ejemplo, tras validarla contra la base). Se reusa el
        // serializador del propio paquete para no reinventar el formato.
        setCookie: (nombre: string, valor: string, opciones) => {
          const nuevaCookie = serializeSetCookie({ name: nombre, value: valor, ...opciones });
          const existentes = reply.getHeader('set-cookie');
          const previas = Array.isArray(existentes)
            ? existentes
            : typeof existentes === 'string'
              ? [existentes]
              : [];
          reply.header('set-cookie', [...previas, nuevaCookie]);
        },

        getFramework: () => 'fastify',
      };
    },
  });

  return clienteMemoizado;
}

/** Lo mínimo de la identidad que necesita el resto de la app. */
export interface IdentidadDeSesion {
  id: string;
  email: string;
  displayName: string | null;
}

/**
 * Verifica la sesión de la petición actual contra Neon Auth.
 *
 * Devuelve `null` cuando no hay sesión, cuando expiró, o cuando el servidor
 * de autenticación no responde — nunca se distingue el motivo en la
 * respuesta HTTP: eso le daría pistas a quien intenta adivinar una sesión
 * ajena. El detalle sí queda en el registro, sin tokens ni cookies.
 */
export async function verificarSesion(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<IdentidadDeSesion | null> {
  const auth = clienteDeNeonAuth();

  try {
    const { data, error } = await almacenDePeticion.run({ request, reply }, () =>
      auth.getSession(),
    );

    if (error || !data?.user) return null;

    return {
      id: data.user.id,
      email: data.user.email,
      displayName: data.user.name ?? null,
    };
  } catch (fallo) {
    request.log.warn(
      {
        tipo: fallo instanceof Error ? fallo.name : typeof fallo,
        mensaje: (fallo as Error)?.message,
      },
      'no se pudo verificar la sesion con Neon Auth',
    );
    return null;
  }
}
