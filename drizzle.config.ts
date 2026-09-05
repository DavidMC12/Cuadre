import { defineConfig } from 'drizzle-kit';

// Ojo: aqui se lee process.env directamente y no el modulo src/env.ts, para que
// `db:generate` funcione sin necesidad de tener una base de datos configurada.
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  // Solo administramos nuestro esquema. Si activas Neon Auth, sus tablas viven
  // en el esquema `neon_auth` y las migraciones nunca las van a tocar.
  schemaFilter: ['public'],
  strict: true,
  verbose: true,
});
