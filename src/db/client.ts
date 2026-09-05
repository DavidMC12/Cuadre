import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env.js';
import * as schema from './schema/index.js';

/**
 * `prepare: false` es obligatorio contra el conector agrupado de Neon
 * (pgbouncer), que no soporta sentencias preparadas.
 */
const client = postgres(env.DATABASE_URL, {
  max: 10,
  prepare: false,
});

export const db = drizzle(client, { schema, casing: 'snake_case' });
export type Db = typeof db;

/** Cierra el pool. Solo para pruebas y para apagar el proceso con orden. */
export async function closeDb(): Promise<void> {
  await client.end();
}
