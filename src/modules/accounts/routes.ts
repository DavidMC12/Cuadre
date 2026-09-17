/** Capa HTTP de las cuentas: recibe, valida con Zod, responde. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  ActualizarCuentaSchema,
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
   * Nombre, cupo y cuenta vinculada — nunca `type`, `currency` ni el saldo
   * (ese se deriva, no se edita). A diferencia de `/savings` de abajo, este sí
   * es un PATCH de varios campos a la vez: todos son "datos descriptivos de la
   * cuenta" que tiene sentido cambiar juntos desde un mismo formulario.
   */
  app.patch(
    '/accounts/:id',
    {
      schema: {
        params: IdEnRutaSchema,
        body: ActualizarCuentaSchema,
        response: { 200: UnaCuentaSchema },
      },
    },
    async (peticion) => ({
      data: await servicio.actualizarCuenta(peticion.usuarioId, peticion.params.id, peticion.body),
    }),
  );

  /** Sub-recurso aparte porque es la única edición que existía antes de que
   *  `/accounts/:id` de arriba se abriera: se deja igual para no romper nada. */
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
