import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    // Os testes E2E do Playwright seguem o sufixo `.e2e.ts`; se o Vitest os
    // apanhasse, tentaria correr testes que precisam de uma janela do
    // Electron aberta e nenhum servidor HTTP.
    exclude: ['**/node_modules/**', 'tests/e2e/**'],
    alias: {
      '@': resolve(__dirname, './src/renderer/src'),
      '@renderer': resolve(__dirname, './src/renderer/src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'out/', 'build/', 'dist/'],
    },
  },
});
