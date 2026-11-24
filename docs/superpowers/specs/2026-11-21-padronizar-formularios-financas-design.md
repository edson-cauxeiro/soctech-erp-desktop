# Padronizar formulários de Finanças — Design

**Data:** 2026-11-21

## Objectivo

Todos os formulários de dados do módulo de Finanças devem ter o mesmo tamanho e comportamento do formulário “Novo lançamento contabilístico”: largura e altura iguais, cabeçalho e rodapé fixos, scroll apenas no corpo.

## Decisões aprovadas

- Normalizar **largura e altura**, não apenas a largura.
- Normalizar apenas **formulários de dados**; diálogos de acção/detalhe mantêm-se inalterados.
- Cabeçalho e rodapé fixos, com scroll interno no corpo.
- Usar um **componente partilhado** como única fonte de verdade.
- Aplicar o padrão também aos dois formulários inline (Plano de contas e Estrutura de demonstrações).

## Dimensões de referência

`max-w-6xl w-[95vw] h-[90dvh] max-h-[90dvh]`, `flex flex-col overflow-hidden`.

## Arquitetura

- Criar `src/renderer/src/components/erp/FormDialog.tsx` com:
  - `FormSurface({ title, description?, headerActions?, footer?, bodyClassName?, className?, children })`.
  - `FormDialog({ open, onOpenChange, ...FormSurfaceProps })`.
  - `DialogContent` centralizado com as dimensões acima.
- `FormSurface`:
  - cabeçalho `shrink-0` com borda inferior e `pr-10` para não colidir com o botão de fechar;
  - corpo `flex-1 min-h-0`;
  - quando `footer` existe, corpo ganha `overflow-y-auto px-6 py-4` e rodapé fica `shrink-0 border-t bg-muted/20`.
- `FormDialog` usa `Dialog`, `DialogContent` e `FormSurface`. O surface usa `<h2>`/`<p>` simples (sem contexto Radix, para também poder ser usado inline) e liga-os ao diálogo por `aria-labelledby`/`aria-describedby`. `FormDialog` passa `border-0 bg-transparent` ao surface para não duplicar a borda do `DialogContent`.
- `FormShell` ganha prop opt-in `dialogLayout?: boolean`:
  - `<form>` passa a `h-full min-h-0 flex flex-col`;
  - corpo passa a `flex-1 min-h-0 overflow-y-auto`;
  - rodapé perde `rounded-b-md`/`mt-auto` e fica `shrink-0`;
  - `compact`, `flush`, labels e botões mantêm-se.

## Âmbito

### Migrar

1. `LancamentoContabilEditor` (referência).
2. `ContasBancariasManager` / `ContaForm`.
3. `LancamentosManager` / `MovimentoForm` — apenas “Novo lançamento manual”.
4. `DiarioContabilManager`.
5. `PlanoContasManager` — inline.
6. `RegraContabilizacaoManager`.
7. `MapeamentoContaManager`.
8. `DemonstracoesManager` / `EditorEstrutura` — inline; botões Voltar/Guardar passam para o rodapé fixo.

`IntegracaoContabilManager` não tem formulário de dados: o único diálogo é “Detalhe do erro”, que se mantém inalterado.

### Não migrar

Estorno, pagamento de IVA, fecho de período/exercício, reabrir, detalhe de erro e outros diálogos de acção/detalhe. `Reconciliação`, `Reconciliação contabilística`, `Relatórios` e `Períodos` não têm formulário de dados a alterar.

## Restrições

- Sem alterações a backend, validadores, DTOs, Prisma, migrações ou seeds.
- Sem alteração à lógica de submissão dos formulários.
- `npm run lint` mantém os 31 erros preexistentes; não introduzir novos.

## Validação

- `npm run typecheck`
- `npm test`
- `npm run build`
- Verificação visual no browser de um formulário de referência, um `FormShell` modal e um formulário inline, em 1280×800 e 1024×768.
