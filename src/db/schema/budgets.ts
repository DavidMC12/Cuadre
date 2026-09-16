import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { categories } from './categories.js';
import { users } from './users.js';

/**
 * - `category`: cuánto se espera mover este mes en una categoría (comida,
 *   arriendo, servicios). Sirve tanto para un tope de gasto como para un
 *   recordatorio de pago: las dos cosas son "espero ver esto en la
 *   categoría este mes".
 * - `savings`: cuánto se espera aportarle este mes a una cuenta ya marcada
 *   como de ahorro (`accounts.is_savings`).
 */
export const BUDGET_ITEM_KINDS = ['category', 'savings'] as const;
export type BudgetItemKind = (typeof BUDGET_ITEM_KINDS)[number];

/**
 * Un ítem del checklist de presupuesto. El monto NO vive aquí: vive
 * versionado por mes en `budget_item_targets`, para poder cambiarlo sin
 * reescribir cómo se vio un mes que ya pasó (ver ese archivo).
 */
export const budgetItems = pgTable(
  'budget_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    kind: text('kind').$type<BudgetItemKind>().notNull(),
    /** Moneda ISO 4217: nunca se suman monedas distintas (regla de reportes). */
    currency: char('currency', { length: 3 }).notNull(),

    /** Solo cuando `kind = 'category'`. */
    categoryId: uuid('category_id'),
    /** Solo cuando `kind = 'savings'`. */
    accountId: uuid('account_id'),

    /** Si es nulo, la pantalla usa el nombre de la categoría o la cuenta. */
    label: text('label'),

    /** Igual que cuentas y categorías: no se borra, se archiva. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // La categoría, si hay, tiene que ser de este mismo usuario.
    foreignKey({
      columns: [t.userId, t.categoryId],
      foreignColumns: [categories.userId, categories.id],
      name: 'budget_items_category_fk',
    }).onDelete('restrict'),

    // La cuenta, si hay, también — y de paso, gratis, que su moneda sea
    // realmente la de la cuenta: `accounts` no tiene una llave única de solo
    // (userId, id), la de tres columnas (con `currency`) es la que existe.
    foreignKey({
      columns: [t.userId, t.accountId, t.currency],
      foreignColumns: [accounts.userId, accounts.id, accounts.currency],
      name: 'budget_items_account_fk',
    }).onDelete('restrict'),

    index('budget_items_user_idx').on(t.userId),

    check('budget_items_kind_valid', sql`${t.kind} in ('category', 'savings')`),
    check('budget_items_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('budget_items_label_not_blank', sql`${t.label} is null or length(btrim(${t.label})) > 0`),
    // Cada ítem apunta a exactamente una cosa, y a la que le toca según su tipo.
    check(
      'budget_items_target_matches_kind',
      sql`(${t.kind} = 'category' and ${t.categoryId} is not null and ${t.accountId} is null)
       or (${t.kind} = 'savings'  and ${t.accountId}  is not null and ${t.categoryId} is null)`,
    ),
  ],
);

/**
 * El monto de un ítem, con el mes desde el que aplica. Estas filas nunca se
 * actualizan ni se borran —igual que los movimientos—: cambiar cuánto
 * esperas gastar en comida agrega una fila nueva, nunca pisa la anterior.
 * Así, el checklist de un mes que ya pasó sigue mostrando el monto que tenía
 * entonces, sin importar cuántas veces se haya ajustado después.
 *
 * Para saber qué monto aplica a un mes dado: entre las filas con
 * `effective_from` menor o igual a ese mes, la de `effective_from` más
 * grande y, si hay empate (el mismo mes se ajustó más de una vez antes de
 * que terminara), la más reciente por `created_at`.
 */
export const budgetItemTargets = pgTable(
  'budget_item_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetItemId: uuid('budget_item_id')
      .notNull()
      .references(() => budgetItems.id, { onDelete: 'cascade' }),

    /** Primer día del mes desde el que aplica este monto, ej. 2026-09-01. */
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('budget_item_targets_item_idx').on(t.budgetItemId, t.effectiveFrom.desc()),

    check('budget_item_targets_amount_positive', sql`${t.amount} > 0`),
    check(
      'budget_item_targets_effective_from_is_month_start',
      sql`extract(day from ${t.effectiveFrom}) = 1`,
    ),
  ],
);

export type BudgetItem = typeof budgetItems.$inferSelect;
export type NewBudgetItem = typeof budgetItems.$inferInsert;
export type BudgetItemTarget = typeof budgetItemTargets.$inferSelect;
export type NewBudgetItemTarget = typeof budgetItemTargets.$inferInsert;
