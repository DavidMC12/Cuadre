/**
 * Capa HTTP de los registros manuales de ahorro: recibe, valida con Zod,
 * responde. No decide nada; para eso está el servicio.
 */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  ListaDeRegistrosDeAhorroSchema,
  ListarAhorrosSchema,
  RegistrarAhorroSchema,
  UnRegistroDeAhorroSchema,
} from './schemas.js';
import * as servicio from './service.js';

export const rutasDeAhorro: FastifyPluginAsyncZod = async (app) => {
  /**
   * Anota lo que la persona apartó (monto positivo) o retiró del ahorro (monto
   * negativo). No mueve plata de ninguna cuenta: solo alimenta lo "ahorrado".
   */
  app.post(
    '/savings-entries',
    { schema: { body: RegistrarAhorroSchema, response: { 201: UnRegistroDeAhorroSchema } } },
    async (peticion, respuesta) => {
      const registro = await servicio.registrarAhorro(peticion.usuarioId, peticion.body);
      return respuesta.code(201).send({ data: registro });
    },
  );

  /** Lo anotado en una cuenta, del más reciente al más viejo. */
  app.get(
    '/savings-entries',
    {
      schema: {
        querystring: ListarAhorrosSchema,
        response: { 200: ListaDeRegistrosDeAhorroSchema },
      },
    },
    async (peticion) => servicio.listarAhorros(peticion.usuarioId, peticion.query),
  );
};
