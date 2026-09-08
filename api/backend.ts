/**
 * La unica funcion de Vercel de este proyecto. `vercel.json` en la raiz
 * reenvia hacia aca /api/salud y /api/v1/* (con rewrites, no con un nombre
 * de archivo dinamico bajo /api/): los archivos tipo [...ruta].ts resultaron
 * tener un limite de un solo segmento en la version del builder que usa
 * este proyecto, y /api/v1/movimientos/:id (dos segmentos) caia en 404. El
 * detalle completo esta en DESPLIEGUE.md.
 *
 * Adrede tampoco usa la deteccion automatica de framework de Vercel para
 * Fastify: probamos ese camino tambien y fallaba de maneras distintas y
 * dificiles de diagnosticar en cada intento.
 *
 * Como el reenvio conserva la URL original de la peticion, Fastify sigue
 * enrutando el pedido de siempre por su cuenta. Fastify ya expone su propio
 * servidor HTTP (`app.server`); en vez de escuchar en un puerto
 * (`app.listen`, que aca no aplica), le pasamos la peticion directo
 * emitiendo el evento 'request' que Fastify ya escucha.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { construirApp } from '../src/aplicacion.js';

let promesaApp: ReturnType<typeof construirApp> | undefined;

export default async function manejador(
  peticion: IncomingMessage,
  respuesta: ServerResponse,
): Promise<void> {
  promesaApp ??= construirApp();
  const app = await promesaApp;
  await app.ready();
  app.server.emit('request', peticion, respuesta);
}
