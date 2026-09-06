/** Arranque del servidor. Lo unico que hace es levantar lo que construye app.ts. */
import { construirApp } from './app.js';
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
