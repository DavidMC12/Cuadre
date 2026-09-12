/** Capa HTTP de la administración: recibe, valida con Zod, responde. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  ListaDeSuplantacionesSchema,
  ListarSuplantacionesSchema,
  RegistrarSuplantacionSchema,
  UnaSuplantacionSchema,
} from './schemas.js';
import * as servicio from './service.js';

export const rutasDeAdmin: FastifyPluginAsyncZod = async (app) => {
  /**
   * Deja constancia de que se va a entrar a la cuenta de alguien. Lo llama la
   * pantalla ANTES de suplantar: si esto falla, no se suplanta. Primero el
   * rastro, después el acceso.
   */
  app.post(
    '/admin/impersonations',
    { schema: { body: RegistrarSuplantacionSchema, response: { 201: UnaSuplantacionSchema } } },
    async (peticion, respuesta) => {
      const registro = await servicio.registrarSuplantacion(
        peticion.usuarioId,
        peticion.esAdmin,
        peticion.body,
      );
      return respuesta.code(201).send({ data: registro });
    },
  );

  app.get(
    '/admin/impersonations',
    {
      schema: {
        querystring: ListarSuplantacionesSchema,
        response: { 200: ListaDeSuplantacionesSchema },
      },
    },
    async (peticion) =>
      servicio.listarSuplantaciones(peticion.usuarioId, peticion.esAdmin, peticion.query.limit),
  );
};
