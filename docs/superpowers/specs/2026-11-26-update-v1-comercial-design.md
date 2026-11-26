# Update v1 — Comercial / Abertura de Caixa

**Origem:** `docs/updates/update-v1.md` §1.5.
**Estado:** design aprovado em brainstorming; aguarda revisão da spec.

## Problema

Na página Comercial → Abertura de Caixa, clicar numa sessão do histórico deixa o painel "Arqueação" com o spinner "A carregar apuramento…" indefinidamente e sem dados. Como o painel nunca mostra o apuramento, o operador não consegue seguir para o fecho.

## Causa confirmada

`SessaoCaixaManager.handleSelecionar` só chama `tesourariaApi.apurarSessao` quando `sessao.estado === 'aberta'`:

```ts
if (sessao.estado === 'aberta') {
  const res = await tesourariaApi.apurarSessao(sessao.id);
  if (res.success) setApuramento(res.data);
}
```

As sessões do histórico estão `fechada` (algumas com diferença), pelo que `apuramento` permanece `null` e o renderer desenha o spinner para sempre.

O backend **não** está em falta: `SessoesCaixaService.apurar` já trata sessões fechadas e devolve os totais congelados (`fundoInicial`, entradas, saídas, esperado, contado, diferença, nº de movimentos). Uma chamada directa ao IPC para a primeira sessão do histórico devolveu `success: true` com esses campos. O canal `tesouraria:sessoes:apurar`, o controller e o preload também estão correctos.

## Decisões

- Apurar **qualquer** sessão seleccionada, aberta ou fechada.
- Manter o botão "Fechar caixa" apenas em sessões `aberta`. Fechar uma sessão já fechada continua a ser rejeitado pelo serviço com `BusinessRuleError`.
- Correcção cirúrgica no renderer; nenhuma alteração ao contrato IPC, ao serviço de sessões nem ao esquema.
- Falha no apuramento deve mostrar mensagem e opção de repetir, nunca um spinner eterno.

## Desenho

### Renderer (`src/renderer/src/components/erp/SessaoCaixaManager.tsx`)

- Novo estado `erroApuramento: string | null`.
- Novo helper local `carregarApuramento(sessao: SessaoCaixaDto)`:
  - limpa `erroApuramento` e `apuramento`;
  - chama `tesourariaApi.apurarSessao(sessao.id)`;
  - em sucesso, grava `res.data`;
  - em `res.success === false`, grava `res.error.message`;
  - em excepção, grava mensagem genérica de comunicação.
- `handleSelecionar` define `sessaoActiva` e chama o helper **sem** condicionar pelo estado.
- `handleActualizar` usa o mesmo helper e continua a actualizar a lista de sessões; o botão só existe para sessões abertas.
- Renderização do painel de arqueação passa a ter três estados explícitos: erro (com "Tentar novamente"), dados (`apuramento`) e carregamento (`spinner`).

### Testes

- E2E em `tests/e2e/sessao-caixa.e2e.mts`: novo teste de regressão que clica na primeira linha do histórico, espera o heading `Arqueação:` e o cartão "Saldo em caixa", e confirma que "A carregar apuramento…" não permanece visível. Não abre nem fecha sessões; é só leitura.
- Os testes E2E existentes da página continuam a passar.

## Fora de âmbito

- Reabrir sessões fechadas.
- Alterar o cálculo do apuramento ou as regras de fecho.
- Alterar DTOs, validators, router ou serviço de tesouraria.

## Critérios de aceitação

1. Clicar numa sessão fechada do histórico mostra os totais congelados em menos de 2 segundos, sem spinner residual.
2. Clicar numa sessão aberta continua a mostrar os totais ao vivo e o botão "Fechar caixa".
3. Uma falha no apuramento mostra mensagem e permite repetir, sem spinner infinito.
4. `npm test`, `npm run typecheck`, `npm run build` e `npm run lint` mantêm-se na baseline (31 erros / 799 warnings).
