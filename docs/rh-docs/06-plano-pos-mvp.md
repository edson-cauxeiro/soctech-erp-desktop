# 06 — Plano Pós-MVP (Capital Humano, Obrigações Declarativas, Relógio de Ponto)

> **Estado:** planeamento. Nada do que está neste documento está implementado.
> As três áreas estão fora do MVP por decisão registada em
> `01-especificacao-tecnica.md` §1 (os separadores *Capital Humano* e
> *Obrigações Declarativas* existem na UI como placeholder de navegação).
>
> **Onde estão as tarefas:** `03-tasks.md`, secção `FASE 9 — Pós-MVP` (`RH-9xx`).
> **Modelo de dados canónico:** os modelos abaixo são acrescentados ao
> `prisma/schema.prisma` e documentados em `04-modelo-de-dados.md` na altura da
> implementação, não antecipadamente.

---

## 1. Âmbito

| Área | O que cobre | Bloco de tarefas |
|---|---|---|
| **A. Obrigações Declarativas** | Declaração mensal de remunerações e guia de pagamento ao INSS; declaração mensal de IRT à AGT; declarações anuais | `RH-901`…`RH-907` |
| **B. Relógio de Ponto** | Importação por ficheiro das picagens do relógio e conciliação com a assiduidade existente | `RH-911`…`RH-915` |
| **C. Capital Humano** | Recrutamento, avaliação de desempenho e formação | `RH-921`…`RH-927` |

**Fora de âmbito** (continuam no *backlog*): grupos *Exploração* e *Recursos*,
portal de auto-serviço do funcionário e comissões de vendas como rubrica.
Também fora de âmbito: a submissão eletrónica das declarações a portais externos
(o sistema gera o ficheiro; a submissão é feita pelo operador no portal).

---

## 2. Princípios

1. **Não duplicar dados.** As Declarativas leem os processamentos já gravados; o
   Ponto lê e alimenta a assiduidade existente; o Recrutamento reaproveita os
   cadastros de departamentos, cargos e funcionários.
2. **Reutilizar o motor.** Nada aqui recalcula IRT ou INSS. Os valores vêm de
   `RhProcessamento` / `RhProcessamentoItem`, que já guardam bases e impostos por
   funcionário e período.
3. **Layouts oficiais parametrizáveis e versionados.** As tabelas e os formatos
   oficiais mudam; nenhum layout é codificado em duro.
4. **RBAC e auditoria desde a primeira tarefa de cada área.** Nenhuma área entra
   em produção sem permissões finas e registo de auditoria.
5. **Sugerir, não criar.** No Ponto, as picagens produzem *sugestões* de faltas,
   atrasos e horas extra que o RH confirma; o sistema nunca cria registos de
   assiduidade sem confirmação.
6. **O motor mantém-se puro.** `calculo/` continua sem Prisma, Electron ou React.
7. **Portas explícitas.** O que depende do exterior (valores legais, formatos
   oficiais, formato do relógio) é critério de aceitação, não suposição.

---

## 3. Sequência e marcos

Ordem por valor e risco:

| Marco | Área | Porquê esta ordem |
|---|---|---|
| **P1** | Declarativas | Obrigação legal com penalizações; não depende de hardware nem de dados novos |
| **P2** | Relógio de Ponto | Melhora a qualidade dos dados que o motor já consome; resolve-se por importação de ficheiro |
| **P3** | Capital Humano | Domínio novo e o maior dos três; sem obrigação legal a pressionar |

P1 e P2 são independentes entre si e podem correr em paralelo com dois
desenvolvedores. P3 depende apenas de cadastros que já existem.

| Área | Esforço indicativo |
|---|---|
| Declarativas | M/L |
| Relógio de Ponto | M/L |
| Capital Humano | L (o maior) |

---

## 4. Área A — Obrigações Declarativas

### 4.1 Objetivo

Transformar o que já foi processado num mês em documentos declarativos prontos a
entregar: o mapa de remunerações e a guia de pagamento do INSS, e a declaração de
IRT à AGT, mais o apuramento anual.

### 4.2 Dependências e portas

- **Porta externa (bloqueia a submissão, não o desenvolvimento):** os valores
  legais em vigor — taxas de INSS, escalões e isenções de IRT — têm de estar
  validados pelo RH/jurídico. Continua em aberto em `DECISOES.md` §«Perguntas em
  aberto» e na spec §13.
- **Porta externa:** os layouts oficiais (estrutura e formato de cada declaração).
  Enquanto não houver layout validado, a obrigação fica configurada mas a geração
  é recusada com mensagem explícita.
- **Dependência interna:** qualidade dos dados. A declaração do INSS exige o NISS
  de cada funcionário; a do IRT exige o NIF. `RH-907` produz o relatório de
  pendências que tem de estar vazio antes de gerar.

### 4.3 Modelo de dados

```prisma
enum RhTipoDeclaracao { INSS_REMUNERACOES INSS_GUIA IRT_MENSAL INSS_ANUAL IRT_ANUAL }
enum RhPeriodicidadeDeclaracao { MENSAL ANUAL }
enum RhEstadoDeclaracao { RASCUNHO GERADA SUBMETIDA PAGA REJEITADA ANULADA }

model RhObrigacaoDeclarativa {
  id            String   @id @default(cuid())
  empresaId     String                                        // EXT
  codigo        String                                        // ex.: INSS_REMUNERACOES
  designacao    String
  tipo          RhTipoDeclaracao
  periodicidade RhPeriodicidadeDeclaracao
  diaLimite     Int?                                          // mensais: dia do mês seguinte
  mesLimite     Int?                                          // anuais: mês do ano seguinte
  layoutId      String?                                       // layout activo
  ativo         Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model RhLayoutDeclarativo {
  id           String    @id @default(cuid())
  obrigacaoId  String
  versao       String                                         // ex.: "2026.1"
  formato      String                                         // CSV | XML | TXT
  definicao    Json                                           // campos, ordem, separador, codificação
  vigenteDesde DateTime
  vigenteAte   DateTime?
}

model RhDeclaracao {
  id               String   @id @default(cuid())
  empresaId        String                                      // EXT
  obrigacaoId      String
  ano              Int
  periodo          Int?                                        // null nas anuais
  estado           RhEstadoDeclaracao @default(RASCUNHO)
  layoutId         String?
  totalBase        Decimal  @db.Decimal(18, 4) @default(0)
  totalDescontos   Decimal  @db.Decimal(18, 4) @default(0)
  totalEncargos    Decimal  @db.Decimal(18, 4) @default(0)
  ficheiroCaminho  String?
  ficheiroHash     String?
  geradaEm         DateTime?
  geradaPorId      String?
  submetidaEm      DateTime?
  referenciaExterna String?                                    // nº do comprovativo no portal
  observacoes      String?
}

model RhDeclaracaoLinha {
  id              String  @id @default(cuid())
  declaracaoId    String
  funcionarioId   String
  niss            String?
  nif             String?
  baseINSS        Decimal @db.Decimal(18, 4) @default(0)
  inssTrabalhador Decimal @db.Decimal(18, 4) @default(0)
  inssPatronal    Decimal @db.Decimal(18, 4) @default(0)
  baseIRT         Decimal @db.Decimal(18, 4) @default(0)
  irt             Decimal @db.Decimal(18, 4) @default(0)
  escalaoIRT      String?
}
```

O `RhDeclaracaoLinha` é um *snapshot*: depois de a declaração ser gerada, os
valores não mudam mesmo que um processamento do período seja anulado — a
divergência aparece como pendência a resolver, não silenciosamente.

### 4.4 Serviços e canais IPC

| Serviço | Responsabilidade |
|---|---|
| `rh-declarativas-apuracao.service.ts` | Agrega processamentos não anulados do período e congela linhas e totais |
| `rh-declarativas-geracao.service.ts` | Aplica o layout versionado e escreve o ficheiro (com hash) na pasta de documentos |
| `rh-declarativas.service.ts` | CRUD das obrigações e layouts, listagem de declarações, transições de estado |

Canais previstos: `rh:declarativas:obrigacoes`, `rh:declarativas:apurar`,
`rh:declarativas:gerar`, `rh:declarativas:listar`, `rh:declarativas:obter`,
`rh:declarativas:submeter`, `rh:declarativas:anular`. Permissões
`rh.declarativas.ver` / `.gerir` / `.emitir`.

### 4.5 Interface

No separador **Obrigações Declarativas** (já existente): escolher a obrigação, o
ano e o período; pré-visualizar o apuramento; gerar o ficheiro; consultar o
histórico com estado, totais e hash; reimprimir. O **mapa de remunerações**
(`RH-907`) imprime-se em PDF a partir do mesmo apuramento.

A transição para `SUBMETIDA` guarda a referência do comprovativo; a transição
para `PAGA` é manual, porque o pagamento ao INSS é feito por fora.

### 4.6 Riscos

| Risco | Mitigação |
|---|---|
| Valores fiscais não validados ⇒ declarações erradas | Geração bloqueada sem validação jurídica registada |
| Layout oficial muda | Layouts versionados com vigência; gerar sempre indica a versão |
| Dados em falta (NISS/NIF) | Relatório de pendências antes de gerar (`RH-907`) |
| Processamento anulado depois de declarar | Snapshot congelado + deteção de divergência |

---

## 5. Área B — Relógio de Ponto

### 5.1 Objetivo

Trazer as picagens do relógio para dentro do sistema e transformá-las em propostas
de faltas, atrasos e horas extra que o RH confirma, melhorando a fiabilidade dos
dados que alimentam o processamento.

### 5.2 Dependências e portas

- **Porta externa:** o formato de exportação de cada marca/modelo de relógio
  (colunas, formato de data/hora, codificação). Resolve-se com o *perfil de
  importação* configurável, mas é preciso um ficheiro real de amostra para testar.
- **Porta interna:** o **regime de jornadas** (horário de entrada/saída, dias da
  semana, tolerâncias) não existe hoje na ficha do contrato. `RH-911` acrescenta-o.
- **Não-objetivo:** leitura direta do dispositivo por rede ou SDK. Fica como
  evolução futura, isolada atrás de uma interface, se algum dia for necessária.

### 5.3 Modelo de dados

```prisma
enum RhEstadoImportacaoPonto { PROCESSADA COM_ERROS FALHADA ANULADA }
enum RhEstadoPicagem { BRUTA RESOLVIDA CONCILIADA IGNORADA }
enum RhTipoPicagem { ENTRADA SAIDA INTERVALO_INICIO INTERVALO_FIM INDEFINIDO }

model RhDispositivoPonto {
  id          String  @id @default(cuid())
  empresaId   String                                  // EXT
  nome        String
  marca       String?
  modelo      String?
  numeroSerie String?
  fusoHorario String  @default("Africa/Luanda")
  ativo       Boolean @default(true)
}

model RhJornada {
  id                String  @id @default(cuid())
  empresaId         String                            // EXT
  nome              String
  diasSemana        Json                              // ex.: [1,2,3,4,5]
  horaEntrada       String                            // "08:00"
  horaSaida         String                            // "17:00"
  minutosTolerancia Int     @default(10)
  ativo             Boolean @default(true)
}

model RhPerfilImportacaoPonto {
  id              String  @id @default(cuid())
  dispositivoId   String?
  nome            String
  separador       String  @default(";")
  formatoData     String  @default("yyyy-MM-dd")
  formatoHora     String? @default("HH:mm:ss")
  mapeamento      Json                                // { codigo, dataHora, tipo } → índice/coluna
  ignoraCabecalho Boolean @default(true)
  ativo           Boolean @default(true)
}

model RhImportacaoPonto {
  id              String  @id @default(cuid())
  empresaId       String                              // EXT
  dispositivoId   String?
  perfilId        String?
  ficheiroNome    String
  ficheiroHash    String
  estado          RhEstadoImportacaoPonto
  totalLinhas     Int     @default(0)
  linhasValidas   Int     @default(0)
  linhasInvalidas Int     @default(0)
  erros           Json?
  importadoPorId  String?
  importadoEm     DateTime @default(now())
}

model RhPicagem {
  id             String  @id @default(cuid())
  empresaId      String                               // EXT
  importacaoId   String
  dispositivoId  String?
  codigoExterno  String
  funcionarioId  String?
  picadoEm       DateTime
  tipo           RhTipoPicagem @default(INDEFINIDO)
  estado         RhEstadoPicagem @default(BRUTA)
  observacao     String?
  @@unique([dispositivoId, codigoExterno, picadoEm])
}

model RhCodigoPonto {
  id            String @id @default(cuid())
  empresaId     String                                // EXT
  codigoExterno String
  funcionarioId String
  @@unique([empresaId, codigoExterno])
}
```

`RhContrato` ganha `jornadaId String?` (opcional). A confirmação de uma sugestão
cria os registos existentes de `RhAusencia` ou `RhHoraExtra`, com referência à
importação na observação; a sugestão em si não é persistida.

### 5.4 Serviços e canais IPC

| Serviço | Responsabilidade |
|---|---|
| `rh-ponto-importacao.service.ts` | Lê o ficheiro pelo perfil, valida linhas, deduplica por `(dispositivo, código, instante)` e grava |
| `rh-ponto-identidade.service.ts` | Resolve `codigoExterno` → funcionário; mantém a lista de códigos por resolver |
| `rh-ponto-conciliacao.service.ts` | Aplica jornadas e tolerâncias e produz **sugestões** (falta, atraso, hora extra) para confirmação |

Canais previstos: `rh:ponto:importar`, `rh:ponto:importacoes`, `rh:ponto:picagens`,
`rh:ponto:codigos`, `rh:ponto:conciliar`, `rh:ponto:confirmar`. Permissões
`rh.ponto.ver` / `.gerir` / `.aprovar`.

### 5.5 Interface

Um ecrã com três partes: importar (escolher perfil e ficheiro, ver o relatório de
linhas válidas e inválidas), resolver identidade (códigos por associar) e
conciliar (por funcionário e período, ver as sugestões e confirmar ou ignorar).

### 5.6 Riscos

| Risco | Mitigação |
|---|---|
| Formato do relógio desconhecido | Perfil de importação configurável + ficheiro de amostra antes de fechar |
| Picagens em horário local/UTC ambíguo | Fuso por dispositivo; normalização na importação |
| Sugestões erradas de faltas | Conciliação só sugere; nunca cria; tolerâncias configuráveis por jornada |
| Funcionários sem jornada atribuída | A conciliação assinala-os em vez de assumir um horário |

---

## 6. Área C — Capital Humano

### 6.1 Objetivo

Cobrir o ciclo de vida para além do salário: contratar, avaliar e formar. Todos os
dados são novos; nada aqui recalcula o processamento.

### 6.2 Sub-áreas, por ordem

1. **Recrutamento** (`RH-921`, `RH-922`) — vagas, candidatos e candidaturas, com
   conversão de um candidato admitido em funcionário, reaproveitando o cadastro.
2. **Avaliação de desempenho** (`RH-923`, `RH-924`) — ciclos, critérios e escalas,
   avaliação por avaliador, validação e fecho. Produz uma **sugestão** de alteração
   salarial; nunca altera o salário por si.
3. **Formação** (`RH-925`, `RH-926`) — ações, edições, inscrições, custos e
   certificados.

### 6.3 Modelo de dados

```prisma
enum RhEstadoVaga { RASCUNHO ABERTA EM_SELECAO FECHADA CANCELADA }
enum RhEstadoCandidatura { RECEBIDA TRIAGEM ENTREVISTA PROPOSTA ADMITIDA REJEITADA DESISTIU }

model RhVaga {
  id             String  @id @default(cuid())
  empresaId      String                               // EXT
  referencia     String
  titulo         String
  departamentoId String?
  cargoId        String?
  tipoContrato   RhTipoContrato?
  quantidade     Int     @default(1)
  descricao      String?
  estado         RhEstadoVaga @default(RASCUNHO)
  responsavelId  String?
  abertaEm       DateTime?
  fechadaEm      DateTime?
}

model RhCandidato {
  id             String  @id @default(cuid())
  empresaId      String                               // EXT
  nome           String
  email          String?
  telefone       String?
  documento      String?
  nif            String?
  dataNascimento DateTime?
  habilitacoes   String?
  cvCaminho      String?
  origem         String?
}

model RhCandidatura {
  id            String  @id @default(cuid())
  vagaId        String
  candidatoId   String
  estado        RhEstadoCandidatura @default(RECEBIDA)
  pontuacao     Decimal? @db.Decimal(5, 2)
  notas         String?
  funcionarioId String?                               // preenchido quando admitido
}

enum RhEstadoCicloAvaliacao { PLANEADO ABERTO EM_AVALIACAO FECHADO CANCELADO }
enum RhEstadoAvaliacao { PENDENTE EM_CURSO CONCLUIDA VALIDADA }

model RhCicloAvaliacao {
  id          String  @id @default(cuid())
  empresaId   String                                  // EXT
  designacao  String
  ano         Int
  dataInicio  DateTime
  dataFim     DateTime
  escala      Json                                    // ex.: { min: 1, max: 5, rotulos: [...] }
  estado      RhEstadoCicloAvaliacao @default(PLANEADO)
}

model RhCriterioAvaliacao {
  id         String  @id @default(cuid())
  cicloId    String
  codigo     String
  designacao String
  peso       Decimal @db.Decimal(5, 2) @default(1)
  ordem      Int     @default(0)
}

model RhAvaliacao {
  id             String  @id @default(cuid())
  cicloId        String
  funcionarioId  String
  avaliadorId    String?
  estado         RhEstadoAvaliacao @default(PENDENTE)
  pontuacao      Decimal? @db.Decimal(5, 2)
  classificacao  String?
  comentario     String?
  validadaPorId  String?
  validadaEm     DateTime?
}

model RhAvaliacaoNota {
  id          String  @id @default(cuid())
  avaliacaoId String
  criterioId  String
  pontuacao   Decimal @db.Decimal(5, 2)
  comentario  String?
}

enum RhEstadoAcaoFormacao { PLANEADA ABERTA EM_CURSO CONCLUIDA CANCELADA }
enum RhEstadoInscricao { INSCRITA CONFIRMADA CONCLUIDA DESISTIU FALTOU }

model RhAcaoFormacao {
  id                String  @id @default(cuid())
  empresaId         String                            // EXT
  codigo            String
  designacao        String
  areaTematica      String?
  modalidade        String?
  entidadeFormadora String?
  formador          String?
  custoTotal        Decimal @db.Decimal(18, 4) @default(0)
  dataInicio        DateTime?
  dataFim           DateTime?
  horas             Int?
  estado            RhEstadoAcaoFormacao @default(PLANEADA)
}

model RhInscricaoFormacao {
  id                 String  @id @default(cuid())
  acaoId             String
  funcionarioId      String
  estado             RhEstadoInscricao @default(INSCRITA)
  nota               Decimal? @db.Decimal(5, 2)
  custo              Decimal? @db.Decimal(18, 4)
  certificadoCaminho String?
  concluidaEm        DateTime?
}
```

### 6.4 Serviços, canais e interface

Três serviços por subdomínio (`rh-recrutamento.service.ts`,
`rh-avaliacao.service.ts`, `rh-formacao.service.ts`), cada um com o seu par de
canais `rh:recrutamento:*`, `rh:avaliacao:*`, `rh:formacao:*` e as suas permissões
(`rh.recrutamento.*`, `rh.avaliacao.*`, `rh.formacao.*`).

O separador **Capital Humano** divide-se em três abas: **Recrutamento**,
**Avaliação** e **Formação**. O **Recrutamento** inclui a ação *Converter em
funcionário*, que abre a ficha de funcionário pré-preenchida a partir do candidato.
A **Avaliação** inclui a ação *Sugerir alteração salarial*, que cria uma proposta
para o contrato (estado pendente), nunca uma alteração aplicada.

### 6.5 Riscos

| Risco | Mitigação |
|---|---|
| Avaliação é subjetiva e politicamente sensível | Escalas e critérios configuráveis por ciclo; sem efeito automático no salário |
| Duplicar o cadastro de funcionários | A conversão reaproveita `RhFuncionario`; nada de uma segunda tabela de pessoas |
| Formação sem valor se não tiver custos | Custo por ação e por inscrição, com relatório de custos (`RH-927`) |
| Âmbito a crescer para RH «de tudo» | Os três subdomínios ficam fechados; qualquer alargamento é nova decisão |

---

## 7. Permissões (RBAC) novas

Acrescentadas a `RH_SUBMODULOS` em `src/main/constants/rh-permissions.constants.ts`
(que replica para `src/renderer/src/config/permissions.ts` e para a matriz de
perfis). Reutilizam as ações finas já existentes — sem alargar `RH_ACOES_RBAC`.

| Submódulo | Chave | Ações |
|---|---|---|
| Obrigações Declarativas | `rh.declarativas` | `ver`, `gerir`, `emitir` |
| Relógio de Ponto | `rh.ponto` | `ver`, `gerir`, `aprovar` |
| Recrutamento | `rh.recrutamento` | `ver`, `gerir` |
| Avaliação | `rh.avaliacao` | `ver`, `gerir`, `aprovar` |
| Formação | `rh.formacao` | `ver`, `gerir` |

O mapeamento coarse segue a regra existente em `rbacDaPermissao`: `ver` → `read`,
`gerir`/`emitir` → `write`, `aprovar` → `approve`.

---

## 8. Estratégia de testes

| Nível | O quê |
|---|---|
| Unitário | Apuramento das declarações (somas, exclusão de anulados), aplicação de layouts, parser de picagens, regras de conciliação (tolerâncias, atrasos, horas extra), cálculos de avaliação (média ponderada, classificação) |
| Integração (Prisma) | Geração de declaração com dados reais; snapshot que não muda com anulação posterior; deduplicação de picagens; conversão candidato → funcionário numa transação |
| Contrato IPC | Cada canal com permissões certas e validação Zod (`rh.validator.ts`) |
| E2E (Playwright) | Gerar declaração ponta-a-ponta; importar ficheiro de picagens e confirmar sugestões; criar vaga → candidatura → converter em funcionário |
| Aceitação | Amostras reais: um ficheiro do relógio, um layout oficial, um período processado comparado com o sistema antigo |

---

## 9. Portas externas (resumo)

| # | Porta | Bloqueia | Área |
|---|---|---|---|
| 1 | Validação jurídica dos valores de INSS/IRT | Submissão das declarações | A |
| 2 | Layouts oficiais INSS/AGT | Geração das declarações | A |
| 3 | NISS/NIF completos nas fichas | Geração das declarações | A |
| 4 | Ficheiro de amostra de um relógio real | Fecho da importação | B |
| 5 | Definição dos regimes de jornada e tolerâncias | Conciliação | B |
| 6 | Confirmação de que a avaliação não deve ter efeito salarial automático | `RH-924` | C |

---

## 10. Impacto na documentação

- `03-tasks.md` — nova secção `FASE 9 — Pós-MVP` com as tarefas `RH-9xx`.
- `04-modelo-de-dados.md` — modelos desta área, na altura da implementação.
- `docs/manual/07-rh.md` — as três áreas passam a ter descrição de utilizador
  quando forem implementadas (hoje estão declaradas como placeholders).
- `01-especificacao-tecnica.md` — os três pontos deixam de estar «fora do MVP»
  quando forem entregues.
