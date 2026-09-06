import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',

    // Crea una copia desechable de la base antes de la tanda y la borra despues.
    globalSetup: ['./vitest.global-setup.ts'],

    // Procesos, no hilos: asi heredan el DATABASE_URL que fija globalSetup.
    pool: 'forks',

    // Las pruebas hablan con una base de datos real por internet. Cinco
    // segundos no alcanzan; treinta si, y siguen delatando algo colgado.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
