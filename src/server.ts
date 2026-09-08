/**
 * Arranque del servidor para desarrollo local (`npm run dev` / `npm start`).
 * Lo unico que hace es levantar lo que construye aplicacion.ts.
 *
 * En Vercel esto NO se usa: ahi la funcion real es `api/backend.ts`, que
 * arma la misma app pero sin abrir un puerto (ver ese archivo para el porque).
 */
import { construirApp } from './aplicacion.js';
import { closeDb } from './db/client.js';
import { env } from './env.js';

const app = await construirApp();

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    void (async () => {
      app.log.info('Apagando...');
      await app.close();
      await closeDb();
      process.exit(0);
    })();
  });
}

await app.listen({ port: env.PORT, host: '0.0.0.0' });
