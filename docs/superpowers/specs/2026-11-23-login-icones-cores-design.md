# Especificação: ajuste visual na tela de login (ícones e cores)

Data: 2026-11-23

## 1. Objetivo

Ajustar dois aspetos visuais da tela pública de login, sem alterar o fluxo de autenticação:

1. Aumentar ligeiramente os ícones dos 7 cartões de módulos do painel informativo.
2. Suavizar/clarear os fundos azuis dos dois painéis da tela.

## 2. Escopo

### Arquivos afetados

- `src/renderer/src/pages/login.tsx` — tamanho dos ícones e classes/escopo das variáveis locais.
- `src/renderer/src/styles.css` — bloco CSS escopado à tela de login com os novos valores de fundo.

### Fora de escopo

- `useAuth`, API de autenticação, validação Zod, toasts, navegação, rotas e `App.tsx`.
- Tokens globais em `:root` e `.dark` (usados por todo o ERP).
- Layout, responsividade, textos e conteúdo dos módulos.
- Instalação/rebuild não faz parte da especificação; é etapa de verificação.

## 3. Decisões aprovadas

- Ícones Lucide dos módulos: `h-4 w-4` (16 px) → `h-5 w-5` (20 px).
- Painel esquerdo: sobrescrever localmente `--primary-deep` de
  `oklch(0.24 0.14 268)` para `oklch(0.34 0.13 268)`.
- Painel direito (`.dark`): sobrescrever localmente `--background` de
  `oklch(0.129 0.042 264.695)` para `oklch(0.19 0.05 264)`.
- Os novos valores devem ser aplicados apenas dentro da tela de login, através de
  classes de escopo, sem alterar os tokens globais.

## 4. Abordagem

Adicionar um bloco CSS escopado em `styles.css` com duas classes:

- `.login-page` — define `--primary-deep` com o novo valor; aplicada no `<main>` da tela.
- `.login-auth.dark` — define `--background` com o novo valor; aplicada no `<section>` do formulário.
  A combinação de classes garante especificidade superior à regra global `.dark`.

Como `@theme inline` já mapeia `--color-primary-deep: var(--primary-deep)` e
`--color-background: var(--background)`, as utilidades Tailwind existentes
(`bg-primary-deep`, `bg-background`) passam a usar os valores locais sem novas classes de cor.

Em `login.tsx`:

- `<main>` recebe a classe `login-page`.
- O `<section>` esquerdo mantém `bg-primary-deep`.
- O `<section>` direito recebe `login-auth` além de `dark`.
- O ícone de cada cartão passa de `h-4 w-4` para `h-5 w-5`.

## 5. Compatibilidade e riscos

- O contraste dos cartões (`bg-white/[0.04]` com texto branco) continua adequado com o azul mais claro.
- Inputs usam `bg-white/5` e bordas `white/10`; não dependem de `--background`.
- Nenhuma outra página consome `.login-page` ou `.login-auth`, logo o tema global permanece inalterado.
- O layout com breakpoint `lg` (correção anterior) não é alterado.

## 6. Verificação

1. `npm run typecheck:web`
2. `npm run build:win`
3. Reinstalar o build gerado e abrir a aplicação.
4. Confirmar, via DOM/CDP, que:
   - os 7 ícones têm 20 px;
   - as cores de fundo calculadas dos dois painéis correspondem aos novos valores;
   - o painel esquerdo continua visível a 1266 px de largura útil;
   - não há overflow vertical.
