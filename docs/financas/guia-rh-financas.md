# Guia do Utilizador — Módulos de Finanças e Recursos Humanos

**Versão:** 1.0  
**Data:** Novembro 2026  
**Sistema:** DoraERP Desktop  
**Âmbito:** Módulos **Finanças** (Contabilidade Geral, Tesouraria, Bancos) e **Recursos Humanos** (Capital Humano, Processamento Salarial, Recibos e Pagamentos, Obrigações Declarativas, Configuração, Auditoria)

---

## Sumário

1. [Introdução](#1-introdução)
2. [Módulo Finanças](#2-módulo-finanças)
   - 2.1 [Plano de Contas](#21-plano-de-contas)
   - 2.2 [Diários Contabilísticos](#22-diários-contabilísticos)
   - 2.3 [Períodos Contabilísticos](#23-períodos-contabilísticos)
   - 2.4 [Lançamentos Contabilísticos](#24-lançamentos-contabilísticos)
   - 2.5 [Reconciliação Bancária](#25-reconciliação-bancária)
   - 2.6 [Regras de Contabilização (Motor)](#26-regras-de-contabilização-motor)
   - 2.7 [Relatórios Contabilísticos](#27-relatórios-contabilísticos)
   - 2.8 [Fecho de Período (Mensal)](#28-fecho-de-período-mensal)
   - 2.9 [Apuramento de IVA](#29-apuramento-de-iva)
   - 2.10 [Apuramento de Resultados e Fecho Anual](#210-apuramento-de-resultados-e-fecho-anual)
   - 2.11 [Demonstrações Financeiras](#211-demonstrações-financeiras)
   - 2.12 [Semeadura (Seed) de Contabilidade](#212-semeadura-seed-de-contabilidade)
3. [Módulo Recursos Humanos](#3-módulo-recursos-humanos)
   - 3.1 [Capital Humano — Funcionários](#31-capital-humano--funcionários)
   - 3.2 [Capital Humano — Alterações Mensais](#32-capital-humano--alterações-mensais)
   - 3.3 [Capital Humano — Ausências](#33-capital-humano--ausências)
   - 3.4 [Capital Humano — Horas Extra](#34-capital-humano--horas-extra)
   - 3.5 [Capital Humano — Férias](#35-capital-humano--férias)
   - 3.6 [Capital Humano — Calendário de Férias](#36-capital-humano--calendário-de-férias)
   - 3.7 [Capital Humano — Afetações](#37-capital-humano--afetações)
   - 3.8 [Capital Humano — Dívidas](#38-capital-humano--dívidas)
   - 3.9 [Capital Humano — Retroativos](#39-capital-humano--retroativos)
   - 3.10 [Capital Humano — Independentes](#310-capital-humano--independentes)
   - 3.11 [Capital Humano — Atividades](#311-capital-humano--atividades)
   - 3.12 [Processamento Salarial — Salários e Honorários](#312-processamento-salarial--salários-e-honorários)
   - 3.13 [Processamento Salarial — Simulação](#313-processamento-salarial--simulação)
   - 3.14 [Processamento Salarial — Processamentos (Histórico)](#314-processamento-salarial--processamentos-histórico)
   - 3.15 [Recibos e Pagamentos — Recibos](#315-recibos-e-pagamentos--recibos)
   - 3.16 [Recibos e Pagamentos — Pagamentos](#316-recibos-e-pagamentos--pagamentos)
   - 3.17 [Obrigações Declarativas](#317-obrigações-declarativas)
   - 3.18 [Configuração RH](#318-configuração-rh)
   - 3.19 [Auditoria RH](#319-auditoria-rh)
   - 3.20 [Importação CSV de Funcionários](#320-importação-csv-de-funcionários)
4. [Permissões e Perfis](#4-permissões-e-perfis)
5. [Boas Práticas e Fluxos Recomendados](#5-boas-práticas-e-fluxos-recomendados)
6. [Resolução de Problemas Comuns](#6-resolução-de-problemas-comuns)

---

## 1. Introdução

Este guia descreve **todas as funcionalidades** dos módulos **Finanças** e **Recursos Humanos** do DoraERP Desktop. Cada secção explica:

- **O que é** a funcionalidade
- **Quando usar**
- **Passo a passo** para executar
- **Validações e regras** importantes
- **Dicas** e armadilhas comuns

> **Convenções de ícones**  
> ℹ️ Informação | ⚠️ Atenção | ✅ Sucesso | ❌ Erro | 💡 Dica | 🔒 Requer permissão

---

## 2. Módulo Finanças

Aceda pelo menu lateral **Finanças**. O módulo organiza-se em abas (tabs) na área central.

### 2.1 Plano de Contas

**Objetivo:** Gerir o plano de contas da empresa (PGC Angola 160 contas classes 1–8).

**O que faz:**
- Visualizar árvore hierárquica de contas (código, designação, classe, tipo, natureza)
- Criar, editar, remover contas (só contas sem movimentos e sem filhas)
- Definir: aceita movimento, exige centro de custo, exige entidade
- Filtrar por classe, apenas folhas, incluir saldo zero

**Como usar:**
1. Aba **Plano de contas** → barra de ferramentas: **Nova conta**
2. Preencha: Código (único por empresa), Designação, Tipo (activo/passivo/capitalProprio/proveito/custo/resultado/memo), Natureza (devedora/credora)
3. Marque **Aceita movimento** se a conta for de lançamento direto (folha)
4. **Gravar** → a conta aparece na árvore; contas-pai deixam de aceitar movimento automaticamente

**Regras:**
- Código deve começar por 1–8 e conter só dígitos
- Não pode apagar conta com movimentos ou filhas
- Contas-pai tornam-se agregação (aceita movimento = false) ao criar filhas

**Seed:** Botão **Semear contabilidade** cria 160 contas PGC Angola idempotentemente.

---

### 2.2 Diários Contabilísticos

**Objetivo:** Gerir diários (VD, CP, CX, BC, OD, AB, AP, LG) e as suas numerações por exercício.

**O que faz:**
- Listar diários com código, designação, tipo, estado (activo/inactivo)
- Criar/editar diários
- Cada diário tem sequência própria por exercício (ex: VD/2026 → 1, 2, 3…)

**Como usar:**
1. Aba **Diários** → **Novo diário**
2. Código curto (ex: `VD`), Designação (`Diário de vendas`), Tipo (`vendas`)
3. Marcar **Activo** para poder ser usado em lançamentos

**Tipos de diário:** `vendas`, `compras`, `caixa`, `banco`, `geral`, `ajustamento`, `abertura`, `liquidacao`, `salarios`, `imobilizado`

---

### 2.3 Períodos Contabilísticos

**Objetivo:** Gerir os 12 períodos mensais (+ período 13 de ajustes) de cada exercício.

**O que faz:**
- Visualizar períodos: número, datas início/fim, estado (`aberto`/`fechado`/`bloqueado`)
- **Fechar período** → passa a `fechado` (não aceita novos lançamentos)
- **Bloquear período** → passa a `bloqueado` (nem fecho mensal mexe)
- **Reabrir período** → exige permissão `approve`, motivo obrigatório, cria execução `revertido` e estorna lançamentos de fecho
- Não existe eliminação de períodos

**Estados:**
| Estado | Permite lançamentos? | Permite fecho mensal? |
|--------|---------------------|----------------------|
| `aberto` | ✅ | ✅ |
| `fechado` | ❌ | ✅ (pode reabrir) |
| `bloqueado` | ❌ | ❌ |

**Como usar:**
1. Aba **Períodos** → selecione exercício no topo
2. Botões **Fechar** / **Bloquear** / **Reabrir** por período
3. Reabrir abre diálogo com campo **Motivo** (obrigatório)

---

### 2.4 Lançamentos Contabilísticos

**Objetivo:** Registar, validar, estornar lançamentos manuais ou de integração.

**O que faz:**
- Criar lançamento em **rascunho** (ainda não valida débito=crédito)
- Adicionar linhas: conta (só contas `aceitaMovimento`), débito/crédito, centro de custo, entidade (cliente/fornecedor/funcionário/outro), descrição
- **Validar** → verifica débito=crédito, período e exercício `abertos`, numera atomicamente no diário
- **Estornar** → cria lançamento inverso (`origem=estorno`), referência ao original, numeração própria, estado `estornado` no original

**Como usar:**
1. Aba **Lançamentos contabilísticos** → **Novo lançamento**
2. Diário, data contabilística, data documento, descrição, origem (`manual`/`integracao`/`abertura`/`fecho`/`ajustamento`/`liquidacao`/`estorno`)
3. Linhas: **Adicionar linha** → selecione conta (SearchSelect), valor (débito OU crédito), centro de custo, entidade
4. **Gravar rascunho** → aparece na grelha com estado `rascunho`
5. **Validar** (botão na linha) → fica `validado`, imutável (trigger BD)

**Validações:**
- Débito total = Crédito total (4 casas decimais)
- Período e exercício devem estar `abertos`
- Conta deve `aceitaMovimento=true`
- Se conta `exigeCentroCusto` → centro obrigatório
- Se conta `exigeEntidade` → entidade obrigatória

**Numeração:** Atómica por (diário, exercício) via `sequencias_diario` (INSERT … ON CONFLICT).

---

### 2.5 Reconciliação Bancária

**Objetivo:** Conciliar movimentos de extrato bancário com lançamentos contabilísticos.

**O que faz:**
- Listar contas bancárias conciliáveis (com `contaContabilId` preenchido)
- Carregar movimentos não conciliados de uma conta/período
- **Conciliar**: emparelhar movimento de extrato com linha de lançamento (mesmo valor, data próxima)
- **Desconciliar**: desfazer emparelhamento
- **Gerar lançamento** a partir de movimento sem contrapartida

**Como usar:**
1. Aba **Reconciliação** → selecione conta bancária, empresa, data
2. Grelha mostra movimentos do extrato (esquerda) e lançamentos candidatos (direita)
3. Selecione pares → **Conciliar selecionados**
4. Para movimentos sem lançamento: **Gerar lançamento** → abre diálogo pré-preenchido

**Regras:**
- Só contas com `contaContabilId` associada
- Diferença de datas ≤ 5 dias (configurável)
- Valores devem bater exactamente (4 casas)

---

### 2.6 Regras de Contabilização (Motor)

**Objetivo:** Automatizar lançamentos a partir de documentos de origem (faturas, recibos, guias, stocks, RH).

**O que faz:**
- Definir **RegraContabilizacao**: módulo origem, tipo origem, diário, ativa
- **Linhas da regra**: conta (via chave `CHAVES_CONTA`), lado (D/C), expressão de valor (`EXPRESSOES_VALOR`)
- Motor **nunca lança erros** para o módulo origem → grava `ErroIntegracaoContabil` e devolve `{ pendente: true }`
- Idempotência: unique `(moduloOrigem, tipoOrigem, origemId, origem)`

**Chaves de conta (`CHAVES_CONTA` — 23 chaves normalizadas em inglês):**
```
VAT_INPUT, VAT_OUTPUT, VAT_PAYABLE, VAT_RECOVERABLE,
CUSTOMER_ACCOUNT, SUPPLIER_ACCOUNT,
SALES_ACCOUNT, PURCHASE_ACCOUNT, CASH_ACCOUNT, BANK_ACCOUNT,
RETAINED_EARNINGS,
RESULT_OPERATING, RESULT_FINANCIAL, RESULT_CURRENT, RESULT_NON_OPERATING,
RESULT_BEFORE_TAX, RESULT_TAX, RESULT_ACTIVITIES, RESULT_NET,
PAYROLL_EXPENSE, PAYROLL_PAYABLE, SOCIAL_SECURITY_PAYABLE, WITHHOLDING_PAYABLE
```

**Expressões de valor (`EXPRESSOES_VALOR`):**
- `TOTAL` — total bruto do documento
- `NET` — líquido (bruto - desconto)
- `TAX` — imposto total
- `TAX:<taxa>` — imposto de uma taxa específica (ex: `TAX:14`)
- `BASE` — base tributável
- `DISCOUNT` — desconto
- `PAID` — valor pago
- `OUTSTANDING` — valor em aberto

**Como usar:**
1. Aba **Regras** (em Lançamentos contabilísticos) → **Nova regra**
2. Módulo origem (ex: `vendas`), Tipo origem (ex: `fatura`), Diário (ex: `VD`)
3. Linhas: **Adicionar** → Chave de conta, Lado (`D`/`C`), Expressão (`TOTAL`, `TAX:14`, etc.)
4. **Gravar** → regra ativa processa documentos novos automaticamente

**Erros de integração:**
- Aba **Erros** → lista `ErroIntegracaoContabil` com código, mensagem, detalhes JSON
- **Reprocessar** → tenta novamente após corrigir mapeamento/conta

---

### 2.7 Relatórios Contabilísticos

**Objetivo:** Emitir relatórios oficiais a partir **apenas** de `LinhaLancamentoContabil` com `lancamento.estado='validado'` (sem saldos materializados).

**Relatórios disponíveis:**

| Relatório | Descrição | Filtros principais |
|-----------|-----------|-------------------|
| **Balancete** | Saldos por conta (inicial, movimento, final) | Exercício, Período, Data ini/fim, Diário, Classe, Só folhas, Saldo zero, Acumulado |
| **Razão** | Movimentos detalhados por conta | Conta, Exercício, Período, Data ini/fim |
| **Diários** | Lançamentos por diário | Diário, Exercício, Período, Data ini/fim |
| **Conta Corrente** | Movimentos de uma entidade (cliente/fornecedor) | Entidade, Tipo entidade, Exercício, Período |

**Como usar:**
1. Aba **Relatórios** → selecione tipo no dropdown
2. Preencha filtros → **Gerar**
3. Resultado em grelha paginada; colunas: conta, código, designação, débito, crédito, saldo
4. Botões **Exportar PDF/Excel** (a implementar no backend)

**Nota:** Só lançamentos `validados` entram. Rascunhos e estornados são ignorados.

---

### 2.8 Fecho de Período (Mensal)

**Objetivo:** Checklist de 7 passos para fechar um período mensal com rastreabilidade total.

**Passos do checklist:**

| Código | Descrição | Bloqueio se… |
|--------|-----------|--------------|
| `integracoes` | Integrações pendentes (motor) | Existem `ErroIntegracaoContabil` não resolvidos |
| `reconciliacao` | Reconciliação bancária | Contas bancárias com movimentos por conciliar |
| `rascunhos` | Lançamentos em rascunho | Lançamentos `estado=rascunho` no período |
| `amortizacoes` | Amortizações/Imobilizado | (Placeholder — módulo imobilizado não activo) |
| `regularizacoes` | Regularizações | Lançamentos `origem=ajustamento` em `rascunho` |
| `iva` | Apuramento IVA | Não existe `ApuramentoImposto` `validado` para IVA no período |
| `balancete` | Balancete equilibrado | Total débito ≠ total crédito no período |

**Como usar:**
1. Aba **Fecho** → selecione Período no topo
2. Botão **Actualizar** recalcula checklist
3. Resolva bloqueios (clique em cada passo para ver detalhes)
4. Quando **Todos os passos OK** → botão **Executar fecho** fica activo
5. **Confirmar** → cria `ExecucaoFecho` tipo `fechoMensal`, período passa a `fechado`, `AuditLog` `fechar`

**Reabrir período:**
- Botão **Reabrir período** (só se período `fechado`/`bloqueado` e utilizador tem `approve`)
- Diálogo: **Motivo** (obrigatório)
- Cria execução `revertido`, estorna lançamentos de fecho, período volta a `aberto`, `AuditLog` `reabrir`

---

### 2.9 Apuramento de IVA

**Objetivo:** Calcular IVA liquidado vs dedutível, gerar apuramento e lançamento de liquidação/pagamento.

**Fórmulas (só lançamentos `validados`):**
- `ivaLiquidado` = Σ créditos − Σ débitos nas contas `VAT_OUTPUT` (3422)
- `ivaDedutivel` = Σ débitos − Σ créditos nas contas `VAT_INPUT` (3421)
- `creditoTransitado` = |saldo anterior| se saldo anterior < 0 (crédito a recuperar transitado)
- `saldo` = `ivaLiquidado` − `ivaDedutivel` − `creditoTransitado`
  - `saldo > 0` → conta `VAT_PAYABLE` (3423) — IVA a pagar
  - `saldo < 0` → conta `VAT_RECOVERABLE` (3424) — IVA a recuperar

**Como usar:**
1. Aba **IVA** → selecione Período (só períodos `abertos`)
2. Botão **Previsão** → mostra valores calculados, contas envolvidas, bloqueios
3. Se **OK** → **Executar apuramento**
   - Cria `ApuramentoImposto` `validado`
   - Lançamento no diário `liquidacao` (AP) com linhas: VAT_OUTPUT (D), VAT_INPUT (C), VAT_PAYABLE/RECOVERABLE (D/C), VAT_RECOVERABLE crédito transitado (C se aplicável)
   - `AuditLog` `apurar`
4. **Histórico** lista apuramentos do exercício
5. **Pagamento** (botão no histórico):
   - Selecione conta bancária, data pagamento
   - Cria lançamento no diário `banco` (BC): VAT_PAYABLE (C) / Banco (D) ou VAT_RECOVERABLE (D) / Banco (C)
   - Atualiza `ApuramentoImposto.estado = 'pago'`, `pagoEm`
   - `AuditLog` `pagar`

**Regras:**
- Só períodos `abertos`
- Um apuramento por (período, IVA) — unique constraint
- Período fechado/bloqueado com execução `executado` impede novo apuramento (trigger BD)

---

### 2.10 Apuramento de Resultados e Fecho Anual

**Objetivo:** Encerrar contas de resultados (classes 6 e 7) nas contas 81–88 e fechar o exercício.

#### 2.10.1 Apuramento de Resultados

**Classificação automática por prefixo da conta:**
| Prefixo | Classe | Destino | Tipo |
|---------|--------|---------|------|
| `64` / `75` | 6/7 | `RESULT_FINANCIAL` (82) | Financeiro |
| `651` `653` / `761` `763` | 6/7 | `RESULT_NON_OPERATING` (84) | Não corrente |
| demais 6 / 7 | 6/7 | `RESULT_OPERATING` (81) | Operacional |

**Sequência de apuramento (um único lançamento equilibrado no diário `ajustamento`):**
1. Proveitos/Custos → 81/82/84 (operacional/financeiro/não corrente)
2. 81+82+84 → 83 (`RESULT_CURRENT`)
3. 83 → 85 (`RESULT_BEFORE_TAX`)
4. 85 → 88 (`RESULT_NET`) via 86 (`RESULT_TAX` — imposto)
5. 87 (`RESULT_ACTIVITIES`) espelha 88

**Como usar:**
1. Aba **Resultados** (sub-aba **Apuramento de resultados**) → selecione Exercício
2. **Previsão** mostra KPIs: Proveitos, Custos, Resultado operacional, financeiro, não corrente, antes de impostos, imposto, líquido
3. Tabelas de detalhe por conta (proveitos/custos/imposto)
4. Bloqueios: períodos em aberto, mapeamentos em falta (81–88)
3. **Executar apuramento** → cria `ExecucaoFecho` tipo `apuramentoResultados` + lançamento `validado` no diário `ajustamento` (AP) com todas as linhas acima

#### 2.10.2 Fecho Anual

**Passos (ordem obrigatória):**
1. **Todos os períodos fechados** (fecho mensal executado)
2. **Apuramento de resultados executado**
3. **Encerrar exercício** → exercício `fechado`, períodos `bloqueado`, `ExecucaoFecho` tipo `fechoAnual` (guarda snapshot dos estados anteriores dos períodos)
4. **Abrir exercício seguinte** → cria Exercício N+1 com 12 períodos, lançamento `origem=abertura` no diário `abertura` (AB) com saldos classes 1–5 por entidade (cliente/fornecedor/funcionário/outro)
5. **Reabrir exercício** (se necessário) → só se N+1 não tem lançamentos além da abertura; estorna abertura, repõe estados dos períodos (do snapshot), exercício volta a `aberto`, `ExecucaoFecho` `revertido`, motivo obrigatório

**Como usar:**
1. Aba **Resultados** → sub-aba **Fecho anual**
2. **Previsão** mostra checklist com estados (✅/⏳/❌) e bloqueios
3. Botões (activos conforme pré-condições):
   - **Encerrar exercício** (precisa: períodos fechados + resultados apurados)
   - **Abrir exercício seguinte** (precisa: exercício encerrado + N+1 sem abertura)
   - **Reabrir exercício** (precisa: exercício fechado + N+1 só com abertura; pede motivo)

---

### 2.11 Demonstrações Financeiras

**Objetivo:** Gerar Balanço, Demonstração de Resultados, Fluxos de Caixa e Alterações no Capital Próprio a partir de **estruturas configuráveis** (sem contas hardcoded).

**Estruturas padrão (seed):**
| Código | Tipo | Descrição |
|--------|------|-----------|
| `BALANCO` | `balanco` | Activo (classes 1–4), Passivo (classe 3 passivo), Capital Próprio (classe 5) |
| `DR` | `demonstracaoResultados` | Proveitos/Custos operacionais/financeiros/não correntes, Imposto, Resultado líquido |
| `FLUXOS_CAIXA` | `fluxosCaixa` | Entradas/Saídas classe 4 (caixa/bancos), Fluxo líquido |
| `CAPITAL_PROPRIO` | `alteracoesCapitalProprio` | Capital, Reservas, Resultados transitados, Resultado exercício |

**Como usar:**
1. Aba **Demonstrações financeiras**
2. **Lista** → mostra 4 cards (ícone, designação, tipo, nº linhas). Botões: **Visualizar**, **Editar**, **Remover**
3. **Nova estrutura** / **Editar** → Editor com:
   - Cabeçalho: Código, Designação, Tipo, Activa
   - Linhas: Código, Designação, Pai (hierarquia), Ordem, Nível, Tipo (`activo`/`passivo`/`capitalProprio`/`proveito`/`custo`/`resultado`/`subtotal`/`total`/`fluxo`/`memo`), Operação (`saldo`/`debito`/`credito`/`creditoMenosDebito`), Sinal (+1/-1), Contas associadas
4. **Visualizar** → selecione Exercício/Período ou datas → **Gerar**
   - Tabela hierárquica com indentação, valores (inicial/período/final para Capital Próprio)
   - Totais: Balanço mostra Activo vs Passivo+Capital (aviso se desequilibrado)
   - Avisos: contas com movimento não mapeadas na estrutura

**Edição de estrutura:**
- Linhas com contas não podem ter filhas
- Pai deve existir na mesma estrutura
- Contas devem existir na empresa e `aceitaMovimento=true`

---

### 2.12 Semeadura (Seed) de Contabilidade

**Objetivo:** Preparar uma empresa nova com plano PGC, diários, mapeamentos e estruturas de demonstrações.

**Botão:** **Semear contabilidade** (em qualquer aba de contabilidade, ou via API)

**O que cria (idempotente — só o que falta):**
1. **Plano de contas** — 160 contas PGC Angola (classes 1–8) a partir de `prisma/data/pgc-angola.json`
2. **Diários padrão** — 8 diários (VD, CP, CX, BC, OD, AB, AP, LG)
3. **Mapeamentos padrão** — 23 chaves `CHAVES_CONTA` → contas PGC correspondentes
4. **Estruturas de demonstrações** — 4 estruturas (Balanço, DR, Fluxos, Capital Próprio) com mapeamentos por classe/tipo

**Resultado:** JSON com contadores `criadas`/`total` por passo.

---

## 3. Módulo Recursos Humanos

Aceda pelo menu lateral **Recursos Humanos** (ícone usuários). Organizado em grupos na sidebar: **Capital Humano**, **Processamento Salarial**, **Recibos e Pagamentos**, **Obrigações Declarativas**, **Configuração**, **Auditoria**.

### 3.1 Capital Humano — Funcionários

**Abas:** Geral, Funcionários, Alterações Mensais, Ausências, Horas Extra, Férias, Férias Calendário, Afetações, Dívidas, Retroativos, Independentes, Atividades

**Funcionários (lista principal):**
- Grelha paginada com filtros: pesquisa, estado, departamento, cargo
- **Novo funcionário** → diálogo multi-passo:
  1. **Geral**: Nome, NIF, BI, Data nascimento, Sexo, Estado civil, Nacionalidade, Contactos, IBAN, Data admissão, Departamento, Cargo, Categoria, Salário base, Horário, Tipo contrato
  2. **Dependentes** (opcional): Nome, Parentesco, Data nascimento, NIF, Incapacidade
  3. **Ausências** (opcional): Tipo, Data início/fim, Dias, Observações
  4. **Férias** (opcional): Ano, Dias gozo, Dias gozo ano anterior, Observações
- **Editar** → abre mesma estrutura
- **Inativar** → muda estado para `inativo` (não apaga)
- **Ver ficha** → detalhe completo com histórico

**Validações:**
- NIF/BI únicos por empresa
- Salário base ≥ salário mínimo
- Data admissão ≤ hoje

---

### 3.2 Capital Humano — Alterações Mensais

**Objetivo:** Registar alterações que afetam o processamento do mês (promoções, mudanças de cargo/departamento, ajustes salariais).

**Como usar:**
1. Aba **Alterações mensais** → **Nova alteração**
2. Funcionário, Mês/Ano, Tipo (`promocao`, `mudanca_cargo`, `mudanca_departamento`, `ajuste_salarial`, `outro`)
3. Valores anterior/novo, Observações
4. **Gravar** → aparece no processamento do mês (aba Simulação/Processamento)

---

### 3.3 Capital Humano — Ausências

**Objetivo:** Registar faltas, baixas médicas, licenças, etc.

**Como usar:**
1. Aba **Ausências** → **Nova ausência**
2. Funcionário, Tipo (`falta`, `baixa_medica`, `licenca_maternidade`, `licenca_paternidade`, `outro`)
3. Data início, Data fim, Dias úteis, Comprovativo (anexo), Observações
4. **Gravar** → entra no processamento salarial (desconta ou paga conforme tipo/tabela)

**Filtros:** Por funcionário, tipo, mês/ano, estado

---

### 3.4 Capital Humano — Horas Extra

**Objetivo:** Registar horas extraordinárias para pagamento no processamento.

**Como usar:**
1. Aba **Horas Extra** → **Nova**
2. Funcionário, Mês/Ano, Horas (número), Taxa (1.5x, 2x, etc.), Descrição
3. **Gravar** → valor calculado = horas × taxa × (salário base / horas normais mês)

---

### 3.5 Capital Humano — Férias

**Objetivo:** Gerir gozo de férias, marcações, saldos.

**Como usar:**
1. Aba **Férias** → grelha com saldos por funcionário/ano
2. **Marcar férias** → funcionário, ano, data início, data fim, dias úteis
3. Valida: não sobrepõe outras marcações, não excede saldo (22 dias base + dias ano anterior)
4. **Gozo** → confirma gozo real (pode diferir da marcação)

**Saldos:** Calculados automaticamente: `saldo = 22 + transitados - gozados - marcados`

---

### 3.6 Capital Humano — Calendário de Férias

**Objetivo:** Visualização tipo calendário das marcações de férias por departamento/equipa.

**Como usar:**
1. Aba **Férias Calendário** → selecione Ano, Departamento
2. Mês a mês: barras coloridas por funcionário
3. Clique na barra → detalhe (datas, estado)
3. Filtros: estado (`marcado`, `gozado`, `cancelado`)

---

### 3.7 Capital Humano — Afetações

**Objetivo:** Afectar funcionários a centros de custo/projetos/obras com percentagens.

**Como usar:**
1. Aba **Afetações** → **Nova afectação**
2. Funcionário, Centro de custo (ou projeto/obra), Percentagem (%), Data início, Data fim (opcional)
3. Soma de percentagens por funcionário ≤ 100% no mesmo período
4. Usado no rateio de custos no processamento e contabilidade analítica

---

### 3.8 Capital Humano — Dívidas

**Objetivo:** Registar adiantamentos, empréstimos, desconto de dívidas ao funcionário.

**Como usar:**
1. Aba **Dívidas** → **Nova dívida**
2. Funcionário, Tipo (`adiantamento`, `emprestimo`, `outro`), Valor total, Nº prestações, Valor prestação, Data início
3. **Gravar** → gera plano de amortização; cada processamento desconta a prestação
4. **Liquidar** → marca como paga antecipadamente

---

### 3.9 Capital Humano — Retroativos

**Objetivo:** Calcular e pagar diferenças salariais de meses anteriores (ex: promoção com efeitos retroativos).

**Como usar:**
1. Aba **Retroativos** → **Novo retroativo**
2. Funcionário, Mês referência (mês a corrigir), Tipo (`promocao`, `ajuste`, `outro`), Valor diferença
3. **Gravar** → entra no próximo processamento como verba única (código específico)
4. **Pagar** → gera recibo à parte se necessário

---

### 3.10 Capital Humano — Independentes

**Objetivo:** Gerir prestadores de serviços (recibos verdes) — processamento de honorários.

**Como usar:**
1. Aba **Independentes** → **Novo independente**
2. Nome, NIF, Actividade (CAE), IBAN, Retenção IRS (%), Segurança Social (%), Regime IVA
3. **Actividades** → sub-grelha: adicionar linhas de honorários (descrição, valor bruto, mês/ano)
4. **Processar honorários** (botão) → calcula líquido (bruto - IRS - SS), gera `RhProcessamentoHonorario`
5. **Pagar** → ordem de pagamento / transferência

---

### 3.11 Capital Humano — Atividades

**Objetivo:** Catálogo de atividades/CAE para independentes e enquadramento fiscal.

**Como usar:**
1. Aba **Atividades** → **Nova atividade**
2. Código CAE, Designação, Retenção IRS padrão, SS padrão, Regime IVA
3. Usado no cadastro de independentes para pré-preencher retenções

---

### 3.12 Processamento Salarial — Salários e Honorários

**Objetivo:** Processamento mensal completo (salários + honorários independentes).

**Fluxo:**
1. Selecione **Mês/Ano** no topo
2. Botão **Processar** → executa:
   - Base: salário base × dias úteis / dias mês
   - Subsídios: refeição, transporte, outros (conforme config)
   - Horas extra, ausências (descontos), retroativos, dívidas (prestações)
   - IRS: tabelas IRT mensais (conforme escalões, dependentes, deficiência)
   - Segurança Social: 8% empregado + 21.5% empregador (configurável)
   - Líquido = Bruto - IRS - SS - Outras retenções
3. Resultado: grelha com totais por funcionário (bruto, IRS, SS, líquido)
4. **Anular** → volta a estado `rascunho`, apaga totais, pode reprocessar
5. **Submeter** → estado `processado`, gera `RhOrdemPagamento` por funcionário, `AuditLog` `submeter`

**Validações:**
- Mês não pode ter processamento `processado` já (exceto se anulado)
- Tabelas IRT do ano devem existir
- Parâmetros fiscais (SS, IRS) do ano devem existir

---

### 3.13 Processamento Salarial — Simulação

**Objetivo:** Testar processamento **sem gravar** nem gerar ordens de pagamento.

**Como usar:**
1. Aba **Simulação** → selecione Mês/Ano
2. **Simular** → igual ao processamento real mas:
   - Não cria `RhProcessamento` nem `RhOrdemPagamento`
   - Não faz `AuditLog` `submeter`
   - Mostra grelha de totais para conferência
3. Útil para validar tabelas IRT, parâmetros, alterações mensais antes do processamento real

---

### 3.14 Processamento Salarial — Processamentos (Histórico)

**Objetivo:** Listar todos os processamentos realizados, com estado e totais.

**Como usar:**
1. Aba **Processamentos** → grelha: Mês/Ano, Estado (`rascunho`/`processado`/`anulado`), Data, Utilizador, Totais (bruto, IRS, SS, líquido)
2. **Ver detalhe** → abre grelha de funcionários desse processamento
3. **Reprocessar** (se `anulado`) → refaz cálculos com parâmetros atuais

---

### 3.15 Recibos e Pagamentos — Recibos

**Objetivo:** Emitir recibos de vencimento (PDF) e registar impressão/entrega.

**Como usar:**
1. Aba **Recibos** → filtros: Mês/Ano, Funcionário, Estado (`emitido`, `impresso`, `entregue`)
2. **Emitir recibos** → botão gera PDFs em lote para todos os funcionários do processamento `processado`
3. **Imprimir** → abre PDF, regista `AuditLog` `imprimir` no recibo
4. **Entregar** → marca `entregue`, data, assinatura digital (opcional)
5. **Reemitir** → cancela anterior, gera novo com numeração própria

**Numeração:** Sequência própria por empresa/ano (`REC/2026/0001`)

---

### 3.16 Recibos e Pagamentos — Pagamentos

**Objetivo:** Gerar ordens de pagamento (transferência bancária) e registar pagamentos efetuados.

**Como usar:**
1. Aba **Pagamentos** → **Ordens de pagamento** (geradas ao submeter processamento)
   - Estado: `pendente`, `autorizado`, `pago`, `rejeitado`
   - **Autorizar** → valida IBAN, valor > 0, cria ficheiro SEPA/ISO20022 (a implementar)
2. **Pagamentos** → registo manual de pagamento (se não via SEPA):
   - Ordem de pagamento, Data, Valor, Referência bancária, Comprovativo
   - Atualiza ordem para `pago`, `AuditLog` `pagar`

---

### 3.17 Obrigações Declarativas

**Objetivo:** (Placeholder) Entrega de declarações mensais/anuais (DMR, Modelo 10, etc.) — a implementar.

**Estado atual:** Mostra aviso "Fase futura — funcionalidade em desenvolvimento"

---

### 3.18 Configuração RH

**Abas (5 sub-abas):**

| Sub-aba | Descrição |
|---------|-----------|
| **Departamentos** | CRUD departamentos (código, designação, responsável, centro de custo padrão) |
| **Cargos** | CRUD cargos (código, designação, nível, salário base mínimo/máximo) |
| **Rubricas** | Verbas de processamento: código, designação, tipo (`vencimento`/`subsidio`/`desconto`/`retencao`), base cálculo, contabilidade (chave `CHAVES_CONTA`) |
| **Tipos de Ausência** | Catálogo: código, designação, desconta salário?, paga subsídio?, exige comprovativo?, cor no calendário |
| **Tabelas IRT** | Tabelas anuais de retenção IRS: ano, escalões (limite, taxa, parcela a abater), deduções por dependente/deficiência |
| **Parâmetros Fiscais** | Taxas SS (empregado/empregador), tectos, salário mínimo, subsídio refeição diário, km/viatura |
| **Configuração Geral** | Dias úteis mês, arredondamentos, numerações (recibos, ordens), integração contabilidade (diários, contas padrão) |

**Como usar:** Cada sub-aba tem grelha + **Novo/Editar/Remover** padrão.

---

### 3.19 Auditoria RH

**Objetivo:** Log de auditoria filtrado para `modulo='rh'` (herda do motor de auditoria global).

**Filtros:**
- Entidade, Entidade ID, Utilizador, Ação, Severidade, **Módulo** (`rh`), Data início/fim, Incluir arquivados
- Paginação por cursor (50 por página)

**Como usar:**
1. Aba **Auditoria** (em Configuração) → preencha filtros → **Recarregar**
2. Grelha: Data/hora, Entidade, Ação, Severidade, Utilizador, Descrição
3. **Ver detalhe** → JSON `dadosAnteriores` / `dadosNovos`
4. **Verificar integridade** → valida hash chain do log
5. **Resumo** → contagens por ação/severidade

**Ações RH auditadas:** `criar`, `actualizar`, `eliminar`, `submeter`, `anular`, `pagar`, `imprimir`, `conciliar`, `desconciliar`, `apurar`, `fechar`, `reabrir`, `estornar`

---

### 3.20 Importação CSV de Funcionários

**Objetivo:** Carregar múltiplos funcionários de uma vez via ficheiro CSV.

**Formato CSV (cabeçalho obrigatório):**
```csv
nome,nif,bi,data_nascimento,sexo,estado_civil,nacionalidade,email,telefone,iban,data_admissao,departamento,cargo,categoria,salario_base,horario,tipo_contrato
```

**Como usar:**
1. Aba **Funcionários** → botão **Importar CSV**
2. **Selecionar ficheiro** → **Pré-visualizar** (mostra primeiras 10 linhas, validações)
3. Erros: linhas inválidas destacadas com mensagem
4. **Importar** → cria funcionários em lote (transação única)
5. Relatório final: `importados`, `erros`, `ignorados` (duplicados NIF/BI)

**Validações na pré-visualização:**
- NIF/BI únicos (BD + dentro do CSV)
- Datas válidas, salário ≥ mínimo
- Departamento/Cargo devem existir na empresa

---

## 4. Permissões e Perfis

| Perfil | Finanças | RH |
|--------|----------|-----|
| **Administrador** | Tudo (inclui seed, reabrir períodos, configuração) | Tudo |
| **Contabilista** | Lançamentos, reconciliação, relatórios, fecho, IVA, resultados, demonstrações | Leitura (consulta funcionários, processamentos) |
| **Tesoureiro** | Contas bancárias, sessões caixa, reconciliação, pagamentos | — |
| **Gestor RH** | — | Tudo RH (exceto configuração avançada) |
| **Processador Salarial** | — | Processamento, Simulação, Recibos, Pagamentos, Alterações mensais |
| **Utilizador Comum** | Consulta relatórios, lançamentos próprios | Consulta ficha própria, recibos próprios |

**Ações sensíveis (exigem `approve`):**
- Reabrir período contabilístico
- Reabrir exercício fiscal
- Anular processamento salarial
- Eliminar contas/mapeamentos/estruturas

---

## 5. Boas Práticas e Fluxos Recomendados

### 5.1 Início de Ano (Janeiro)
1. **Finanças** → **Seed contabilidade** (se empresa nova)
2. **Finanças** → **Períodos** → verificar 12 períodos criados no exercício
3. **RH** → **Configuração** → atualizar **Tabelas IRT** e **Parâmetros Fiscais** do ano
4. **RH** → **Configuração** → rever **Rubricas**, **Tipos de Ausência**, **Departamentos/Cargos**
5. **Finanças** → **Mapeamentos** → confirmar 23 chaves mapeadas para contas certas

### 5.2 Mensal (Dia 1–5 do mês seguinte)
1. **Finanças** → **Reconciliação** → conciliar todas as contas bancárias
2. **Finanças** → **Regras / Erros** → reprocessar erros de integração pendentes
3. **RH** → **Processamento** → **Simular** mês anterior → conferir totais
4. **RH** → **Processamento** → **Processar** (submeter)
5. **RH** → **Recibos** → **Emitir** → **Imprimir/Entregar**
6. **RH** → **Pagamentos** → **Autorizar** ordens → gerar SEPA / registar pagamentos
7. **Finanças** → **Fecho** → executar fecho mensal (checklist 7 passos)
8. **Finanças** → **IVA** → apuramento IVA (se regime mensal) → pagamento
9. **Finanças** → **Relatórios** → gerar Balancete, Razão para arquivo

### 5.3 Trimestral (IVA regime trimestral)
- Meses 3, 6, 9, 12: apuramento IVA trimestral (mesmo processo mensal)

### 5.4 Anual (Dezembro / Janeiro)
1. **Finanças** → **Resultados** → **Apuramento de resultados** (depois de todos os meses fechados)
2. **Finanças** → **Resultados** → **Fecho anual** → **Encerrar exercício**
3. **Finanças** → **Resultados** → **Fecho anual** → **Abrir exercício seguinte**
4. **Finanças** → **Demonstrações** → gerar Balanço, DR, Fluxos, Capital Próprio do ano findo
5. **RH** → **Configuração** → preparar Tabelas IRT e Parâmetros do ano novo
6. **RH** → **Processamento** → processar Janeiro do ano novo

---

## 6. Resolução de Problemas Comuns

| Problema | Causa Provável | Solução |
|----------|----------------|---------|
| "Conta não aceita movimento" ao lançar | Conta é agregação (tem filhas) | Use conta folha (último nível) ou desmarque `aceitaMovimento` na pai |
| "Débito ≠ Crédito" ao validar | Linhas não batem | Verifique valores; use `TOTAL`/`NET`/`TAX` nas regras para evitar erros manuais |
| "Período não está aberto" | Período `fechado`/`bloqueado` | Reabra período (precisa `approve`) ou use período correto |
| "Mapeamento em falta: VAT_OUTPUT" | Seed não corrido ou conta 3422 apagada | Corra **Semear contabilidade** ou crie conta 3422 e mapeie |
| "Erro de integração: CUSTOMER_ACCOUNT" | Cliente sem conta corrente definida | Configure `CUSTOMER_ACCOUNT` no mapeamento (conta 311) |
| Fecho mensal bloqueado em "IVA" | Apuramento IVA não feito ou em rascunho | Vá à aba IVA → execute apuramento → valide |
| "Não é possível reabrir exercício" | Exercício N+1 tem lançamentos além da abertura | Estorne/elimine lançamentos extra em N+1 antes de reabrir |
| Processamento salarial dá IRS errado | Tabelas IRT do ano não carregadas | Configuração → Tabelas IRT → importe/insira escalões do ano |
| Recibo não gera PDF | Processamento não está `processado` | Submeta processamento primeiro |
| "Conta 3423 não existe" no pagamento IVA | Seed parcial | Corra seed completo ou crie conta 3423 (`VAT_PAYABLE`) |

---

## Anexos

### A. Códigos de Erro do Motor (`CODIGOS_ERRO_MOTOR`)
| Código | Significado |
|--------|-------------|
| `MAPEAMENTO_AUSENTE` | Chave de conta não mapeada na empresa |
| `CONTA_INEXISTENTE` | Conta do mapeamento não existe na empresa |
| `CONTA_SEMO_MOVIMENTO` | Conta mapeada não `aceitaMovimento` |
| `EXPRESSAO_INVALIDA` | Expressão de valor não reconhecida |
| `VALOR_NULO` | Expressão devolveu null/0 quando era obrigatório |
| `DOCUMENTO_SEM_LINHAS` | Documento de origem sem linhas para contabilizar |
| `TAXA_IVA_DESCONHECIDA` | `TAX:XX` com taxa não configurada |
| `REGRA_INATIVA` | Regra existe mas `activa=false` |
| `EMPRESA_DIVERGENTE` | Documento de empresa diferente da regra |
| `IDADEMPOTENCIA_DUPLICADA` | Mesma (modulo, tipo, origemId, origem) já processada |
| `LANCAMENTO_DESQUILIBRADO` | Soma débito ≠ soma crédito nas linhas geradas |
| `PERIODO_FECHADO` | Período do documento não está aberto |

### B. Estrutura de Ficheiros de Seed
```
prisma/data/pgc-angola.json          → 160 contas PGC
src/main/services/contabilidade-seed.service.ts
  ├─ CONTAS_PGC (importado do JSON)
  ├─ DIARIOS_PADRAO (8 diários)
  ├─ MAPEAMENTOS_PADRAO (23 chaves)
  ├─ MAPEAMENTOS_LEGADOS (renomeação PT→EN)
  └─ semearEstruturasPadrao() (4 demonstrações)
```

### C. Atalhos de Teclado (UI)
| Ação | Atalho |
|------|--------|
| Nova conta / diário / lançamento | `Ctrl+N` |
| Gravar formulário | `Ctrl+S` |
| Fechar diálogo | `Esc` |
| Pesquisa global | `Ctrl+K` |
| Actualizar grelha | `F5` |
| Alternar aba (Finanças) | `Ctrl+1…9` |

---

**Fim do Guia**  
*Documento gerado automaticamente a partir da implementação do DoraERP — Novembro 2026*