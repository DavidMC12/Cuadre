import { sql } from 'drizzle-orm';
import {
  boolean,
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

    /**
     * Puramente descriptivo: para que el Resumen sepa cuánto tienes ahorrado.
     * No cambia ninguna regla de negocio (una cuenta de ahorro se comporta
     * exactamente igual que cualquier otra) y no tiene nada que ver con
     * `type` — `type` dice dónde vive la plata (banco, tarjeta, efectivo),
     * esto dice para qué la usa la persona. No hay metas ni avisos colgando
     * de este campo, a propósito.
     */
    isSavings: boolean('is_savings').notNull().default(false),

    /** Solo para tarjetas. Cuánto usó y cuánto le queda se calculan al vuelo
     *  (cupo + saldo, ya que el saldo de una tarjeta es negativo cuando debe),
     *  nunca se guardan aparte: guardarlos sería la misma plata contada dos
     *  veces, con el riesgo de que un día dejen de coincidir. */
    creditLimit: numeric('credit_limit', { precision: 19, scale: 4 }),

    /**
     * Solo para tarjetas: de qué cuenta sale la plata cuando se paga esta
     * tarjeta. Puramente una comodidad para precargar el formulario de
     * transferencia — no cambia ninguna regla de negocio, y pagar desde
     * cualquier otra cuenta sigue siendo una transferencia normal.
     */
    linkedAccountId: uuid('linked_account_id'),

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

    // La cuenta vinculada, si hay, tiene que ser del mismo usuario y de la
    // misma moneda — mismo truco que ya usa `budget_items_account_fk`.
    //
    // `restrict`, no `set null`: un `ON DELETE SET NULL` sin lista de columnas
    // pone en null LAS TRES columnas de la llave (`user_id`, `linked_account_id`
    // y `currency`), y las dos primeras son NOT NULL — la acción solo podría
    // fallar, nunca limpiar el vínculo. Las cuentas tampoco se borran de
    // verdad (se archivan), así que en la práctica esto nunca se dispara; que
    // sea `restrict` es simplemente decir la verdad sobre lo que pasaría.
    foreignKey({
      columns: [t.userId, t.linkedAccountId, t.currency],
      foreignColumns: [t.userId, t.id, t.currency],
      name: 'accounts_linked_account_fk',
    }).onDelete('restrict'),

    check('accounts_type_valid', sql`${t.type} in ('bank', 'card', 'cash')`),
    check('accounts_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('accounts_name_not_blank', sql`length(btrim(${t.name})) > 0`),

    // "Ahorro" es plata que se aparta; una deuda no se aparta, se paga. No
    // tiene sentido marcar una tarjeta como cuenta de ahorro.
    check('accounts_savings_not_for_card', sql`${t.type} <> 'card' or not ${t.isSavings}`),

    check(
      'accounts_credit_limit_only_for_card',
      sql`${t.type} = 'card' or ${t.creditLimit} is null`,
    ),
    check('accounts_credit_limit_positive', sql`${t.creditLimit} is null or ${t.creditLimit} > 0`),

    // Solo restringe el tipo de quien vincula, no el de la vinculada: pagar
    // una tarjeta desde otra tarjeta no se prohíbe a propósito (hay quien
    // traspasa saldo entre tarjetas), aunque el caso normal sea un banco.
    check(
      'accounts_linked_account_only_for_card',
      sql`${t.type} = 'card' or ${t.linkedAccountId} is null`,
    ),
    check('accounts_linked_account_not_self', sql`${t.linkedAccountId} is distinct from ${t.id}`),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
