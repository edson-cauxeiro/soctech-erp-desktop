# Especificação de desenho — Associar conta contabilística em contas bancárias

Data: 2026-11-20

Estado: implementada e validada.

## Contexto

As contas bancárias e caixas já têm o campo opcional `contaContabilId` no modelo Prisma, mas o formulário de Tesouraria não permite preenchê-lo. Consequência: as contas criadas pela aplicação ficam sem ligação ao plano de contas e não podem ser reconciliadas contabilisticamente.

O objetivo é permitir associar essa conta na criação e na edição, sem exigir que todas as empresas tenham plano de contas configurado.

## Objetivo

Permitir que o utilizador escolha, no formulário de conta bancária/caixa, uma conta contabilística elegível da mesma empresa, ou deixe a associação vazia.

## Fora de escopo

- Alterações a `prisma/schema.prisma`, migrações ou seeds.
- Alteração à tabela de contas bancárias para mostrar a coluna da conta associada.
- Criação de contas contabilísticas a partir deste formulário.
- Alteração ao motor de contabilização ou às regras de reconciliação.

## Decisões aprovadas

- O campo aparece na criação e na edição.
- A associação é opcional.
- O selector mostra apenas contas `activa = true`, `aceitaMovimento = true` e da empresa da sessão.
- Contas já ligadas a outra conta bancária ficam ocultas; a conta atualmente ligada à conta em edição continua visível.
- As opções vêm de um endpoint dedicado de Tesouraria; as regras de elegibilidade e os duplicados são também validados na escrita.

## Arquitetura

### Backend

1. `src/main/validators/tesouraria.validator.ts`
   - Adicionar `contaContabilId: idOpcional('A conta contabilística')` aos schemas `criarContaBancariaSchema` e `atualizarContaBancariaSchema`.
   - Adicionar schema de filtro para o novo endpoint com `empresaId` obrigatório e `contaBancariaId` opcional.

2. `src/main/services/contas-bancarias.service.ts`
   - Novo método `listarContasContabeisDisponiveis(rawInput)`:
     - valida o filtro;
     - consulta `contaContabil` com `empresaId`, `activa: true`, `aceitaMovimento: true`;
     - consulta contas bancárias da empresa com `contaContabilId` preenchido;
     - remove as contas usadas por outra conta bancária, preservando a conta usada por `contaBancariaId` quando se trata de edição;
     - devolve `{ id, codigo, designacao, natureza }` ordenado por `codigo`.
   - Em `criar()` e `atualizar()`, quando `contaContabilId` for informado:
     - confirmar que a conta contabilística existe e pertence à mesma empresa;
     - confirmar que está activa e aceita movimento;
     - confirmar que não está ligada a outra conta bancária;
     - gravar `contaContabilId`.
   - Quando `contaContabilId` for `null`, limpar a associação.

3. `src/main/controllers/tesouraria.controller.ts` e `src/main/routers/tesouraria.router.ts`
   - Expor `tesouraria:contas:contasContabeisDisponiveis`.

### Contrato IPC / Tipos

- `src/preload/index.ts`: `listarContasContabeisDisponiveis(empresaId, contaBancariaId?)`.
- `src/renderer/src/@types/electron.d.ts`:
  - `ContaContabilDisponivelDto` com `id`, `codigo`, `designacao`, `natureza`;
  - `contaContabilId?: string | null` em `ContaBancariaDto`, `ContaBancariaCriarInput` e `ContaBancariaAtualizarInput`;
  - assinatura do novo método em `window.api.tesouraria`.
- `src/renderer/src/api/tesouraria.api.ts`: método `listarContasContabeisDisponiveis`.

### Frontend

Em `src/renderer/src/components/erp/ContasBancariasManager.tsx`:

- `ContaForm` passa a carregar as opções ao montar, com `empresaId` e `conta?.id`.
- `contaSchema` passa a ter `contaContabilId: z.string().optional().or(z.literal(""))`.
- Novo `SearchSelect` opcional, com:
  - valor inicial `conta?.contaContabilId ?? ""`;
  - opção vazia “Sem associação”;
  - labels `CODIGO — Designação`;
  - estado de carregamento enquanto a lista é obtida.
- `onSubmit` envia `contaContabilId: v.contaContabilId || null` no create e no update.
- Se a lista estiver vazia, o selector continua com “Sem associação” e mostra uma dica curta sobre configurar o plano de contas.
- O diálogo permanece aberto em caso de erro.

## Fluxo de dados

1. O utilizador abre “Nova conta” ou “Editar conta”.
2. O formulário pede as opções disponíveis ao IPC de Tesouraria.
3. O utilizador escolhe uma conta ou mantém “Sem associação”.
4. Ao guardar, o IPC de criação/actualização recebe `contaContabilId`.
5. O backend valida empresa, estado, elegibilidade e unicidade antes de gravar.
6. Em sucesso, a lista de contas é recarregada e o diálogo fecha.

## Erros

- Conta de outra empresa: `Conta contabilística não encontrada.`
- Conta inactiva ou sem movimento: `A conta contabilística não aceita movimentos.`
- Conta já ligada a outra conta bancária: `Esta conta contabilística já está associada a outra conta bancária.`
- Falha de comunicação IPC: `Falha ao comunicar com o processo principal.`

Todos os erros são apresentados via `toast.error` no formulário, sem fechar o diálogo.

## Testes

- `contas-bancarias.service.test.ts`:
  - listagem devolve apenas contas activas, com movimento, da empresa e não usadas;
  - listagem na edição inclui a conta actualmente ligada;
  - criação grava `contaContabilId`;
  - edição altera e limpa `contaContabilId`;
  - rejeição de conta de outra empresa, inactiva, sem movimento e duplicada.
- Validators: aceitação de `contaContabilId` nulo e rejeição de identificador vazio inválido.
- Verificação manual no browser: seleccionar conta contabilística ao criar e ao editar; confirmar que contas usadas não aparecem.

## Validação final

- `npm run typecheck`
- `npm test`
- `npx prisma validate`
