# 01 — Especificação Técnica: Módulo de Recursos Humanos

**Estado:** Rascunho v1 · **Âmbito:** Salários e Honorários (fase 1) · **Mercado:** Angola (AOA)

---

## 1. Objectivo

Acrescentar ao ERP existente (Vendas, Finanças, Compras, Stock, Comercial) um módulo de **Recursos Humanos** que permita ao departamento de RH:

- Criar e manter a **ficha do funcionário/independente**;
- Executar **processamentos salariais** (automático e manual; individual e em lote);
- Emitir **recibos** e gerir **pagamentos**;
- Registar **alterações mensais**, **subsídios** (férias e natal), **férias, ausências, penhoras e dívidas**;
- Garantir **cálculo correcto de IRT e INSS** e integração contabilística/financeira com os módulos existentes.

### 1.1 Origem dos requisitos
Reunião com RH + capturas de ecrã do sistema de referência (menu *ribbon*, ecrã Processamento, slides "Recursos Humanos" e "Tipos de processamentos").

Funcionalidades enumeradas pelo RH:
1. Criação da ficha do funcionário/independente
2. Processamentos automático e manual
3. Recibos
4. Pagamentos
5. Registo de alterações mensais
6. Subsídio de natal
7. Subsídio de férias
8. Forma de pagamento de subsídios
9. Gestão de férias / penhoras / dívidas
10. Outras funcionalidades

### 1.2 Fora de âmbito (fase 1)
- Separadores *Capital Humano* (recrutamento, avaliação, formação) e *Obrigações Declarativas* (ficheiros oficiais AGT/INSS) — apenas placeholder de navegação.
- Grupos *Exploração* e *Recursos* — relatórios avançados em fase posterior.
- Integração com relógios de ponto biométricos.

## 2. Perfis e permissões

| Perfil | Pode |
|---|---|
| **Técnico de RH** | CRUD de funcionários, contratos, alterações mensais, ausências, férias; simular; processar |
| **Responsável de RH** | Tudo o anterior + anular processamentos, aprovar férias, fechar período, gerir dívidas/penhoras |
| **Tesouraria/Financeiro** | Ver processamentos, gerir **pagamentos**, ver recibos |
| **Administrador** | Configurar rubricas, parâmetros fiscais, permissões |
| **Auditor (leitura)** | Consultar tudo, sem escrita |

Permissões (formato `rh.<recurso>.<acção>`): `rh.funcionarios.{ver,criar,editar,inativar}`, `rh.contratos.{ver,gerir}`, `rh.alteracoes.{ver,gerir}`, `rh.processamento.{simular,processar,anular}`, `rh.recibos.{ver,emitir}`, `rh.pagamentos.{ver,gerir}`, `rh.assiduidade.{ver,gerir,aprovar}`, `rh.dividas.{ver,gerir}`, `rh.independentes.{ver,gerir,processar}`, `rh.config.{ver,editar}`, `rh.salarios.ver` (dado sensível: ver valores salariais).

## 3. Visão geral da arquitectura

```
Renderer (React + Zustand + shadcn + RHF/Zod)
   │  window.api.rh.*  (contextBridge, tipado)
Preload
   │  ipcRenderer.invoke('rh:<recurso>:<acção>', payload)
Main
   ├─ ipc/rh/*            valida com Zod, autoriza (permissões), delega
   ├─ modules/rh/*/service    regras de negócio + transacções
   ├─ modules/rh/*/repository  Prisma
   └─ modules/rh/processamento/engine   motor PURO de cálculo
Prisma → BD do ERP (modelos Rh*)
```

- **Canal IPC**: nomenclatura `rh:<recurso>:<acção>` (ex.: `rh:processamento:processar`, `rh:funcionarios:listar`).
- **Contrato**: input e output definidos em `shared/rh/schemas`.
- **Tarefas longas** (lote): o `main` emite eventos de progresso `rh:processamento:progresso` (`webContents.send`) e o renderer actualiza uma barra; o resultado final é devolvido por `invoke`.
- **Concorrência**: um lote por período/tipo de cada vez (lock lógico por `periodoId + tipo`).

## 4. Requisitos funcionais

### 4.1 Funcionários e Independentes (RF-FUN)
- **RF-FUN-01** Criar/editar/inactivar ficha com: código sequencial (`001`, `002`…), nome, BI/passaporte, NIF, nº INSS, data de nascimento, género, estado civil, nacionalidade, morada, contactos, dependentes, habilitações, **departamento, cargo, categoria**, data de admissão, estado (Activo/Suspenso/Inactivo/Cessado), **dados bancários** (banco, IBAN), forma de pagamento.
- **RF-FUN-02** Dependentes (nome, parentesco, data de nascimento) — para eventual dedução/abonos.
- **RF-FUN-03** Documentos anexos (BI, contrato, foto) — guardar caminho/ficheiro conforme mecanismo existente.
- **RF-FUN-04** Código do funcionário é único por empresa e gerado por sequência configurável.
- **RF-FUN-05** Não eliminar funcionário com movimentos; apenas inactivar/cessar.
- **RF-FUN-06** Pesquisa por código, nome, NIF, BI, departamento, estado.
- **RF-IND-01** Ficha de **Independente** (prestador de serviços): nome, NIF, contactos, IBAN, regime/retenção aplicável.
- **RF-IND-02** **Actividades** do independente (descrição, valor/hora ou valor fixo, período, centro de custo).

### 4.2 Gestão Contratual (RF-CON)
- **RF-CON-01** Contrato por funcionário: tipo (prazo indeterminado, a prazo certo, estágio, experiência…), data início/fim, **salário base**, moeda, carga horária semanal, local, categoria.
- **RF-CON-02** Histórico de contratos/adendas; apenas **um contrato activo** por funcionário.
- **RF-CON-03** Alterações salariais (promoção/aumento) com data de efeito; o processamento usa o valor **vigente na data**.
- **RF-CON-04** Cessação: data, motivo (termo, demissão, despedimento, mútuo acordo, reforma, morte…), dispara elegibilidade para **Fim de Contrato**.
- **RF-CON-05** Alerta de contratos a terminar nos próximos N dias.

### 4.3 Rubricas e Alterações Mensais (RF-RUB / RF-ALT)
- **RF-RUB-01** Catálogo de **rubricas**: código, descrição, tipo (**Remuneração / Desconto / Encargo patronal**), natureza (fixa/variável), **incidências** (sujeita a IRT? a INSS?), isenção parcial (limite), forma de cálculo (valor fixo, % do salário base, valor×quantidade, fórmula do sistema), ordem de impressão no recibo, activa.
- **RF-RUB-02** Rubricas de sistema pré-carregadas (seed) e não elimináveis: Salário base, Subsídio de alimentação, Subsídio de transporte, Subsídio de férias, Subsídio de natal, Horas extra, Faltas, INSS trabalhador, IRT, Penhora, Adiantamento, etc.
- **RF-RUB-03** **Rubricas recorrentes por funcionário** (ex.: subsídio de renda fixo, com data início/fim).
- **RF-ALT-01** **Alterações mensais**: lançar por funcionário/mês rubrica + quantidade/valor (ex.: prémio, comissão, desconto pontual); em lote (importar de folha) ou individual.
- **RF-ALT-02** Estado da alteração: Pendente → Aplicada (após processamento) → Anulada. Alteração aplicada fica **bloqueada**.
- **RF-ALT-03** Copiar alterações do mês anterior (opção).

### 4.4 Assiduidade (RF-ASS)
- **RF-ASS-01** **Ausências**: tipo (falta justificada/injustificada, doença, licença, maternidade/paternidade, luto, casamento…), datas, nº dias/horas, **desconta salário? (S/N)**, **desconta subsídio de alimentação? (S/N)**, anexo/justificativo, aprovação.
- **RF-ASS-02** **Horas extra** (data, horas, tipo: diurna dia útil, nocturna, descanso/feriado, percentagem aplicável configurável).
- **RF-ASS-03** **Marcação de férias**: direito anual (padrão 22 dias úteis, configurável), saldo (direito, gozados, marcados, transitados), pedido → aprovação → gozo; sobreposição entre colaboradores do mesmo departamento gera aviso.
- **RF-ASS-04** Férias gozadas alimentam o cálculo do **subsídio de férias** e do **fim de contrato** (dias não gozados).
- **RF-ASS-05** **Afetações**: imputar funcionário a centros de custo/projectos com percentagem (soma = 100% por data), com período de vigência. Usado no rateio de custos em Finanças.
- Só ausências/horas extra com data **≤ "Faltas/H.Extra"** do ecrã de processamento entram no período.

### 4.5 Processamento (RF-PRO) — núcleo
Ver §5 (regras) e §6 (UI).
- **RF-PRO-01** Tipos: **Vencimento, Subsídio de Férias, Subsídio de Natal, Remuneração Extraordinária, Fim de Contrato**; combináveis na mesma execução (ver matriz §5.1).
- **RF-PRO-02** Modos: **Individual** e **Em Lote** (ver §5.1).
- **RF-PRO-03** **Processamento automático** (motor calcula tudo a partir de contrato, rubricas recorrentes, alterações, ausências, horas extra, dívidas) e **manual** (o utilizador ajusta/insere rubricas e valores antes de confirmar — o item fica marcado `origem = MANUAL`).
- **RF-PRO-04** **Simulação**: mesmo cálculo, **sem persistir**, com ecrã de resultado e exportação.
- **RF-PRO-05** **Anulação** de processamentos (individual ou lote), com motivo; reverte efeitos secundários (alterações → pendentes, prestações de dívida → pendentes, recibo → anulado, lançamento contabilístico estornado) e **bloqueia** se já existir pagamento efectuado (exige anular pagamento antes).
- **RF-PRO-06** **Visualização detalhada** dos valores processados (por rubrica, com bases de incidência e escalão de IRT aplicado) — individual.
- **RF-PRO-07** **Visualização dos processamentos efectuados** (histórico por funcionário/período/tipo/estado) — individual.
- **RF-PRO-08** **Restrições**: antes de processar, validar e listar bloqueios (sem contrato activo, já processado no período, período fechado, IBAN em falta se pagamento por transferência, funcionário suspenso, contrato terminado sem a flag "processar com fim de contrato"…).
- **RF-PRO-09** **Taxas de câmbio**: salários/rubricas em moeda estrangeira são convertidos à taxa do dia/período; a taxa usada é gravada no processamento.
- **RF-PRO-10** **Retroactivos**: lançar diferenças de períodos anteriores (ex.: aumento aplicado com atraso) como rubrica no período corrente.
- **RF-PRO-11** **Períodos**: abrir/fechar período (`P01`…`P12` mensais). Período fechado não aceita processar/anular.
- **RF-PRO-12** Resultado do lote: relatório por funcionário (sucesso/erro/aviso) exportável.

### 4.6 Subsídios (RF-SUB)
- **RF-SUB-01** **Subsídio de Natal**: percentagem do salário base (padrão 50%, parametrizável), **proporcional** ao tempo de serviço no ano quando aplicável.
- **RF-SUB-02** **Subsídio de Férias**: percentagem do salário base (padrão 50%, parametrizável), proporcional aos dias de férias gozados/marcados.
- **RF-SUB-03** **Forma de pagamento dos subsídios** (configurável por empresa e sobrescrevível por funcionário):
  - Subsídio de Natal: *Pago de uma vez em mês definido* · *Fraccionado em duodécimos mensais*.
  - Subsídio de Férias: *Pago antes do gozo* · *Pago em mês fixo* · *Fraccionado em duodécimos mensais*.
- **RF-SUB-04** Se fraccionado, o duodécimo entra como rubrica no **Vencimento** de cada mês; os tipos "Subsídio de Natal/Férias" só liquidam o remanescente.
- **RF-SUB-05** Incidência de IRT/INSS dos subsídios segue a configuração da rubrica (parametrizável).

### 4.7 Dívidas, Penhoras e Adiantamentos (RF-DIV)
- **RF-DIV-01** **Processo de dívida** (tipos: *Adiantamento*, *Empréstimo*, *Penhora*, *Outro*): valor total, nº prestações, valor da prestação, data de início, credor (para penhora), estado.
- **RF-DIV-02** Geração automática do **plano de prestações**; cada processamento de Vencimento desconta a prestação do mês e actualiza o saldo.
- **RF-DIV-03** **Penhora**: respeita limite máximo legal do desconto sobre o salário líquido (parametrizável); se exceder, desconta o máximo e deixa remanescente.
- **RF-DIV-04** Liquidação antecipada e suspensão com registo.
- **RF-DIV-05** Em **Fim de Contrato**, saldo de dívidas pode ser descontado (com confirmação).

### 4.8 Recibos (RF-REC)
- **RF-REC-01** Recibo de vencimento gerado por processamento confirmado: cabeçalho da empresa, dados do funcionário, período, rubricas (remunerações, descontos), bases (IRT, INSS), líquido, líquido por extenso (opcional), assinatura.
- **RF-REC-02** **Numeração sequencial** por série/ano, sem falhas; anulação gera estado "Anulado", nunca reutiliza número.
- **RF-REC-03** Emissão em **PDF** e impressão (individual e em lote); reimpressão regista contador.
- **RF-REC-04** Pesquisa por funcionário/período/tipo/estado.

### 4.9 Pagamentos (RF-PAG)
- **RF-PAG-01** Cada processamento confirmado gera um **pagamento pendente** (valor = líquido).
- **RF-PAG-02** Formas: **Transferência bancária**, **Numerário**, **Cheque**; agrupar em **ordem/lote de pagamento** por banco com **ficheiro de transferência** (formato a validar com o banco — ver §13).
- **RF-PAG-03** Estados: Pendente → Pago → (Estornado). Registar data, conta de origem (Finanças), referência.
- **RF-PAG-04** Pagamento gera **movimento de tesouraria** em Finanças; estorno gera movimento inverso.
- **RF-PAG-05** Pagamento parcial permitido (saldo em aberto).
- **RF-PAG-06** Pagamento de honorários a independentes segue o mesmo fluxo.

### 4.10 Honorários (RF-HON)
- **RF-HON-01** Processar honorários por independente/actividade/período: valor bruto, **retenção na fonte** (taxa parametrizável por tipo), valor líquido.
- **RF-HON-02** Emitir comprovativo/recibo de honorários e gerar pagamento.
- **RF-HON-03** Anulação com as mesmas regras do RF-PRO-05.

### 4.11 Outras funcionalidades (RF-OUT)
- Mapas/relatórios básicos: folha de vencimentos por período, resumo IRT, resumo INSS, mapa de férias, mapa de ausências, dívidas em aberto, custo por departamento.
- Exportação **CSV/Excel/PDF** das listagens.
- Auditoria consultável por funcionário/processamento.

## 5. Regras de negócio

### 5.1 Matriz Individual × Em Lote

| Capacidade | Individual | Em Lote |
|---|:-:|:-:|
| Nº de funcionários | 1 | N |
| Vencimento | ✔ | ✔ |
| Subsídio de Natal | ✔ | ✔ |
| Subsídio de Férias | ✔ | ✔ |
| Remuneração Extraordinária | ✔ | ✔ |
| **Fim de Contrato** | ✔ | ✘ *(apenas individual)* |
| Anulação | ✔ | ✔ |
| Visualização detalhada dos valores | ✔ | — (por funcionário a partir do relatório) |
| Visualização dos processamentos efectuados | ✔ | ✔ (histórico/relatório do lote) |

> Nota: no ecrã de referência a checkbox "Fim de Contrato" e "Processar funcionários com data de fim de contrato" existem; em **lote**, a primeira fica **desactivada**. A segunda permite **incluir** funcionários cujo contrato terminou no período (para processar o último vencimento proporcional).

### 5.2 Algoritmo do Vencimento (ordem de cálculo)
Para cada funcionário elegível e período `(ano, mês)`:

1. **Obter contrato vigente** (salário base, moeda). Converter para AOA se necessário (taxa do processamento).
2. **Dias a processar** = `diasProc` do ecrã (padrão: configurável 30 ou dias úteis do mês). **Valor diário** = `salarioBase / baseDiasMes` (parâmetro, padrão 30). Admissão/cessação no mês ⇒ **proporcional**.
3. **Remunerações fixas**: salário base (proporcional se `diasProc` < base) + rubricas recorrentes activas no mês.
4. **Remunerações variáveis**: alterações mensais pendentes do período + **horas extra** (até data H.Extra) + retroactivos.
5. **Descontos de assiduidade**: ausências (até data de Faltas) com `descontaSalario` → `diasFalta × valorDiario`; idem subsídio de alimentação, se configurado.
6. **Bases de incidência**:
   - `baseINSS` = Σ rubricas com `incideINSS` (considerando isenções/limites).
   - `inssTrabalhador` = `baseINSS × taxaTrabalhador` (parâmetro; ex.: 3%).
   - `inssPatronal` = `baseINSS × taxaPatronal` (parâmetro; ex.: 8%) → **encargo**, não aparece como desconto do trabalhador.
   - `baseIRT` = Σ rubricas com `incideIRT` (parte tributável) − `inssTrabalhador` (se a lei o prever) .
7. **IRT** pelo **escalão** da tabela vigente (`RhEscalaoIRT`): `IRT = parcelaFixa + (baseIRT − excesso) × taxa`. Gravar escalão aplicado.
8. **Outros descontos**: prestações de dívida/penhora/adiantamento (respeitando limite de penhora), descontos manuais.
9. **Líquido** = Σ remunerações − faltas − INSS trabalhador − IRT − outros descontos. **Líquido < 0** ⇒ erro de restrição (não grava) ou desconto limitado (configurável).
10. Persistir `RhProcessamento` + `RhProcessamentoItem[]` + marcar alterações/prestações aplicadas + gerar recibo + gerar pagamento pendente + lançamento contabilístico, **tudo na mesma transacção**.

> ⚠ **Valores legais (taxas INSS, escalões e isenções de IRT, limite de penhora, % de subsídios, dias de férias)** são **parâmetros com data de vigência**, carregados por seed e editáveis por Administrador. **Não hard-code.** O RH/jurídico deve validar os valores iniciais (ver §13).

### 5.3 Subsídio de Natal
`subNatal = salarioBase × pctNatal × (mesesServicoNoAno / 12)`
- `mesesServicoNoAno` = 12 se admitido antes de 1 Jan; caso contrário proporcional (dias/365 ou meses completos — parâmetro).
- Se **fraccionado**: duodécimos já pagos nos Vencimentos são abatidos.
- Sujeição a IRT/INSS conforme rubrica.

### 5.4 Subsídio de Férias
`subFerias = salarioBase × pctFerias × (diasFeriasGozadosOuMarcados / diasDireito)`
- Origem dos dias: `RhMarcacaoFerias` aprovadas no ano.
- Não pode ser processado duas vezes para a mesma marcação.

### 5.5 Remuneração Extraordinária
- Rubricas pontuais (prémios, bónus, gratificações), introduzidas como **alterações mensais com natureza extraordinária** ou manualmente no processamento.
- Tributada conforme a rubrica (muitas vezes **IRT por acumulação** com o vencimento do mês — parâmetro `extraordinarioAcumulaIRT`).

### 5.6 Fim de Contrato (apenas individual)
Componentes (cada um **opcional/ajustável** antes de confirmar):
1. **Saldo de salário** do último mês (dias trabalhados).
2. **Férias vencidas não gozadas** (+ subsídio de férias correspondente).
3. **Proporcionais** do ano da cessação: férias, subsídio de férias, subsídio de natal.
4. **Indemnização/compensação** (quando aplicável ao motivo da cessação — valor manual ou fórmula parametrizada).
5. **Dívidas/penhoras** em aberto (opcional descontar).
6. Efeitos: contrato → `ENCERRADO`, funcionário → `CESSADO`, bloqueia novos processamentos regulares.

### 5.7 Anulação
- Permitida se: período **aberto** e **sem pagamento efectuado** (ou com pagamento já estornado).
- Efeitos (transaccional): processamento → `ANULADO` (mantém dados), recibo → `ANULADO`, pagamento pendente → `CANCELADO`, alterações → `PENDENTE`, prestações de dívida → `PENDENTE` (saldo reposto), subsídios fraccionados repostos, lançamento contabilístico **estornado**.
- Motivo obrigatório + auditoria.
- Anular um **Fim de Contrato** reabre contrato/funcionário se não houver outro registo posterior.

### 5.8 Unicidade e idempotência
Para `(funcionárioId, periodoId, tipo)` só pode existir **um processamento em estado `PROCESSADO`**. `ANULADO` não conta. Exceção: `EXTRAORDINARIO` permite **múltiplos** com `sequencia` incremental.

### 5.9 Arredondamentos e precisão
- `Decimal` (≥ 18,4 na BD; arredondamento a 2 casas half-up por rubrica na apresentação/persistência).
- Percentagens guardadas com 4 casas.
- Total do recibo = Σ itens arredondados (sem recalcular a partir de totais).

## 6. Requisitos de interface

Ver `AGENTS.md §6` para navegação e ecrã de Processamento. Ecrãs previstos:

| Ecrã | Rota sugerida | Notas |
|---|---|---|
| Funcionários (lista + ficha) | `/rh/funcionarios` | Tabs: Dados pessoais · Contrato · Bancário · Dependentes · Rubricas fixas · Subsídios · Documentos |
| Alterações Mensais | `/rh/alteracoes-mensais` | Filtro ano/mês; edição em grelha |
| **Processamento** | `/rh/processamento` | Ver AGENTS §6.2 |
| Simulação | `/rh/simulacao` | Mesmo ecrã em modo "não grava" |
| Processamentos efectuados | `/rh/processamentos` | Histórico + visão detalhada + anular |
| Recibos | `/rh/recibos` | Lista, PDF, impressão em lote |
| Pagamentos | `/rh/pagamentos` | Pendentes, lote por banco, confirmar pagamento |
| Marcação de Férias | `/rh/ferias` | Calendário + saldos |
| Ausências | `/rh/ausencias` | Lista + formulário |
| Afetações | `/rh/afetacoes` | Funcionário × centro de custo |
| Gestão Contratual | `/rh/contratos` | Histórico, alterações salariais, cessação |
| Processos de Dívida | `/rh/dividas` | Planos de prestação |
| Retroativos | `/rh/retroativos` | |
| Independentes / Atividades / Proc. Honorários / Pagamentos | `/rh/independentes/*` | |
| Configuração | `/rh/config` | Rubricas, períodos, parâmetros fiscais, tipos de ausência, subsídios |

## 7. Contratos IPC (resumo)

| Canal | Input (Zod) | Output |
|---|---|---|
| `rh:funcionarios:listar` | `FuncionarioFiltroSchema` | `Paginado<FuncionarioResumo>` |
| `rh:funcionarios:criar/editar` | `FuncionarioInputSchema` | `Funcionario` |
| `rh:processamento:preparar` | `PrepararProcessamentoSchema` (ano, periodo, tipos[], flags) | `{ elegiveis[], restricoes[] }` |
| `rh:processamento:simular` | `ProcessarSchema` | `ResultadoCalculo[]` (sem gravar) |
| `rh:processamento:processar` | `ProcessarSchema` (+ `funcionarioIds[]`, `modo`) | `ResultadoLote` |
| `rh:processamento:anular` | `AnularSchema` (ids[], motivo) | `ResultadoLote` |
| `rh:processamento:detalhe` | `{ processamentoId }` | `ProcessamentoDetalhe` |
| `rh:processamento:historico` | `HistoricoFiltroSchema` | `Paginado<ProcessamentoResumo>` |
| `rh:processamento:progresso` *(evento)* | — | `{ total, feitos, funcionarioId, estado }` |
| `rh:recibos:gerarPdf` | `{ processamentoIds[] }` | caminho/buffer |
| `rh:pagamentos:gerarLote` / `confirmar` / `estornar` | … | … |
| `rh:ferias:marcar` / `aprovar` | … | … |
| `rh:config:*` | … | … |

Esboço dos schemas centrais:

```ts
// shared/rh/schemas/processamento.ts
export const TipoProcessamentoEnum = z.enum([
  'VENCIMENTO','SUBSIDIO_FERIAS','SUBSIDIO_NATAL','EXTRAORDINARIO','FIM_CONTRATO',
]);

export const ProcessarSchema = z.object({
  operacao: z.enum(['PROCESSAR','ANULAR']).default('PROCESSAR'),
  modo: z.enum(['INDIVIDUAL','LOTE']),
  tipos: z.array(TipoProcessamentoEnum).min(1),
  incluirFimContrato: z.boolean().default(false), // "Processar funcionários com data de fim de contrato"
  ano: z.number().int().min(2000).max(2100),
  periodoCodigo: z.string().regex(/^P\d{2}$/),    // P01..P12
  mes: z.number().int().min(1).max(12),
  diasProcessados: z.number().int().min(0).max(31),
  dataProcessamento: z.coerce.date(),
  dataLimiteFaltasHE: z.coerce.date(),
  funcionarioIds: z.array(z.string()).min(1),
  ajustesManuais: z.array(AjusteManualSchema).optional(), // processamento manual
}).refine(v => !(v.modo === 'LOTE' && v.tipos.includes('FIM_CONTRATO')),
  { message: 'Fim de Contrato só pode ser processado individualmente', path: ['tipos'] })
 .refine(v => v.modo === 'LOTE' || v.funcionarioIds.length === 1,
  { message: 'Modo individual requer exactamente 1 funcionário', path: ['funcionarioIds'] });
```

## 8. Motor de cálculo — interface

```ts
// main/modules/rh/processamento/engine/types.ts
export interface EntradaCalculo {
  funcionario: { id: string; dataAdmissao: Date; dataCessacao?: Date };
  contrato: { salarioBase: Decimal; moeda: string; cargaHorariaSemanal: number };
  periodo: { ano: number; mes: number; diasProcessados: number; baseDiasMes: number };
  tipo: TipoProcessamento;
  taxaCambio?: Decimal;
  rubricasRecorrentes: RubricaAplicavel[];
  alteracoesMensais: RubricaAplicavel[];
  ausencias: AusenciaPeriodo[];
  horasExtra: HoraExtraPeriodo[];
  prestacoesDivida: PrestacaoPeriodo[];
  ferias?: { diasDireito: number; diasGozadosOuMarcados: number; naoGozados: number };
  config: {
    inss: { taxaTrabalhador: Decimal; taxaPatronal: Decimal };
    irt: EscalaoIRT[];
    subsidios: ConfigSubsidios;
    limitePenhora: Decimal;
  };
  ajustesManuais?: AjusteManual[];
}

export interface ResultadoCalculo {
  itens: ItemCalculado[];              // rubrica, tipo, quantidade, valor, origem, incidências
  totais: { remuneracoes: Decimal; descontos: Decimal; encargos: Decimal; liquido: Decimal };
  bases: { inss: Decimal; irt: Decimal };
  irt: { escalaoId: string; taxa: Decimal; parcelaFixa: Decimal; excesso: Decimal; valor: Decimal };
  avisos: string[];
  erros: string[];                     // impedem gravação
}
```

## 9. Segurança e conformidade
- Dados salariais restritos por permissão `rh.salarios.ver`; mascarar valores na UI quando sem permissão.
- Auditoria obrigatória em: criar/editar contrato, alterar salário, processar, anular, pagar, estornar, editar parâmetros fiscais.
- Logs **sem** dados sensíveis (NIF/IBAN/salários) em claro.
- Backup/restore segue o mecanismo do ERP; migrações nunca destrutivas sem backup.
- Proteção de dados pessoais (Lei de Protecção de Dados Pessoais de Angola): minimização, acesso por perfil, exportações registadas.

## 10. Requisitos não funcionais
- **Desempenho**: lote de 500 funcionários em ≤ 60 s num PC médio; listagens de 5 000 registos com paginação/virtualização fluida.
- **Fiabilidade**: transacção por funcionário; em falha, o resto do lote continua; nenhum estado parcial persistido.
- **Auditabilidade**: cada processamento guarda **snapshot** (JSON) dos parâmetros e bases usados (contrato, taxas, escalão) para reprodutibilidade.
- **Usabilidade**: teclado, mensagens de erro claras em pt-AO.
- **Testabilidade**: motor puro; ≥ 90% cobertura de ramos no motor.
- **Compatibilidade**: Windows 10/11 (primário); respeitar o que o ERP já suporta.
- **Offline**: funciona sem internet (taxas de câmbio inseridas manualmente ou vindas de Finanças).

## 11. Integração com Finanças (a confirmar na descoberta)
- Contas/caixa para pagamento → usar entidade existente de conta bancária.
- Contas contabilísticas (plano de contas): configurar mapeamento rubrica → conta (`RhRubrica.contaDebito/contaCredito` ou tabela de mapeamento) para: gastos com pessoal, INSS a pagar, IRT a pagar, remunerações a pagar, adiantamentos a funcionários.
- Ao **processar**: lançamento (D: Gastos com pessoal / C: Remunerações a pagar, INSS, IRT). Ao **pagar**: (D: Remunerações a pagar / C: Banco/Caixa). Anulação/estorno geram lançamentos inversos.
- Se Finanças ainda não expõe serviço para isto, criar **interface de integração** (`FinancasGateway`) no módulo RH com implementação *stub* e abrir tarefa específica.

## 12. Critérios de aceitação globais (MVP)
1. É possível criar funcionário, contrato e rubricas recorrentes.
2. Processar **Vencimento em lote** de um período com cálculo correcto de INSS e IRT (verificado por casos de teste fornecidos pelo RH).
3. Processar individualmente SubNatal, SubFérias, Extraordinário e Fim de Contrato.
4. Anular e reprocessar sem duplicações e sem perder histórico.
5. Gerar recibos PDF e pagamentos; confirmar pagamento actualiza Finanças.
6. Dívidas/penhoras descontam correctamente e actualizam saldos.
7. Ecrã Processamento fiel ao layout de referência (tipos, parâmetros, 3 separadores, grelha com selecção).

## 13. Perguntas em aberto (validar com RH/jurídico)
1. **Tabela de IRT e INSS em vigor** (escalões, isenções, taxas) — fornecer documento oficial para seed.
2. Base de dias do mês: **30 fixo** ou **dias úteis/calendário reais**?
3. Subsídios de férias e natal: percentagens e se são **sujeitos** a IRT/INSS integralmente.
4. IRT sobre extraordinários: **acumula** com o vencimento do mês ou tabela separada?
5. Dedução do INSS na base do IRT: aplicável?
6. Limite legal de **penhora** a aplicar.
7. Regras de **horas extra** (percentagens, limites mensais/anuais).
8. Cálculo de **indemnização** em fim de contrato por motivo.
9. **Formato do ficheiro de transferência** exigido pelos bancos usados.
10. Layout exacto do **recibo** (modelo actual do RH).
11. Multi-empresa/multi-filial? Multi-moeda real (USD) nos salários?
12. Existem **rubricas por convenção colectiva/categoria** (tabela salarial)?
13. Qual a **política de arredondamento** do RH (por rubrica ou no total)?
14. O ERP existente já guarda **plano de contas** e **centros de custo**? Qual o nome das entidades?
