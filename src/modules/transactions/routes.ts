/**
 * Capa HTTP del libro de movimientos: recibe, valida con Zod, responde.
 * No decide nada; para eso está el servicio.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CrearTransferenciaSchema,
  IdEnRutaSchema,
  ListaDeMovimientosSchema,
  ListarMovimientosSchema,
  RecategorizarSchema,
  RegistrarMovimientoSchema,
  TransferenciaSchema,
  UnMovimientoSchema,
} from './schemas.js';
import * as servicio from './service.js';

export const rutasDeMovimientos: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/transactions',
    {
      schema: { querystring: ListarMovimientosSchema, response: { 200: ListaDeMovimientosSchema } },
    },
    async (peticion) => servicio.listarMovimientos(peticion.usuarioId, peticion.query),
  );

  app.get(
    '/transactions/:id',
    { schema: { params: IdEnRutaSchema, response: { 200: UnMovimientoSchema } } },
    async (peticion) => ({
      data: await servicio.obtenerMovimiento(peticion.usuarioId, peticion.params.id),
    }),
  );

  app.post(
    '/transactions',
    { schema: { body: RegistrarMovimientoSchema, response: { 201: UnMovimientoSchema } } },
    async (peticion, respuesta) => {
      const movimiento = await servicio.registrarMovimiento(peticion.usuarioId, peticion.body);
      return respuesta.code(201).send({ data: movimiento });
    },
  );

  /**
   * Anular, no borrar. Devuelve el movimiento de anulación que se creó; el
   * original sigue existiendo y ahora aparece marcado como anulado.
   */
  app.post(
    '/transactions/:id/reversal',
    { schema: { params: IdEnRutaSchema, response: { 201: UnMovimientoSchema } } },
    async (peticion, respuesta) => {
      const anulacion = await servicio.anularMovimiento(peticion.usuarioId, peticion.params.id);
      return respuesta.code(201).send({ data: anulacion });
    },
  );

  app.post(
    '/transfers',
    { schema: { body: CrearTransferenciaSchema, response: { 201: TransferenciaSchema } } },
    async (peticion, respuesta) => {
      const transferencia = await servicio.crearTransferencia(peticion.usuarioId, peticion.body);
      return respuesta.code(201).send({ data: transferencia });
    },
  );

  app.post(
    '/transfers/:id/reversal',
    {
      schema: {
        params: z.object({ id: z.uuid() }),
        response: { 201: TransferenciaSchema },
      },
    },
    async (peticion, respuesta) => {
      const anulacion = await servicio.anularTransferencia(peticion.usuarioId, peticion.params.id);
      return respuesta.code(201).send({ data: anulacion });
    },
  );

  /**
   * Lo unico que se puede corregir de un movimiento. El monto, la fecha y la
   * cuenta no: para eso se anula y se registra de nuevo.
   */
  app.patch(
    '/transactions/:id/category',
    {
      schema: {
        params: IdEnRutaSchema,
        body: RecategorizarSchema,
        response: { 200: UnMovimientoSchema },
      },
    },
    async (peticion) => ({
      data: await servicio.recategorizarMovimiento(
        peticion.usuarioId,
        peticion.params.id,
        peticion.body.categoryId,
      ),
    }),
  );
};
