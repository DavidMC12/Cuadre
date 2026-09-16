import { z } from 'zod';
import { MonedaSchema, MontoConCeroSchema, MontoPositivoSchema } from '../../shared/schemas.js';

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
  /**
   * Puramente descriptivo: para que el Resumen sepa cuánto tienes ahorrado.
   * No es una meta ni cambia ninguna otra regla. Una tarjeta no puede
   * marcarse (la base lo exige con `accounts_savings_not_for_card`).
   */
  isSavings: z.boolean().default(false),
  /** Solo para tarjetas. Cuánto queda disponible se calcula, no se guarda. */
  creditLimit: MontoPositivoSchema.optional(),
  /** Solo para tarjetas: de qué cuenta sale la plata cuando se paga esta. */
  linkedAccountId: z.uuid().optional(),
});

/**
 * Editar una cuenta ya creada. Todo opcional: solo se cambia lo que venga.
 * `null` en `creditLimit`/`linkedAccountId` borra el valor; omitirlos los deja
 * como estaban. No incluye `type`, `currency` ni `openingBalance` — cambiar
 * de qué está hecha una cuenta o su saldo de partida no es "editar", es una
 * cuenta distinta.
 */
export const ActualizarCuentaSchema = z
  .object({
    name: z.string().trim().min(1, 'la cuenta necesita un nombre').max(120).optional(),
    creditLimit: MontoPositivoSchema.nullable().optional(),
    linkedAccountId: z.uuid().nullable().optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, { message: 'No hay nada que cambiar.' });

export const ListarCuentasSchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((valor) => valor === 'true'),
});

export const IdEnRutaSchema = z.object({ id: z.uuid() });

/** Marca o desmarca una cuenta como cuenta de ahorro. Nada más cambia aquí. */
export const MarcarAhorroSchema = z.object({ isSavings: z.boolean() });

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
  isSavings: z.boolean(),
  /** Solo en tarjetas. Texto exacto, nunca number. */
  creditLimit: z.string().nullable(),
  /** Solo en tarjetas: la cuenta desde la que normalmente se paga. */
  linkedAccountId: z.uuid().nullable(),
});

export const ListaDeCuentasSchema = z.object({ data: z.array(CuentaSchema) });
export const UnaCuentaSchema = z.object({ data: CuentaSchema });

export type CrearCuenta = z.infer<typeof CrearCuentaSchema>;
export type ActualizarCuenta = z.infer<typeof ActualizarCuentaSchema>;
export type Cuenta = z.infer<typeof CuentaSchema>;
export type MarcarAhorro = z.infer<typeof MarcarAhorroSchema>;
