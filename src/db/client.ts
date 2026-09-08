import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env.js';
import * as schema from './schema/index.js';

/**
 * `prepare: false` es obligatorio contra el conector agrupado de Neon
 * (pgbouncer), que no soporta sentencias preparadas.
 *
 * `max: 5` (antes 10): en Vercel esta app corre sobre Fluid Compute, que
 * reutiliza el mismo proceso (y este mismo pool) entre pedidos concurrentes
 * en vez de crear un proceso por pedido como el serverless clasico. Aun asi,
 * cada instancia que Vercel levanta abre su propio pool contra el conector
 * de Neon (el host `-pooler`), y con uso personal no hace falta que cada una
 * reserve 10 conexiones. Si el uso real (Fase 3) pide mas, se sube con
 * datos en la mano, no de antemano.
 */
const client = postgres(env.DATABASE_URL, {
  max: 5,
  prepare: false,
  // Sin esto, una conexion que no puede completarse (host mal, red
  // bloqueada) se queda colgada con el timeout por defecto del sistema
  // operativo (decenas de segundos) en vez de fallar rapido y con un error
  // claro.
  connect_timeout: 10,
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
