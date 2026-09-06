/**
 * Construcción de la aplicación, separada del arranque del servidor.
 *
 * Las pruebas usan `construirApp()` y le mandan peticiones con
 * `app.inject()`, sin abrir ningún puerto ni depender de la red.
 */
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from './env.js';
import { registrarManejoDeErrores } from './http/errores.js';
import { usuarioActual } from './http/usuario-actual.js';
import { rutasDeCuentas } from './modules/accounts/routes.js';
import { rutasDeCategorias } from './modules/categories/routes.js';
import { rutasDeMovimientos } from './modules/transactions/routes.js';
import { configurarMensajesEnEspanol } from './shared/mensajes-zod.js';

export interface OpcionesDeApp {
  /** Silencia el registro de actividad; las pruebas lo agradecen. */
  silencioso?: boolean;
  /** De donde sale el usuario de la peticion. Solo lo usan las pruebas. */
  resolverUsuario?: () => Promise<string>;
}

export async function construirApp(opciones: OpcionesDeApp = {}): Promise<FastifyInstance> {
  // Antes de cualquier validacion: los errores de Zod salen en espanol.
  configurarMensajesEnEspanol();

  const app = Fastify({
    logger: opciones.silencioso
      ? false
      : {
          level: env.NODE_ENV === 'production' ? 'info' : 'debug',
          // El cuerpo de las peticiones NO se registra: lleva montos.
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  // Zod valida lo que entra y da forma a lo que sale.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registrarManejoDeErrores(app);

  // Lista blanca, nunca `*`.
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  await app.register(usuarioActual, { resolver: opciones.resolverUsuario });

  app.get('/salud', { logLevel: 'warn' }, async () => ({
    estado: 'vivo',
    entorno: env.NODE_ENV,
  }));

  // La API va versionada desde el primer endpoint.
  await app.register(
    async (api) => {
      await api.register(rutasDeCuentas);
      await api.register(rutasDeCategorias);
      await api.register(rutasDeMovimientos);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
