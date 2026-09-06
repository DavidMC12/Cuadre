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

/**
 * Quien ejecuta una consulta: la conexion normal o una transaccion abierta.
 * Los repositorios lo reciben para poder participar en una transaccion mas
 * grande sin saber nada de quien la abrio.
 */
export type Ejecutor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
