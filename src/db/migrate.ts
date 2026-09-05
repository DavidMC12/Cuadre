import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../env.js';

// Una sola conexion y sin sentencias preparadas: las migraciones corren en serie.
const client = postgres(env.DATABASE_URL, { max: 1, prepare: false });

console.log('Aplicando migraciones...');
await migrate(drizzle(client), { migrationsFolder: './drizzle' });
console.log('Listo. La base quedo al dia.');

await client.end();
