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
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { categories } from './categories.js';
import { users } from './users.js';

/**
 * - `opening`  : saldo inicial de una cuenta. Uno solo por cuenta.
 * - `standard` : un ingreso o un gasto normal.
 * - `transfer` : una pata de un traslado entre dos cuentas propias.
 */
export const TRANSACTION_KINDS = ['opening', 'standard', 'transfer'] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

/**
 * El libro de movimientos. Es el nucleo del sistema y es INMUTABLE: una fila
 * jamas se edita ni se borra (hay un disparador en la base que lo impide). Si un
 * movimiento quedo mal, se registra otro que lo anula —con el monto opuesto— y,
 * si hace falta, uno nuevo con el dato correcto. El historial siempre cuenta lo
 * que de verdad paso.
 *
 * El monto lleva signo: negativo es plata que sale, positivo es plata que entra.
 * Asi el saldo de una cuenta es, literalmente, la suma de sus movimientos.
 */
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    accountId: uuid('account_id').notNull(),
    /** Nulo si esta sin clasificar o si es una pata de transferencia. */
    categoryId: uuid('category_id'),

    kind: text('kind').$type<TransactionKind>().notNull().default('standard'),

    /**
     * NUMERIC(19,4): nunca float. Drizzle lo entrega como texto justamente para
     * que nadie lo convierta a numero de coma flotante por accidente; la
     * aritmetica va en src/shared/money.ts.
     */
    amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
    /** Redundante con la cuenta a proposito: una fila cuenta la verdad completa
     *  sin necesidad de un join. La llave foranea compuesta impide que difieran. */
    currency: char('currency', { length: 3 }).notNull(),

    /** Cuando ocurrio de verdad (fecha del banco), no cuando se registro. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    description: text('description'),

    /** Las dos patas de una transferencia comparten este identificador. */
    transferGroupId: uuid('transfer_group_id'),
    /** Si esta fila anula a otra, aqui va el movimiento anulado. */
    reversesTransactionId: uuid('reverses_transaction_id'),

    /** No hay `updated_at`: estas filas no se actualizan nunca. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('transactions_tenant_unique').on(t.userId, t.id),

    // Misma cuenta, mismo dueno y misma moneda, garantizado por la base.
    foreignKey({
      columns: [t.userId, t.accountId, t.currency],
      foreignColumns: [accounts.userId, accounts.id, accounts.currency],
      name: 'transactions_account_fk',
    }).onDelete('restrict'),

    // Categoria del mismo dueno. Si `category_id` es nulo la llave no aplica.
    foreignKey({
      columns: [t.userId, t.categoryId],
      foreignColumns: [categories.userId, categories.id],
      name: 'transactions_category_fk',
    }).onDelete('restrict'),

    // El movimiento anulado tiene que ser del mismo dueno.
    foreignKey({
      columns: [t.userId, t.reversesTransactionId],
      foreignColumns: [t.userId, t.id],
      name: 'transactions_reversal_fk',
    }).onDelete('restrict'),

    // Un movimiento se puede anular una sola vez.
    unique('transactions_reversal_unique').on(t.reversesTransactionId),

    // Una sola apertura por cuenta.
    uniqueIndex('transactions_one_opening_per_account')
      .on(t.userId, t.accountId)
      .where(sql`kind = 'opening'`),

    // Consulta principal: los movimientos de una cuenta, del mas reciente al mas viejo.
    index('transactions_account_timeline_idx').on(
      t.userId,
      t.accountId,
      t.occurredAt.desc(),
      t.id.desc(),
    ),
    index('transactions_user_timeline_idx').on(t.userId, t.occurredAt.desc(), t.id.desc()),
    index('transactions_category_idx')
      .on(t.userId, t.categoryId)
      .where(sql`category_id is not null`),
    index('transactions_transfer_group_idx')
      .on(t.transferGroupId)
      .where(sql`transfer_group_id is not null`),

    check('transactions_amount_not_zero', sql`${t.amount} <> 0`),
    check('transactions_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('transactions_kind_valid', sql`${t.kind} in ('opening', 'standard', 'transfer')`),
    check(
      'transactions_description_not_blank',
      sql`${t.description} is null or length(btrim(${t.description})) > 0`,
    ),

    // Es transferencia si y solo si pertenece a un grupo de transferencia.
    check(
      'transactions_transfer_group_consistent',
      sql`(${t.kind} = 'transfer') = (${t.transferGroupId} is not null)`,
    ),
    // Mover plata entre cuentas propias no es ingreso ni gasto: no lleva categoria.
    check(
      'transactions_transfer_has_no_category',
      sql`${t.kind} <> 'transfer' or ${t.categoryId} is null`,
    ),
    // La apertura es un punto de partida: sin categoria y sin anular nada.
    check(
      'transactions_opening_is_bare',
      sql`${t.kind} <> 'opening' or (${t.categoryId} is null and ${t.reversesTransactionId} is null)`,
    ),
  ],
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
