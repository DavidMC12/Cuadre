/**
 * Validación en el borde del checklist de presupuesto.
 *
 * Los montos, igual que en cuentas y movimientos, siempre viajan como texto.
 */
import { z } from 'zod';
import { MonedaSchema, MontoPositivoSchema } from '../../shared/schemas.js';

export const TIPOS_DE_ITEM = ['category', 'savings'] as const;
export const TipoDeItemSchema = z.enum(TIPOS_DE_ITEM);
export type BudgetItemKind = z.infer<typeof TipoDeItemSchema>;

/** Un mes calendario, como "2026-09". Mismo formato que usan los reportes. */
export const MesSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'debe ser un mes como "2026-09"');

const EtiquetaSchema = z.string().trim().min(1, 'la etiqueta no puede quedar vacía').max(120);

// -----------------------------------------------------------------------------
// Peticiones

/**
 * Crear un ítem de categoría: un tope de gasto o un recordatorio de pago.
 * La moneda hay que decirla, porque una categoría por sí sola no tiene una:
 * la misma categoría puede recibir movimientos en más de una moneda.
 *
 * `month` (opcional) es el mes del primer monto: si no llega, es el actual.
 */
export const CrearItemDeCategoriaSchema = z.object({
  kind: z.literal('category'),
  categoryId: z.uuid(),
  currency: MonedaSchema,
  amount: MontoPositivoSchema,
  label: EtiquetaSchema.optional(),
  month: MesSchema.optional(),
});

/**
 * Crear un ítem de ahorro: cuánto se espera aportarle a una cuenta ya
 * marcada como de ahorro. La moneda no se pide: es la de la cuenta.
 *
 * `month` (opcional) sigue el mismo convenio que en el ítem de categoría.
 */
export const CrearItemDeAhorroSchema = z.object({
  kind: z.literal('savings'),
  accountId: z.uuid(),
  amount: MontoPositivoSchema,
  label: EtiquetaSchema.optional(),
  month: MesSchema.optional(),
});

export const CrearItemSchema = z.discriminatedUnion('kind', [
  CrearItemDeCategoriaSchema,
  CrearItemDeAhorroSchema,
]);

/**
 * Fijar el monto de UN mes concreto, sin importar si ya pasó: cada ítem
 * lleva un monto propio por mes (ver `budget_item_targets` y
 * `fijarObjetivoDelMes` en el repository).
 */
export const FijarObjetivoDelMesSchema = z.object({
  amount: MontoPositivoSchema,
  month: MesSchema,
});

export const EditarEtiquetaSchema = z.object({ label: EtiquetaSchema.nullable() });

export const IdEnRutaSchema = z.object({ id: z.uuid() });

export const ListarItemsSchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((valor) => valor === 'true'),
});

export const ChecklistDelMesSchema = z.object({ month: MesSchema, currency: MonedaSchema });

// -----------------------------------------------------------------------------
// Respuestas

export const ItemDePresupuestoSchema = z.object({
  id: z.uuid(),
  kind: TipoDeItemSchema,
  currency: z.string(),
  categoryId: z.uuid().nullable(),
  categoryName: z.string().nullable(),
  accountId: z.uuid().nullable(),
  accountName: z.string().nullable(),
  label: z.string().nullable(),
  /** El monto vigente hoy. Texto, para no perder precisión. */
  currentAmount: z.string().nullable(),
  archivedAt: z.string().nullable(),
});

export const ListaDeItemsSchema = z.object({ data: z.array(ItemDePresupuestoSchema) });
export const UnItemSchema = z.object({ data: ItemDePresupuestoSchema });

export const ItemDelChecklistSchema = z.object({
  id: z.uuid(),
  kind: TipoDeItemSchema,
  currency: z.string(),
  /** El nombre a mostrar: la etiqueta si hay una, si no el de la categoría o cuenta. */
  label: z.string(),
  /** Nulo si el ítem se creó después de ese mes: no aplica todavía. */
  target: z.string().nullable(),
  /** Cuánto se ha gastado (categoría) o ahorrado (cuenta) este mes. */
  progress: z.string(),
  /**
   * La meta se alcanzó: `progress` llegó o pasó de `target`. Solo tiene
   * sentido en una meta de ahorro; en un tope de gasto siempre es `false`,
   * porque un tope no se "cumple" gastando. Siempre `false` si `target` es
   * nulo.
   */
  checked: z.boolean(),
  /**
   * El tope se pasó: `progress` superó `target`. Solo tiene sentido en un
   * tope de gasto; en una meta de ahorro siempre es `false`, porque ahorrar
   * de más no es un problema. Siempre `false` si `target` es nulo.
   */
  exceeded: z.boolean(),
});

export const ChecklistSchema = z.object({
  data: z.object({
    month: z.string(),
    currency: z.string(),
    items: z.array(ItemDelChecklistSchema),
  }),
});

export type CrearItem = z.infer<typeof CrearItemSchema>;
export type ItemDePresupuesto = z.infer<typeof ItemDePresupuestoSchema>;
export type ItemDelChecklist = z.infer<typeof ItemDelChecklistSchema>;
