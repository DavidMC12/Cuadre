import { z } from 'zod';
import { MonedaSchema, MontoConCeroSchema } from '../../shared/schemas.js';

export const TIPOS_DE_CUENTA = ['bank', 'card', 'cash'] as const;
export const TipoDeCuentaSchema = z.enum(TIPOS_DE_CUENTA);

// -----------------------------------------------------------------------------
// Peticiones

export const CrearCuentaSchema = z.object({
  name: z.string().trim().min(1, 'la cuenta necesita un nombre').max(120),
  type: TipoDeCuentaSchema,
  currency: MonedaSchema,
  /**
   * La plata que ya hay en la cuenta el día que se crea. No se guarda como
   * columna: se registra como un movimiento de apertura, para que el saldo
   * siga siendo siempre la suma de los movimientos. Si es cero o no viene, no
   * se registra nada.
   */
  openingBalance: MontoConCeroSchema.optional(),
});

export const ListarCuentasSchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((valor) => valor === 'true'),
});

export const IdEnRutaSchema = z.object({ id: z.uuid() });

// -----------------------------------------------------------------------------
// Respuestas

export const CuentaSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: TipoDeCuentaSchema,
  currency: z.string(),
  /** Suma de los movimientos. Texto, para no perder precisión. */
  balance: z.string(),
  movementCount: z.number().int(),
  lastMovementAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
});

export const ListaDeCuentasSchema = z.object({ data: z.array(CuentaSchema) });
export const UnaCuentaSchema = z.object({ data: CuentaSchema });

export type CrearCuenta = z.infer<typeof CrearCuentaSchema>;
export type Cuenta = z.infer<typeof CuentaSchema>;
