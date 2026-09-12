/** Capa HTTP del perfil: recibe, valida con Zod, responde. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ActualizarPerfilSchema, UnPerfilSchema } from './schemas.js';
import * as servicio from './service.js';

export const rutasDePerfil: FastifyPluginAsyncZod = async (app) => {
  // Lo que dice la sesión se pega aquí y no en el servicio: ni el permiso ni
  // la suplantación viven en la tabla, y esta capa es la única que conoce la
  // petición.
  app.get('/profile', { schema: { response: { 200: UnPerfilSchema } } }, async (peticion) => ({
    data: {
      ...(await servicio.obtenerPerfil(peticion.usuarioId)),
      isAdmin: peticion.esAdmin,
      isImpersonated: peticion.suplantada,
    },
  }));

  app.patch(
    '/profile',
    { schema: { body: ActualizarPerfilSchema, response: { 200: UnPerfilSchema } } },
    async (peticion) => ({
      data: {
        ...(await servicio.actualizarPerfil(peticion.usuarioId, peticion.body)),
        isAdmin: peticion.esAdmin,
        isImpersonated: peticion.suplantada,
      },
    }),
  );
};
