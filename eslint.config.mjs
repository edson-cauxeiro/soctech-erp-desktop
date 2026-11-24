import { defineConfig, globalIgnores } from 'eslint/config';
import pluginTs from '@electron-toolkit/eslint-config-ts';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import pluginReactRefresh from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier/flat';

// Configuração flat do ESLint 9.
//
// O `npm run lint` já estava declarado no `package.json`, mas não existia
// ficheiro de configuração em lado nenhum do histórico do repositório: a
// comando falhava antes de analisar o primeiro ficheiro. Todos os plugins
// necessários já estavam instalados — faltava apenas este ficheiro. Nenhuma
// dependência foi acrescentada.
//
// Primeira execução: 2107 problemas, praticamente todos herdados de código que
// nunca foi lintado. Em vez de reescrever ~2000 linhas alheias a este trabalho,
// o gate fica montado para apanhar o que é DE FACTO um defeito, e as regras que
// o projecto historicamente não cumpre ficam desligadas com um motivo. Estão
// listadas em `docs/warehouse/00-current-state.md` §5.11 para as poder
// reintroduzir à medida que o código é tocado.

export default defineConfig([
  globalIgnores([
    '**/out/**',
    '**/dist/**',
    '**/build/**',
    '**/node_modules/**',
    // SQL das migrations: versionado pelo Prisma, não é código TypeScript.
    'prisma/migrations/**',
    'prisma/verificar_stock.sql',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      ...pluginTs.configs.recommended,
      ...pluginTs.configs.recommendedTypeChecked,
      // `configs.flat.*`, não `configs['recommended-latest']`: a variante sem
      // `flat` ainda está em formato eslintrc (`plugins` como array de strings)
      // e o ESLint 9 rejeita-a em flat config.
      pluginReactHooks.configs.flat['recommended-latest'],
      pluginReactRefresh.configs.vite,
    ],
    languageOptions: {
      parserOptions: {
        projectService: {
          // O limite de ficheiros no projecto "default" (fora de um
          // tsconfig) dispara erro quando há mais de 8 ficheiros — o playright
          // e o seed juntos já o ultrapassam e a suite de E2E só cresce. Todos
          // estes ficheiros são entradas deliberadas de `allowDefaultProject`.
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 32,
          // `tsconfig.node.json` e `tsconfig.web.json` só cobrem `src/main`,
          // `src/preload`, `src/renderer` e o config do electron-vite. Os
          // ficheiros abaixo são compilados pelas ferramentas (Vitest, Prisma,
          // Playwright) e não pertencem a nenhum dos dois projectos, daí
          // `allowDefaultProject` em vez de os ignorar — continuam a ser
          // lintados.
          //
          // `electron.vite.config.ts` NÃO entra aqui: já está no
          // `tsconfig.node.json`, e incluí-lo nos dois dá "found in the project
          // service" ao mesmo tempo.
          allowDefaultProject: [
            'prisma/seed.ts',
            'prisma.config.ts',
            'vitest.config.ts',
            'playwright.config.ts',
            'tests/e2e/*.e2e.ts',
            'tests/unit/*.test.ts',
            'src/test/rh/calculo/*.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── Regras que valem a pena como erro ────────────────────────────────
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/await-thenable': 'error',

      // ── Ratchet: regras de correcção real, com dívida pré-existente ──────
      // 102 `no-floating-promises` + 96 `no-misused-promises`, distribuídos por
      // 45 ficheiros e sobretudo por handlers de evento em componentes React
      // grandes (FaturaManager, ComprasManager, SessaoCaixaManager…). São
      // smells genuínos — sobretudo as promesas não tratadas em handlers, que
      // podem falhar sem aviso — mas corrigi-los é mexer em ecrãs financeiros
      // que nada têm a ver com este trabalho, com risco de os partir sem
      // forma de os testar a sério. Ficam como aviso, e não como `off`: o
      // objectivo é descer o passivo a cada ficheiro que seja tocado.
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      // As 4 ocorrências são conversões `String(unknown)` deliberadas, em código
      // que formata valores para CSV, para PDF e para chaves de agrupamento em
      // auditoria (`relatorios.controller.ts:276`, `relatorio-pdf.service.ts:85`
      // e `:87`, `audit.service.ts:459`). Assumir `String()` de propósito é o
      // comportamento desejado num fallback; a regra existe para apanhar o
      // `String()` esqueroso de um valor cujo tipo se conhece. Decidir o que um
      // objecto deve renderizar num relatório é uma decisão de produto, não de
      // lint, e mudá-la alteraria a saída de relatórios e ficheiros SAFT.
      '@typescript-eslint/no-base-to-string': 'warn',

      // ── Regras desligadas: o projecto não as cumpre, por desenho antigo ──
      // As `no-unsafe-*` somam ~1200 avisos e derivam do facto de o cliente
      // Prisma devolver tipos que estas regras não conseguem estreitar. Não são
      // accionáveis e tornariam o gate inútil por ruído.
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // 138 ocorrências de `any`. Toleradas nos services que falam com o Prisma;
      // vale a pena reduzi-las, mas não bloqueia o merge.
      '@typescript-eslint/no-explicit-any': 'off',
      // 360 ocorrências. Puramente estilístico, e a convenção real do projecto é
      // a oposta (inferir).
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Cosmético e corrigível com `--fix`; deixado como aviso para não impôr
      // mudanças de import em massa.
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/require-await': 'off',
      'react-refresh/only-export-components': 'warn',
      // `set-state-in-effect` e `incompatible-library` são regras novas do
      // eslint-plugin-react-hooks v7; sinalizam smells reais mas exigiriam
      // refactorizar componentes fora do âmbito. Aviso, não erro.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/incompatible-library': 'warn',
      // Regras do compilador React (v5+). Apontam para correcções reais — uma
      // função impura chamada durante o render pode devolver valores diferentes
      // entre renders — mas a correcção passa por mover lógica ou por
      // introduzir memoização manual, o que muda o comportamento de
      // componentes. Sem forma de correr o Electron para verificar ecrã a ecrã,
      // ficam como aviso:
      //   ComprasManager.tsx:88, FaturaManager.tsx:101, sidebar.tsx:643  (purity)
      //   relatorios.tsx:187  (preserve-manual-memoization)
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    // O `prettier` trata de formatação (as 358 regras aqui desligadas evitam
    // que `eslint` e `npm run format` discordem entre si). Já vinha no
    // `node_modules` como dependência transitiva do `eslint-config-prettier`.
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    ...prettierConfig,
  },
]);
