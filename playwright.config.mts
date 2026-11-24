/**
 * @file playwright.config.ts
 * @description Configuração dos testes E2E (SPRINT 5 e SPRINT 6, `TEST-14`).
 *
 * Os ficheiros E2E seguem o sufixo `.e2e.ts` em vez de `.test.ts` por uma
 * razão concreta: o `vitest.config.ts` recolhe tudo o que termine em
 * `.test.ts` sob `src/` e `tests/`. Sem o sufixo `.e2e`, o Vitest tentava
 * correr testes que precisam de uma janela do Electron aberta e não de um
 * servidor.
 *
 * Os testes correm contra o build em `out/main/index.js`. Não há `webServer`:
 * o Electron não expõe uma porta, e o `electron-vite preview` é um processo
 * com janelas, não um servidor HTTP. O build tem de existir, por isso
 * `npm run test:e2e` depende de `npm run build`.
 *
 * Nota sobre este ficheiro: o parser de TypeScript do Playwright fecha
 * comentários de bloco em qualquer asterisco seguido de barra, incluindo os
 * que aparecem dentro de globs. Por isso não há globs escritos neste
 * cabeçalho — escrevê-los parte o ficheiro em dois.
 */

import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A config é carregada como módulo ES, onde `__dirname` não existe. Sem isto
// o Playwright falha ao ler a sua própria configuração.
const RAIZ = dirname(fileURLToPath(import.meta.url));
const MAIN_BUILD = resolve(RAIZ, 'out/main/index.js');

/**
 * Falhar cedo e com uma mensagem útil é melhor do que o Playwright abrir
 * uma janela e cada teste morre com `ENOENT out/main/index.js`.
 */
if (!existsSync(MAIN_BUILD) && !process.env.CI) {
  console.warn(
    [
      '',
      '  playwright: não encontrei out/main/index.js.',
      '  Os testes E2E correm contra o build — executa `npm run build` antes de `npm run test:e2e`.',
      '',
    ].join('\n'),
  );
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.mts',

  // Um teste E2E que falha deixa a janela do Electron aberta e o processo
  // pendurado. `fullyParallel` com workers limitados mantém o consumo abaixo
  // do que a máquina aguenta sem tornar a suite lenta.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  // A trilha de uma falha de UI é o que permite diagnosticá-la. Um trace só
  // de quando o teste passa é ruído.
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // A aplicação é uma app de desktop: o viewport tem de reflectir o
    // tamanho de uma janela, não o de um browser.
    viewport: { width: 1440, height: 900 },
  },

  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  timeout: 60_000,
  expect: { timeout: 10_000 },
});