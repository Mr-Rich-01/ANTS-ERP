import { defineConfig } from 'vitest/config';

// Suite de INTEGRAÇÃO (depende de PostgreSQL). Corrida explícita por
// `pnpm test:integration:accounting`. Fora do `pnpm test` unitário.
export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
