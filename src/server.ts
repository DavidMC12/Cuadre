/** Arranque del servidor. Lo unico que hace es levantar lo que construye aplicacion.ts. */
// Vercel reconoce un proyecto de Fastify buscando, en este mismo archivo, un
// import del paquete 'fastify'. La app de verdad se arma en aplicacion.ts
// (separado para poder probarla con app.inject()), asi que este import no
// se usa aca mas que para que el detector lo reconozca.
import 'fastify';
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
