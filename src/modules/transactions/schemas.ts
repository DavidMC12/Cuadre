/**
 * Validación en el borde. Nada entra a la aplicación sin pasar por aquí.
 *
 * Los montos se validan como TEXTO y se mantienen como texto de punta a punta.
 * Si se convirtieran a `number` para validarlos, ya habrían perdido precisión
 * antes de llegar a la base.
 */
import { z } from 'zod';
import { FechaSchema, MontoPositivoSchema, MontoSchema } from '../../shared/schemas.js';

export const TIPOS_DE_MOVIMIENTO = ['opening', 'standard', 'transfer'] as const;

// -----------------------------------------------------------------------------
// Peticiones

export const RegistrarMovimientoSchema = z.object({
  accountId: z.uuid(),
  amount: MontoSchema,
  occurredAt: FechaSchema,
  description: z.string().trim().min(1).max(500).nullish(),
  categoryId: z.uuid().nullish(),
});

export const ListarMovimientosSchema = z.object({
  accountId: z.uuid().optional(),
  from: FechaSchema.optional(),
  to: FechaSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const IdEnRutaSchema = z.object({ id: z.uuid() });

export const CrearTransferenciaSchema = z
  .object({
    fromAccountId: z.uuid(),
    toAccountId: z.uuid(),
    /** Siempre positivo: la dirección la dan las cuentas, no el signo. */
    amount: MontoPositivoSchema,
    occurredAt: FechaSchema,
    description: z.string().trim().min(1).max(500).nullish(),
  })
  .refine((datos) => datos.fromAccountId !== datos.toAccountId, {
    message: 'La cuenta de origen y la de destino no pueden ser la misma.',
    path: ['toAccountId'],
  });

// -----------------------------------------------------------------------------
// Respuestas

export const MovimientoSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  categoryId: z.uuid().nullable(),
  kind: z.enum(TIPOS_DE_MOVIMIENTO),
  amount: z.string(),
  currency: z.string(),
  occurredAt: z.string(),
  description: z.string().nullable(),
  transferGroupId: z.uuid().nullable(),
  /** Si esta fila anula a otra, aquí va la anulada. */
  reversesTransactionId: z.uuid().nullable(),
  /** Si a esta fila la anularon, aquí va la anulación. */
  reversedByTransactionId: z.uuid().nullable(),
});

export const ListaDeMovimientosSchema = z.object({
  data: z.array(MovimientoSchema),
  nextCursor: z.string().nullable(),
});

export const UnMovimientoSchema = z.object({ data: MovimientoSchema });

export const TransferenciaSchema = z.object({
  data: z.object({
    transferGroupId: z.uuid(),
    legs: z.array(MovimientoSchema).length(2),
  }),
});

export type RegistrarMovimiento = z.infer<typeof RegistrarMovimientoSchema>;
export type ListarMovimientos = z.infer<typeof ListarMovimientosSchema>;
export type CrearTransferencia = z.infer<typeof CrearTransferenciaSchema>;
export type Movimiento = z.infer<typeof MovimientoSchema>;
