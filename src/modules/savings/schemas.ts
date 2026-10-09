/**
 * Validación en el borde de los registros manuales de ahorro.
 *
 * Un registro manual no es un movimiento: no cambia el saldo de ninguna cuenta.
 * Anota lo que la persona decidió apartar ("aparté 500.000 para ahorro") o
 * retirar del ahorro, con signo. Los montos viajan como TEXTO, nunca como
 * number, igual que en el resto de la app.
 */
import { z } from 'zod';
import { FechaSchema, MontoSchema } from '../../shared/schemas.js';

// -----------------------------------------------------------------------------
// Peticiones

export const RegistrarAhorroSchema = z.object({
  accountId: z.uuid(),
  /** Con signo y distinto de cero: positivo = apartaste, negativo = retiraste. */
  amount: MontoSchema,
  /** Cuándo ocurrió de verdad. Si no llega, es ahora. */
  occurredAt: FechaSchema.optional(),
  description: z.string().trim().min(1).max(500).nullish(),
});

export const ListarAhorrosSchema = z.object({
  accountId: z.uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// -----------------------------------------------------------------------------
// Respuestas

export const RegistroDeAhorroSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  currency: z.string(),
  /** Con signo: positivo = apartaste, negativo = retiraste. Texto exacto. */
  amount: z.string(),
  occurredAt: z.string(),
  description: z.string().nullable(),
});

export const UnRegistroDeAhorroSchema = z.object({ data: RegistroDeAhorroSchema });
export const ListaDeRegistrosDeAhorroSchema = z.object({ data: z.array(RegistroDeAhorroSchema) });

export type RegistrarAhorro = z.infer<typeof RegistrarAhorroSchema>;
export type ListarAhorros = z.infer<typeof ListarAhorrosSchema>;
export type RegistroDeAhorro = z.infer<typeof RegistroDeAhorroSchema>;
