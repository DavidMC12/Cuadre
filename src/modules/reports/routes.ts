/** Capa HTTP de los reportes: recibe, valida con Zod, responde. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  MonedasSchema,
  PorCategoriaSchema,
  RespuestaDeResumenSchema,
  RespuestaDeTendenciaSchema,
  RespuestaPorCategoriaSchema,
  ResumenDelMesSchema,
  TendenciaSchema,
} from './schemas.js';
import * as servicio from './service.js';

export const rutasDeReportes: FastifyPluginAsyncZod = async (app) => {
  /**
   * Las monedas en las que esta persona tiene cuentas. El frontend solo muestra
   * un selector si hay más de una: con una sola, elegirla sería una decisión
   * que no hay que tomar.
   */
  app.get(
    '/reports/currencies',
    { schema: { response: { 200: MonedasSchema } } },
    async (peticion) => servicio.monedasDisponibles(peticion.usuarioId),
  );

  app.get(
    '/reports/summary',
    { schema: { querystring: ResumenDelMesSchema, response: { 200: RespuestaDeResumenSchema } } },
    async (peticion) => servicio.resumenDelMes(peticion.usuarioId, peticion.query),
  );

  app.get(
    '/reports/by-category',
    { schema: { querystring: PorCategoriaSchema, response: { 200: RespuestaPorCategoriaSchema } } },
    async (peticion) => servicio.totalesPorCategoria(peticion.usuarioId, peticion.query),
  );

  app.get(
    '/reports/trend',
    { schema: { querystring: TendenciaSchema, response: { 200: RespuestaDeTendenciaSchema } } },
    async (peticion) => servicio.tendencia(peticion.usuarioId, peticion.query),
  );
};
