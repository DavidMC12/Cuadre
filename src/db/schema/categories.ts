import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

/** Una categoria clasifica plata que entra o plata que sale, nunca las dos. */
export const CATEGORY_KINDS = ['income', 'expense'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/**
 * Catalogo de categorias de cada usuario. Admite un nivel de subcategorias
 * ("Mercado" dentro de "Comida") mediante `parentId`.
 */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    name: text('name').notNull(),
    kind: text('kind').$type<CategoryKind>().notNull(),
    parentId: uuid('parent_id'),

    /** Igual que las cuentas: no se borran, se archivan. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Destino de la llave foranea compuesta de `transactions`.
    unique('categories_tenant_unique').on(t.userId, t.id),

    // La categoria padre tiene que ser del mismo usuario: al incluir `user_id`
    // en la llave foranea, la base impide colgar una categoria de la de otro.
    foreignKey({
      columns: [t.userId, t.parentId],
      foreignColumns: [t.userId, t.id],
      name: 'categories_parent_fk',
    }).onDelete('restrict'),

    uniqueIndex('categories_user_kind_name_unique')
      .on(t.userId, t.kind, t.name)
      .where(sql`${t.archivedAt} is null`),

    index('categories_user_idx').on(t.userId),

    check('categories_kind_valid', sql`${t.kind} in ('income', 'expense')`),
    check('categories_name_not_blank', sql`length(btrim(${t.name})) > 0`),
    check('categories_no_self_parent', sql`${t.parentId} is distinct from ${t.id}`),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
