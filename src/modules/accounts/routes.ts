/** Capa HTTP de las cuentas: recibe, valida con Zod, responde. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  CrearCuentaSchema,
  IdEnRutaSchema,
  ListaDeCuentasSchema,
  ListarCuentasSchema,
  MarcarAhorroSchema,
  UnaCuentaSchema,
} from './schemas.js';
import * as servicio from './service.js';

export const rutasDeCuentas: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/accounts',
    { schema: { querystring: ListarCuentasSchema, response: { 200: ListaDeCuentasSchema } } },
    async (peticion) => servicio.listarCuentas(peticion.usuarioId, peticion.query.includeArchived),
  );

  app.get(
    '/accounts/:id',
    { schema: { params: IdEnRutaSchema, response: { 200: UnaCuentaSchema } } },
    async (peticion) => ({
      data: await servicio.obtenerCuenta(peticion.usuarioId, peticion.params.id),
    }),
  );

  app.post(
    '/accounts',
    { schema: { body: CrearCuentaSchema, response: { 201: UnaCuentaSchema } } },
    async (peticion, respuesta) => {
      const cuenta = await servicio.crearCuenta(peticion.usuarioId, peticion.body);
      return respuesta.code(201).send({ data: cuenta });
    },
  );

  /** Archivar, nunca borrar: la cuenta tiene historia y la historia no se toca. */
  app.post(
    '/accounts/:id/archive',
    { schema: { params: IdEnRutaSchema, response: { 200: UnaCuentaSchema } } },
    async (peticion) => ({
      data: await servicio.archivarCuenta(peticion.usuarioId, peticion.params.id),
    }),
  );

  app.post(
    '/accounts/:id/unarchive',
    { schema: { params: IdEnRutaSchema, response: { 200: UnaCuentaSchema } } },
    async (peticion) => ({
      data: await servicio.desarchivarCuenta(peticion.usuarioId, peticion.params.id),
    }),
  );

  /**
   * Sub-recurso explícito, no un PATCH genérico: hoy no existe edición de
   * nombre/tipo/moneda de una cuenta, y esta ruta no abre esa puerta.
   */
  app.patch(
    '/accounts/:id/savings',
    {
      schema: {
        params: IdEnRutaSchema,
        body: MarcarAhorroSchema,
        response: { 200: UnaCuentaSchema },
      },
    },
    async (peticion) => ({
      data: await servicio.actualizarAhorro(
        peticion.usuarioId,
        peticion.params.id,
        peticion.body.isSavings,
      ),
    }),
  );
};
