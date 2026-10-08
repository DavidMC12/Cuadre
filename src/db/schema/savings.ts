import { sql } from 'drizzle-orm';
import {
  char,
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { users } from './users.js';

/**
 * Ahorro que la persona anota a mano: "aparté $500.000 para ahorro" sin mover
 * plata de una cuenta a otra. El saldo de una cuenta y lo ahorrado son cosas
 * distintas: que una cuenta esté marcada como de ahorro, o que le llegue un
 * ingreso, no lo convierte en ahorro. Cuenta como ahorro solo lo que la
 * persona decide: una transferencia hacia/desde una cuenta de ahorro, o una
 * fila de aquí.
 *
 * NO es un movimiento: no cambia ningún saldo (el saldo sigue siendo la suma
 * de `transactions`). Por eso vive en su propia tabla. Igual que los
 * movimientos, es inmutable: lo que quedó mal se corrige con otra fila de
 * signo contrario ("retiré del ahorro"), nunca con un UPDATE.
 */
export const savingsEntries = pgTable(
  'savings_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    accountId: uuid('account_id').notNull(),
    /** Igual que en `transactions`: la llave foránea compuesta la amarra a la cuenta. */
    currency: char('currency', { length: 3 }).notNull(),

    /** Con signo: positivo = apartaste para ahorro, negativo = lo retiraste. */
    amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
    /** Cuándo ocurrió de verdad, no cuándo se anotó. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    description: text('description'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Misma cuenta, mismo dueño y misma moneda, garantizado por la base.
    foreignKey({
      columns: [t.userId, t.accountId, t.currency],
      foreignColumns: [accounts.userId, accounts.id, accounts.currency],
      name: 'savings_entries_account_fk',
    }).onDelete('restrict'),

    index('savings_entries_account_idx').on(t.userId, t.accountId, t.occurredAt.desc()),

    check('savings_entries_amount_not_zero', sql`${t.amount} <> 0`),
    check('savings_entries_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      'savings_entries_description_not_blank',
      sql`${t.description} is null or length(btrim(${t.description})) > 0`,
    ),
  ],
);

export type SavingsEntry = typeof savingsEntries.$inferSelect;
export type NewSavingsEntry = typeof savingsEntries.$inferInsert;
