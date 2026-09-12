/** Capa HTTP del perfil: recibe, valida con Zod, responde. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ActualizarPerfilSchema, UnPerfilSchema } from './schemas.js';
import * as servicio from './service.js';

export const rutasDePerfil: FastifyPluginAsyncZod = async (app) => {
  app.get('/profile', { schema: { response: { 200: UnPerfilSchema } } }, async (peticion) => ({
    data: await servicio.obtenerPerfil(peticion.usuarioId),
  }));

  app.patch(
    '/profile',
    { schema: { body: ActualizarPerfilSchema, response: { 200: UnPerfilSchema } } },
    async (peticion) => ({
      data: await servicio.actualizarPerfil(peticion.usuarioId, peticion.body),
    }),
  );
};
