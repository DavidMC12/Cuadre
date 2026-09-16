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
 */
export const CrearItemDeCategoriaSchema = z.object({
  kind: z.literal('category'),
  categoryId: z.uuid(),
  currency: MonedaSchema,
  amount: MontoPositivoSchema,
  label: EtiquetaSchema.optional(),
});

/**
 * Crear un ítem de ahorro: cuánto se espera aportarle este mes a una cuenta
 * ya marcada como de ahorro. La moneda no se pide: es la de la cuenta.
 */
export const CrearItemDeAhorroSchema = z.object({
  kind: z.literal('savings'),
  accountId: z.uuid(),
  amount: MontoPositivoSchema,
  label: EtiquetaSchema.optional(),
});

export const CrearItemSchema = z.discriminatedUnion('kind', [
  CrearItemDeCategoriaSchema,
  CrearItemDeAhorroSchema,
]);

/**
 * Cambiar cuánto se espera mover desde ahora. Nunca reescribe cómo se vio un
 * mes que ya pasó (ver `budget_item_targets` en el esquema).
 */
export const ActualizarObjetivoSchema = z.object({ amount: MontoPositivoSchema });

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
  /** `progress` llegó o pasó de `target`. Siempre `false` si `target` es nulo. */
  checked: z.boolean(),
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
