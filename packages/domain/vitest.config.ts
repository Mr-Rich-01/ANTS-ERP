import { defineConfig, configDefaults } from 'vitest/config';

// `pnpm test` (unitário) — exclui a suite de integração que depende de PostgreSQL.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
});
