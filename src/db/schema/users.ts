import { sql } from 'drizzle-orm';
import {
  char,
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Pantallas con las que puede abrir la app. Son las del menu de abajo. */
export const START_PAGES = ['resumen', 'cuentas', 'movimientos'] as const;
export type StartPage = (typeof START_PAGES)[number];

/**
 * Duenos de los datos. Cada fila del nucleo cuelga de un usuario via `user_id`:
 * el esquema es multi-tenant desde el primer dia, aunque hoy solo haya uno.
 *
 * La autenticacion no se construye aqui (Neon Auth / Auth.js). Esta tabla solo
 * guarda a que identidad externa corresponde cada usuario, para poder cambiar de
 * proveedor sin tocar el resto del esquema.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Siempre en minusculas: lo garantiza la restriccion `users_email_lowercase`. */
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),

    /** Proveedor de identidad, p. ej. 'neon-auth'. Nulo hasta que se vincule (Fase 1). */
    authProvider: text('auth_provider'),
    /** Identificador del usuario dentro de ese proveedor. */
    authSubject: text('auth_subject'),

    /**
     * Moneda que se propone al registrar un movimiento. Nula a proposito: quien
     * no ha elegido ninguna no tiene una preferencia equivocada, tiene una sin
     * responder, y la app la deduce de las cuentas que ya existen.
     */
    defaultCurrency: char('default_currency', { length: 3 }),

    /** Pantalla que se abre al entrar a la app. */
    startPage: text('start_page').$type<StartPage>().notNull().default('resumen'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('users_email_unique').on(t.email),

    // Una identidad externa pertenece como maximo a un usuario.
    uniqueIndex('users_auth_identity_unique')
      .on(t.authProvider, t.authSubject)
      .where(sql`${t.authSubject} is not null`),

    // Normalizamos el correo en la base, no solo por convencion en el codigo.
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check(
      'users_email_shape',
      sql`${t.email} ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'`,
    ),
    check('users_display_name_not_blank', sql`length(btrim(${t.displayName})) > 0`),
    // O ambos campos de identidad, o ninguno.
    check(
      'users_auth_identity_complete',
      sql`(${t.authProvider} is null) = (${t.authSubject} is null)`,
    ),

    // Mismo formato que exigen las cuentas y los movimientos.
    check(
      'users_default_currency_format',
      sql`${t.defaultCurrency} is null or ${t.defaultCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check('users_start_page_valid', sql`${t.startPage} in ('resumen', 'cuentas', 'movimientos')`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
