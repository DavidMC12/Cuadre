import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Cada vez que un administrador entra a ver la app como otra persona, queda
 * una fila aquí.
 *
 * Por que existe: mirar los movimientos de alguien es mirar su vida --cuanto
 * gana, donde come, si debe plata--. Que eso sea posible es una decision
 * legitima para poder dar soporte, pero tiene que dejar rastro: sin registro
 * no hay forma de responderle a quien pregunte quien vio sus cuentas, y la ley
 * de datos personales lo exige cuando hay usuarios de verdad.
 *
 * El correo y el identificador externo se guardan COPIADOS, no como llave
 * foranea: un registro de auditoria tiene que poder leerse aunque la persona
 * suplantada ya no exista. Si apuntara a otra tabla, borrar a alguien borraria
 * la prueba de que se entro a su cuenta, que es justo al reves de lo que se
 * busca.
 *
 * El codigo solo inserta y consulta; nunca actualiza ni borra.
 */
export const adminImpersonations = pgTable(
  'admin_impersonations',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Quien miro. Este si es de la casa, asi que va con llave foranea. */
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** A quien miro, segun el proveedor de identidad. */
    targetAuthSubject: text('target_auth_subject').notNull(),
    /** Copiado a proposito, para que el registro se lea sin cruzar tablas. */
    targetEmail: text('target_email').notNull(),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('admin_impersonations_timeline_idx').on(t.startedAt.desc()),
    index('admin_impersonations_admin_idx').on(t.adminUserId, t.startedAt.desc()),

    check('admin_impersonations_subject_not_blank', sql`length(btrim(${t.targetAuthSubject})) > 0`),
    check('admin_impersonations_email_not_blank', sql`length(btrim(${t.targetEmail})) > 0`),
  ],
);

export type AdminImpersonation = typeof adminImpersonations.$inferSelect;
