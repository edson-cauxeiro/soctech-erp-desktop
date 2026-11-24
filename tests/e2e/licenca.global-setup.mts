/**
 * @file licenca.global-setup.mts
 * @description Instala a licença de desenvolvimento antes da suíte E2E.
 *
 * A navegação comercial e os handlers do Main são agora dependentes de licença.
 * Sem este setup cada ficheiro E2E dependeria da ordem de execução: o primeiro
 * que importasse a licença faria os restantes passarem, e uma base limpa faria
 * todos falharem. O globalSetup torna esse estado explícito e idempotente.
 *
 * O documento é assinado e não contém a chave privada. A importação usa o mesmo
 * IPC da aplicação, pelo que a assinatura é validada no Main exactamente como
 * aconteceria na interface de Licenciamento.
 */

import { _electron as electron } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const MAIN_BUILD = resolve(RAIZ, '../../out/main/index.js');
const LICENCA_TESTE = resolve(RAIZ, '../fixtures/licenca-teste.erplic');
const TIMEOUT = 60_000;

export default async function globalSetup(): Promise<void> {
  const app = await electron.launch({ args: [MAIN_BUILD] });

  try {
    const janela = await app.firstWindow();
    await janela.waitForLoadState('domcontentloaded');

    await janela.locator('#utilizador').waitFor({ timeout: TIMEOUT });
    await janela.locator('#utilizador').fill('admin');
    await janela.locator('#senha').fill('senha123');
    await janela.getByRole('button', { name: /entrar no sistema/i }).click();
    await janela.getByRole('link', { name: /inicio|início/i }).first().waitFor({ timeout: TIMEOUT });

    const conteudo = await readFile(LICENCA_TESTE, 'utf8');
    const resultado = await janela.evaluate(
      (texto) => (window as any).api.licensing.import(texto),
      conteudo,
    );

    if (!resultado?.success) {
      throw new Error(
        `Falha ao instalar a licença de teste: ${resultado?.error?.message ?? 'sem resposta do IPC'}`,
      );
    }
  } finally {
    await app.close();
  }
}
