import { sql } from 'drizzle-orm';
import {
  char,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

/** Donde vive el dinero: cuentas de banco, tarjetas y efectivo. */
export const ACCOUNT_TYPES = ['bank', 'card', 'cash'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * Una cuenta NO guarda su saldo. El saldo se calcula sumando sus movimientos
 * (ver la vista `account_balances`). Por eso tampoco existe un "saldo inicial"
 * como columna: al crear una cuenta con dinero se registra un movimiento de
 * apertura, y asi el saldo sigue siendo siempre la suma del detalle.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    name: text('name').notNull(),
    type: text('type').$type<AccountType>().notNull(),
    /** Moneda ISO 4217 en mayusculas, p. ej. 'COP'. */
    currency: char('currency', { length: 3 }).notNull(),

    /** Las cuentas no se borran: se archivan, porque tienen historia colgando. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Destino de la llave foranea compuesta de `transactions`. Amarra tres cosas
    // a la vez: que el movimiento sea del mismo dueno, que apunte a una cuenta
    // existente, y que use exactamente la moneda de esa cuenta.
    unique('accounts_tenant_currency_unique').on(t.userId, t.id, t.currency),

    // Dos cuentas activas del mismo usuario no pueden llamarse igual.
    uniqueIndex('accounts_user_name_unique')
      .on(t.userId, t.name)
      .where(sql`${t.archivedAt} is null`),

    index('accounts_user_idx').on(t.userId),

    check('accounts_type_valid', sql`${t.type} in ('bank', 'card', 'cash')`),
    check('accounts_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('accounts_name_not_blank', sql`length(btrim(${t.name})) > 0`),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
