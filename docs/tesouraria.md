# Tesouraria

Regras que o módulo de tesouraria garante. Cada uma existe porque a ausência
dela produzia um número errado — um saldo que não bate, uma caixa que não
fecha, ou dinheiro de uma empresa a mexer no saldo de outra.

## Fonte única do dinheiro

`ContaBancaria` é a única fonte de verdade sobre contas e caixas.
`EmpresaConfig.dadosBancarios` continua no schema por compatibilidade, mas
ninguém o lê: os documentos impressos tiram os dados de pagamento de
`ContaBancaria` (ver `src/main/services/dados-bancarios-documento.ts`).

## Saldo

O saldo de uma conta **nunca** é escrito a partir de um lançamento. É sempre
derivado:

```
saldo = saldoInicial + Σ(confirmados que creditam) − Σ(confirmados que debitam)
```

Só movimentos em estado `confirmado` mexem em dinheiro. Um `pendente` conta
para o relatório de pendentes, não para o saldo.

O `tipo` do movimento **não** decide o efeito — o lado nomeado decide:

| Movimento   | Efeito                                |
|-------------|---------------------------------------|
| `entrada`   | credita `contaDestinoId`              |
| `saida`     | debita `contaOrigemId`                |
| `transferencia` | debita a origem, credita o destino |
| `ajuste`    | credita o destino, debita a origem    |

Um `ajuste` que credita uma caixa tem de a aumentar. Filtrar por `tipo`
escondia-o do saldo, por isso a regra vive em `tesouraria.saldo.ts`
(`credita`, `debita`, `tocaDuasContas`, `arredondar`) e é usada por todos os
serviços.

Um `estorno` não apaga o movimento original: cria o inverso (troca os lados,
mantém o `tipo` quando é `ajuste`) e marca o original como `estornado`. Um
estorno de um estorno é recusado.

## Sessões de caixa

Só contas do tipo `caixa` têm sessão, e no máximo uma aberta de cada vez
(índice parcial na base de dados).

- **Sessão aberta** — a arqueação é calculada a cada consulta a partir dos
  movimentos confirmados ligados à sessão.
- **Sessão fechada** — os totais *esperados* ficam congelados na própria
  sessão (`totalEntradas`, `totalSaidas`, `totalNumerario`, `totalMulticaixa`,
  `totalTransferencia`). O que o operador contou à mão (`totalContado`) e a
  diferença para o esperado (`diferenca`) também ficam guardados.

O que entra em `numerario` e o que entra em `multicaixa` é decidido pelo
`meioPagamento` do movimento, não pelo tipo da conta.

Um lançamento que toca uma caixa por `numerario` ou `multicaixa` exige sessão
aberta — nos recibos, nas faturas-recibo e nos lançamentos manuais. Uma
transferência que mexe numa caixa também.

## Reconciliação

O extracto é a verdade do que aconteceu no banco; o lançamento é a afirmação
do ERP. Um lançamento fica `conciliado` quando alguém o reconheceu numa linha
do extracto, com a data dessa conciliação. A conciliação em lote recusa
movimentos de outra conta e movimentos já estornados. Desfazer é sempre
possível.

## Tenancy

`ContaBancaria.empresaId` é `NOT NULL`. A migração
`20260929180000_tesouraria_conta_bancaria_empresa_obrigatoria` só preenche a
partir de uma única empresa; havendo mais do que uma, trava e pede atribuição
manual, porque adivinhar a empresa errada é pior do que parar.

Nenhum serviço aceita um identificador de conta sem confirmar a dono:

- `TesourariaService.validarContas` — movimento e estorno
- `SessoesCaixaService.abrir` — sessão de caixa
- `ContasBancariasService.atualizar` — edição da conta
- `ReciboService.criar` e `VendasService.emitir` (FR) — crédito do pagamento

Uma conta de outra empresa responde "não encontrada", não "proibida": para quem
pergunta, essa conta não existe.

## Onde está o quê

| Ficheiro | Responsabilidade |
|---|---|
| `src/main/services/tesouraria.saldo.ts` | Regra única de crédito, débito e arredondamento |
| `src/main/services/contas-bancarias.service.ts` | Contas, saldos derivados, resumos |
| `src/main/services/tesouraria.service.ts` | Movimentos, estornos, conciliação |
| `src/main/services/sessoes-caixa.service.ts` | Abertura, apuração e fecho de caixa |
| `src/main/services/dados-bancarios-documento.ts` | Dados de impressão, lidos de `ContaBancaria` |
| `src/renderer/src/components/erp/ContasBancariasManager.tsx` | Ecrã de contas e sessões |
| `src/renderer/src/components/erp/LancamentosManager.tsx` | Ecrã de lançamentos |
| `src/renderer/src/components/erp/ReconciliacaoManager.tsx` | Ecrã de reconciliação |

## Verificar

```bash
npm run typecheck
npm test
npx prisma validate
```
