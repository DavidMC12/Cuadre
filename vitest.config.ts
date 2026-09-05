import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Las pruebas de consistencia hablan con la base de datos real por internet.
    // Cinco segundos no alcanzan; treinta si, y siguen delatando algo colgado.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
