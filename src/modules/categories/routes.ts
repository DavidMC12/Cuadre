/** Capa HTTP del catálogo de categorías: recibe, valida con Zod, responde. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  CrearCategoriaSchema,
  IdEnRutaSchema,
  ListaDeCategoriasSchema,
  ListarCategoriasSchema,
  RenombrarCategoriaSchema,
  UnaCategoriaSchema,
} from './schemas.js';
import * as servicio from './service.js';

export const rutasDeCategorias: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/categories',
    { schema: { querystring: ListarCategoriasSchema, response: { 200: ListaDeCategoriasSchema } } },
    async (peticion) =>
      servicio.listarCategorias(peticion.usuarioId, peticion.query.includeArchived),
  );

  app.get(
    '/categories/:id',
    { schema: { params: IdEnRutaSchema, response: { 200: UnaCategoriaSchema } } },
    async (peticion) => ({
      data: await servicio.obtenerCategoria(peticion.usuarioId, peticion.params.id),
    }),
  );

  app.post(
    '/categories',
    { schema: { body: CrearCategoriaSchema, response: { 201: UnaCategoriaSchema } } },
    async (peticion, respuesta) => {
      const categoria = await servicio.crearCategoria(peticion.usuarioId, peticion.body);
      return respuesta.code(201).send({ data: categoria });
    },
  );

  /** Solo renombra. El tipo de una categoría no se cambia nunca. */
  app.patch(
    '/categories/:id',
    {
      schema: {
        params: IdEnRutaSchema,
        body: RenombrarCategoriaSchema,
        response: { 200: UnaCategoriaSchema },
      },
    },
    async (peticion) => ({
      data: await servicio.renombrarCategoria(
        peticion.usuarioId,
        peticion.params.id,
        peticion.body,
      ),
    }),
  );

  /** Archivar, nunca borrar: hay movimientos viejos apuntando a esta categoría. */
  app.post(
    '/categories/:id/archive',
    { schema: { params: IdEnRutaSchema, response: { 200: UnaCategoriaSchema } } },
    async (peticion) => ({
      data: await servicio.archivarCategoria(peticion.usuarioId, peticion.params.id),
    }),
  );

  app.post(
    '/categories/:id/unarchive',
    { schema: { params: IdEnRutaSchema, response: { 200: UnaCategoriaSchema } } },
    async (peticion) => ({
      data: await servicio.desarchivarCategoria(peticion.usuarioId, peticion.params.id),
    }),
  );
};
