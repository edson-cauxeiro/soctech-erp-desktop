# Padronizar formulários de Recursos Humanos — Design

**Data:** 2026-11-21

## Objectivo

Todos os formulários de dados do módulo de Recursos Humanos devem ter o mesmo tamanho e comportamento do formulário “Novo lançamento contabilístico”, tal como já acontece em Finanças.

## Decisões aprovadas

- Normalizar **largura e altura**, não apenas a largura.
- Aplicar o padrão completo: `max-w-6xl w-[95vw] h-[90dvh] max-h-[90dvh]`, `flex flex-col overflow-hidden`, cabeçalho e rodapé fixos, scroll apenas no corpo.
- Âmbito: apenas **formulários de dados** — criar, editar ou actualizar configuração.
- Incluir os **6 formulários inline** e os **5 diálogos de dados aninhados** na ficha do funcionário (contrato, alteração salarial, dependente, rubrica fixa e documento). “Cessar contrato” é acção e fica excluído.
- Total final: **17 modais de dados + 6 formulários inline = 23 formulários**.
- Reutilizar `FormDialog`/`FormSurface` de `src/renderer/src/components/erp/FormDialog.tsx`; não criar novo componente.
- Nos inline, o contentor da grelha passa a ter altura explícita/flexível para que o `h-full` do `FormSurface` resolva; o `ErpShell` global não muda.
- Limpeza mínima: nos 8 managers com `<Dialog>` vazio só para `DialogTrigger`, substituir por `Button onClick`, mantendo o diálogo real com o mesmo estado.

## Arquitetura

- `FormDialog` para os 17 diálogos modais de dados.
- `FormSurface` com `h-full` para os 6 formulários inline de dados.
- `FormShell dialogLayout` no único formulário que já usa `FormShell` (`RhFuncionarioFicha`).
- Nos restantes formulários nativos, o cabeçalho existente segue em `title`/`description`/`headerActions` e os botões em `footer`; o `<form>`, `onSubmit` e validações não mudam.
- Diálogos aninhados são portais Radix independentes: o filho abre acima do pai e tem scroll próprio.

## Inventário — incluídos

### Modais de dados (17)

1. `RhFuncionarioFicha.tsx` — Ficha do Funcionário.
2. `RhFuncionarioFicha.tsx` — Novo contrato.
3. `RhFuncionarioFicha.tsx` — Alteração salarial.
4. `RhFuncionarioFicha.tsx` — Adicionar/Editar dependente.
5. `RhFuncionarioFicha.tsx` — Adicionar/Editar rubrica fixa.
6. `RhFuncionarioFicha.tsx` — Adicionar/Editar documento.
7. `RhFuncionariosManager.tsx` — Novo/Editar Funcionário.
8. `RhAfetacoesManager.tsx` — Nova/Editar Afectação.
9. `RhAtividadesManager.tsx` — Nova/Editar Atividade.
10. `RhAusenciasManager.tsx` — Nova/Editar Ausência.
11. `RhHorasExtraManager.tsx` — Nova/Editar Hora Extra.
12. `RhFeriasManager.tsx` — Nova/Editar Marcação de Férias.
13. `RhFeriasCalendarioManager.tsx` — Nova/Editar Marcação de Férias.
14. `RhRetroativosManager.tsx` — Novo/Editar Retroactivo.
15. `RhIndependentesManager.tsx` — Novo/Editar Independente.
16. `RhAlteracoesMensaisManager.tsx` — Nova/Editar Alteração Mensal.
17. `RhDividasProcessosManager.tsx` — Novo/Editar Processo de Dívida.

### Inline de dados (6)

1. `RhCadastrosManager.tsx` — Novo registo / Editar cadastro.
2. `RhRubricasManager.tsx` — Nova Rubrica / Editar Rubrica.
3. `RhParametrosManager.tsx` — Nova Versão de Parâmetro.
4. `RhParametrosManager.tsx` — Nova Tabela de IRT.
5. `RhPadroesManager.tsx` — Subsídios e Padrões de Cálculo.
6. `RhProcessamentoManager.tsx` — Parâmetros de processamento.

## Excluídos

- Acções com campos: cessar contrato, copiar do mês anterior, suspender/cancelar processo, descontar/anular/perdoar prestação, criar ordem de pagamento, confirmar/estornar pagamento, processar/anular salários.
- Detalhe/ajuda: detalhe do processamento, ajuda de simulação/processamento, ordem de pagamento, ficheiro de transferência.
- Importação CSV, assistente de migração e todos os formulários de filtro/pesquisa.
- Confirmações nativas `confirm()` e `prompt()`.

## Restrições

- Sem backend, validadores, DTOs, Prisma, migrações ou seeds.
- Sem alteração à lógica de submissão, validação ou permissões.
- `npm run lint` mantém os 31 erros preexistentes; não introduzir novos.
- Directório não é repositório Git: não fazer commit/push.

## Validação

- `npm run typecheck`
- `npm test`
- `npm run build`
- Verificação visual no browser de: ficha com diálogo aninhado, um CRUD modal, um formulário inline e a página de parâmetros, em 1280×800 e 1024×768.
- `npm run lint` — mesmos 31 erros preexistentes, nenhum em novo código.
