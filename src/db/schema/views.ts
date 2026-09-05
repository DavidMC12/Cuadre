import { bigint, char, numeric, pgView, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Saldos DERIVADOS. No hay ninguna tabla que guarde el saldo de una cuenta:
 * esta vista lo calcula sumando los movimientos, cada vez. Por eso nunca puede
 * quedar descuadrado respecto al detalle.
 *
 * Se declara como `existing()` porque la crea una migracion SQL escrita a mano
 * (drizzle/0001_reglas_de_dinero.sql), donde el SQL queda a la vista.
 */
export const accountBalances = pgView('account_balances', {
  userId: uuid('user_id').notNull(),
  accountId: uuid('account_id').notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  /** Suma de todos los movimientos de la cuenta. */
  balance: numeric('balance', { precision: 19, scale: 4 }).notNull(),
  movementCount: bigint('movement_count', { mode: 'number' }).notNull(),
  lastMovementAt: timestamp('last_movement_at', { withTimezone: true }),
}).existing();

export type AccountBalance = typeof accountBalances.$inferSelect;
