/**
 * El puente hacia Neon Auth, probado sin el atajo de las pruebas
 * (`resolverUsuario`) que usa el resto de la suite. Aquí se verifica
 * exactamente lo que ve alguien que llega sin haber iniciado sesión.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { construirApp } from './aplicacion.js';
import { closeDb } from './db/client.js';

let app: FastifyInstance;

afterAll(async () => {
  await app?.close();
  await closeDb();
});

describe('sin sesión', () => {
  it('/api/salud responde sin pedir sesión', async () => {
    app = await construirApp({ silencioso: true });
    await app.ready();

    const respuesta = await app.inject({ method: 'GET', url: '/api/salud' });
    expect(respuesta.statusCode).toBe(200);
  });

  it('la API rechaza una petición sin cookie de sesión', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/v1/accounts' });

    expect(respuesta.statusCode).toBe(401);
    const cuerpo = respuesta.json();
    expect(cuerpo.error.code).toBe('UNAUTHORIZED');
    // El mensaje nunca dice el motivo (expiró, no existe, etc.): eso le daría
    // pistas a quien intenta adivinar una sesión ajena.
    expect(cuerpo.error).not.toHaveProperty('details');
  });

  it('una cookie que no es de Neon Auth tampoco cuela', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/v1/accounts',
      headers: { cookie: 'session_token=cualquier-cosa-inventada' },
    });

    expect(respuesta.statusCode).toBe(401);
  });
});
