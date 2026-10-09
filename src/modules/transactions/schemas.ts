/**
 * Validación en el borde. Nada entra a la aplicación sin pasar por aquí.
 *
 * Los montos se validan como TEXTO y se mantienen como texto de punta a punta.
 * Si se convirtieran a `number` para validarlos, ya habrían perdido precisión
 * antes de llegar a la base.
 */
import { z } from 'zod';
import { isNegative } from '../../shared/money.js';
import { FechaSchema, MontoPositivoSchema, MontoSchema } from '../../shared/schemas.js';

export const TIPOS_DE_MOVIMIENTO = ['opening', 'standard', 'transfer', 'adjustment'] as const;

// -----------------------------------------------------------------------------
// Peticiones

export const RegistrarMovimientoSchema = z.object({
  accountId: z.uuid(),
  amount: MontoSchema,
  occurredAt: FechaSchema,
  description: z.string().trim().min(1).max(500).nullish(),
  categoryId: z.uuid().nullish(),
  /** A qué ítem del presupuesto cuenta; nulo o ausente lo deja "sin asignar". */
  budgetItemId: z.uuid().nullish(),
});

export const ListarMovimientosSchema = z.object({
  accountId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  from: FechaSchema.optional(),
  to: FechaSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const IdEnRutaSchema = z.object({ id: z.uuid() });

/** Lo unico corregible de un movimiento. `null` lo deja sin categoria. */
export const RecategorizarSchema = z.object({ categoryId: z.uuid().nullable() });

/** Cambiar el ítem del presupuesto de un movimiento. `null` = "sin asignar". */
export const AsignarItemSchema = z.object({ budgetItemId: z.uuid().nullable() });

export const CrearTransferenciaSchema = z
  .object({
    fromAccountId: z.uuid(),
    toAccountId: z.uuid(),
    /** Siempre positivo: la dirección la dan las cuentas, no el signo. */
    amount: MontoPositivoSchema,
    occurredAt: FechaSchema,
    description: z.string().trim().min(1).max(500).nullish(),
    /** Solo el pago a una tarjeta: el ítem que ese pago deja pagado. */
    budgetItemId: z.uuid().nullish(),
  })
  .refine((datos) => datos.fromAccountId !== datos.toAccountId, {
    message: 'La cuenta de origen y la de destino no pueden ser la misma.',
    path: ['toAccountId'],
  });

/**
 * Una compra pagada con dos cuentas (la mitad con tarjeta, la mitad con plata
 * disponible). Cada parte lleva el monto CON SIGNO que le toca a su cuenta,
 * decidido por la interfaz como en un movimiento normal (gasto = negativo): las
 * dos del mismo signo, y en cuentas distintas.
 */
export const RegistrarPagoDivididoSchema = z
  .object({
    payments: z
      .array(z.object({ accountId: z.uuid(), amount: MontoSchema }))
      .length(2, 'un pago dividido tiene exactamente dos partes'),
    occurredAt: FechaSchema,
    // Menos de 500: el servidor le agrega " (1 de 2)" a cada parte y la
    // descripción guardada no debe pasar del tope de un movimiento normal.
    description: z.string().trim().min(1).max(490).nullish(),
    categoryId: z.uuid().nullish(),
    budgetItemId: z.uuid().nullish(),
  })
  .refine((datos) => datos.payments[0]?.accountId !== datos.payments[1]?.accountId, {
    message: 'Las dos partes del pago deben salir de cuentas distintas.',
    path: ['payments'],
  })
  .refine(
    (datos) =>
      datos.payments[0] === undefined ||
      datos.payments[1] === undefined ||
      isNegative(datos.payments[0].amount) === isNegative(datos.payments[1].amount),
    {
      message:
        'Las dos partes del pago deben ser del mismo tipo: las dos gastos o las dos ingresos.',
      path: ['payments'],
    },
  );

// -----------------------------------------------------------------------------
// Respuestas

export const MovimientoSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  categoryId: z.uuid().nullable(),
  /** A qué ítem del presupuesto cuenta; nulo si está "sin asignar". */
  budgetItemId: z.uuid().nullable(),
  kind: z.enum(TIPOS_DE_MOVIMIENTO),
  amount: z.string(),
  currency: z.string(),
  occurredAt: z.string(),
  description: z.string().nullable(),
  transferGroupId: z.uuid().nullable(),
  /**
   * Las dos partes de un gasto o ingreso repartido entre dos cuentas comparten
   * este grupo; la anulación de ese pago lleva su propio grupo nuevo.
   */
  paymentGroupId: z.uuid().nullable(),
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

export const PagoDivididoSchema = z.object({
  data: z.object({
    paymentGroupId: z.uuid(),
    legs: z.array(MovimientoSchema).length(2),
  }),
});

export const TransferenciaSchema = z.object({
  data: z.object({
    transferGroupId: z.uuid(),
    legs: z.array(MovimientoSchema).length(2),
  }),
});

export type RegistrarMovimiento = z.infer<typeof RegistrarMovimientoSchema>;
export type ListarMovimientos = z.infer<typeof ListarMovimientosSchema>;
export type CrearTransferencia = z.infer<typeof CrearTransferenciaSchema>;
export type RegistrarPagoDividido = z.infer<typeof RegistrarPagoDivididoSchema>;
export type Movimiento = z.infer<typeof MovimientoSchema>;
export type Recategorizar = z.infer<typeof RecategorizarSchema>;
export type AsignarItem = z.infer<typeof AsignarItemSchema>;
