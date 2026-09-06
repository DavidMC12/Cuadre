/**
 * Validación en el borde del catálogo de categorías.
 *
 * Recorte de la Fase 1b: no se exponen subcategorías. La columna `parent_id`
 * existe en la base desde la Fase 0, pero mientras nadie pueda crearlas desde
 * la app, mostrarlas solo agregaría un nivel que hay que explicar.
 */
import { z } from 'zod';

export const TIPOS_DE_CATEGORIA = ['income', 'expense'] as const;
export const TipoDeCategoriaSchema = z.enum(TIPOS_DE_CATEGORIA);

const NombreSchema = z.string().trim().min(1, 'la categoría necesita un nombre').max(120);

// -----------------------------------------------------------------------------
// Peticiones

export const CrearCategoriaSchema = z.object({
  name: NombreSchema,
  kind: TipoDeCategoriaSchema,
});

/**
 * Renombrar, y nada más. `kind` se acepta en el cuerpo a propósito aunque no se
 * pueda cambiar: si Zod lo descartara en silencio, quien lo mandó creería que
 * el cambio se hizo. Se recibe para poder explicar por qué no.
 */
export const RenombrarCategoriaSchema = z.object({
  name: NombreSchema,
  kind: TipoDeCategoriaSchema.optional(),
});

export const ListarCategoriasSchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((valor) => valor === 'true'),
});

export const IdEnRutaSchema = z.object({ id: z.uuid() });

// -----------------------------------------------------------------------------
// Respuestas

export const CategoriaSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: TipoDeCategoriaSchema,
  archivedAt: z.string().nullable(),
});

export const ListaDeCategoriasSchema = z.object({ data: z.array(CategoriaSchema) });
export const UnaCategoriaSchema = z.object({ data: CategoriaSchema });

export type CrearCategoria = z.infer<typeof CrearCategoriaSchema>;
export type RenombrarCategoria = z.infer<typeof RenombrarCategoriaSchema>;
export type Categoria = z.infer<typeof CategoriaSchema>;
export type TipoDeCategoria = z.infer<typeof TipoDeCategoriaSchema>;
