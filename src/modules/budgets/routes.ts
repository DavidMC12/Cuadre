/** Capa HTTP del checklist de presupuesto: recibe, valida con Zod, responde. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  ActualizarObjetivoSchema,
  ChecklistDelMesSchema,
  ChecklistSchema,
  CrearItemSchema,
  EditarEtiquetaSchema,
  IdEnRutaSchema,
  ListaDeItemsSchema,
  ListarItemsSchema,
  UnItemSchema,
} from './schemas.js';
import * as servicio from './service.js';

export const rutasDePresupuesto: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/budgets/items',
    { schema: { querystring: ListarItemsSchema, response: { 200: ListaDeItemsSchema } } },
    async (peticion) => servicio.listarItems(peticion.usuarioId, peticion.query.includeArchived),
  );

  app.post(
    '/budgets/items',
    { schema: { body: CrearItemSchema, response: { 201: UnItemSchema } } },
    async (peticion, respuesta) => {
      const item = await servicio.crearItem(peticion.usuarioId, peticion.body);
      return respuesta.code(201).send({ data: item });
    },
  );

  app.get(
    '/budgets/checklist',
    { schema: { querystring: ChecklistDelMesSchema, response: { 200: ChecklistSchema } } },
    async (peticion) =>
      servicio.checklistDelMes(peticion.usuarioId, {
        month: peticion.query.month,
        currency: peticion.query.currency,
      }),
  );

  app.patch(
    '/budgets/items/:id/target',
    {
      schema: {
        params: IdEnRutaSchema,
        body: ActualizarObjetivoSchema,
        response: { 200: UnItemSchema },
      },
    },
    async (peticion) => ({
      data: await servicio.actualizarObjetivo(
        peticion.usuarioId,
        peticion.params.id,
        peticion.body.amount,
      ),
    }),
  );

  app.patch(
    '/budgets/items/:id/label',
    {
      schema: {
        params: IdEnRutaSchema,
        body: EditarEtiquetaSchema,
        response: { 200: UnItemSchema },
      },
    },
    async (peticion) => ({
      data: await servicio.editarEtiqueta(
        peticion.usuarioId,
        peticion.params.id,
        peticion.body.label,
      ),
    }),
  );

  app.post(
    '/budgets/items/:id/archive',
    { schema: { params: IdEnRutaSchema, response: { 200: UnItemSchema } } },
    async (peticion) => ({
      data: await servicio.archivarItem(peticion.usuarioId, peticion.params.id),
    }),
  );

  app.post(
    '/budgets/items/:id/unarchive',
    { schema: { params: IdEnRutaSchema, response: { 200: UnItemSchema } } },
    async (peticion) => ({
      data: await servicio.desarchivarItem(peticion.usuarioId, peticion.params.id),
    }),
  );
};
