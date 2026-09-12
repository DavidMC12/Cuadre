/** Capa HTTP del perfil: recibe, valida con Zod, responde. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ActualizarPerfilSchema, UnPerfilSchema } from './schemas.js';
import * as servicio from './service.js';

export const rutasDePerfil: FastifyPluginAsyncZod = async (app) => {
  // `isAdmin` se pega aquí y no en el servicio: el permiso lo manda la sesión,
  // no la tabla, y esta capa es la única que conoce la petición.
  app.get('/profile', { schema: { response: { 200: UnPerfilSchema } } }, async (peticion) => ({
    data: { ...(await servicio.obtenerPerfil(peticion.usuarioId)), isAdmin: peticion.esAdmin },
  }));

  app.patch(
    '/profile',
    { schema: { body: ActualizarPerfilSchema, response: { 200: UnPerfilSchema } } },
    async (peticion) => ({
      data: {
        ...(await servicio.actualizarPerfil(peticion.usuarioId, peticion.body)),
        isAdmin: peticion.esAdmin,
      },
    }),
  );
};
