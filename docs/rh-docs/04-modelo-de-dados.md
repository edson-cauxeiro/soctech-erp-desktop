# 04 — Modelo de Dados (Prisma)

> **Como usar:** acrescentar os modelos abaixo ao `prisma/schema.prisma` **existente** (não criar 2.º schema).
> Antes de colar, adaptar às convenções do projecto (ver `AGENTS.md §3`):
> - Estratégia de ID (`cuid()` usado aqui; trocar se o projecto usa `uuid()`/`autoincrement()`).
> - `empresaId` / multi-empresa (comentado como `// EXT:` onde aplicável).
> - Tipo `Decimal` suportado pela BD escolhida (SQLite/Postgres).
> - Nomes das entidades externas (Utilizador, ContaBancaria, CentroCusto, Moeda, LancamentoContabil…).
> - Prefixo **`Rh`** em todos os modelos para evitar colisões. Enums com prefixo `Rh`.

Convenções: `createdAt/updatedAt` em tudo; `criadoPorId` onde há acção humana; anulação por **estado**, nunca `DELETE`.

---

## 1. Diagrama (resumo)

```
RhDepartamento ─< RhFuncionario >─ RhCargo
RhFuncionario ─< RhContrato
RhFuncionario ─< RhDependente
RhFuncionario ─< RhFuncionarioRubrica >─ RhRubrica
RhFuncionario ─< RhAlteracaoMensal >─ RhRubrica
RhFuncionario ─< RhAusencia >─ RhTipoAusencia
RhFuncionario ─< RhHoraExtra
RhFuncionario ─< RhFeriasSaldo ; RhFuncionario ─< RhMarcacaoFerias
RhFuncionario ─< RhAfetacao
RhFuncionario ─< RhProcessoDivida ─< RhPrestacaoDivida
RhFuncionario ─< RhRetroativo
RhPeriodo ─< RhLoteProcessamento ─< RhProcessamento
RhFuncionario ─< RhProcessamento ─< RhProcessamentoItem
RhProcessamento ─ 1:1 ─ RhRecibo
RhProcessamento ─< RhPagamento >─ RhOrdemPagamento
RhTabelaIRT ─< RhEscalaoIRT ; RhParametroFiscal
RhIndependente ─< RhAtividade ─< RhProcessamentoHonorario ─< RhPagamentoHonorario
```

---

## 2. Enums

```prisma
enum RhEstadoFuncionario { ATIVO SUSPENSO INATIVO CESSADO }
enum RhGenero { MASCULINO FEMININO OUTRO }
enum RhEstadoCivil { SOLTEIRO CASADO DIVORCIADO VIUVO UNIAO_FACTO }
enum RhFormaPagamento { TRANSFERENCIA NUMERARIO CHEQUE }

enum RhTipoContrato { PRAZO_INDETERMINADO PRAZO_CERTO EXPERIENCIA ESTAGIO TEMPO_PARCIAL OUTRO }
enum RhEstadoContrato { ATIVO ENCERRADO SUSPENSO }
enum RhMotivoCessacao { TERMO DEMISSAO DESPEDIMENTO MUTUO_ACORDO REFORMA FALECIMENTO PERIODO_EXPERIENCIA OUTRO }

enum RhTipoRubrica { REMUNERACAO DESCONTO ENCARGO_PATRONAL }
enum RhNaturezaRubrica { FIXA VARIAVEL EXTRAORDINARIA }
enum RhFormaCalculoRubrica { VALOR_FIXO PERCENTAGEM_SALARIO VALOR_X_QUANTIDADE SISTEMA }
enum RhOrigemItem { AUTOMATICO MANUAL ALTERACAO_MENSAL RECORRENTE DIVIDA RETROATIVO SISTEMA }
enum RhEstadoAlteracao { PENDENTE APLICADA ANULADA }

enum RhTipoProcessamento { VENCIMENTO SUBSIDIO_FERIAS SUBSIDIO_NATAL EXTRAORDINARIO FIM_CONTRATO }
enum RhModoProcessamento { INDIVIDUAL LOTE }
enum RhEstadoProcessamento { PROCESSADO ANULADO }
enum RhEstadoLote { EM_EXECUCAO CONCLUIDO CONCLUIDO_COM_ERROS FALHADO ANULADO }
enum RhEstadoPeriodo { ABERTO FECHADO }
enum RhTipoPeriodo { MENSAL }

enum RhEstadoRecibo { EMITIDO ANULADO }
enum RhEstadoPagamento { PENDENTE PARCIAL PAGO ESTORNADO CANCELADO }
enum RhEstadoOrdemPagamento { ABERTA ENVIADA CONCLUIDA CANCELADA }

enum RhTipoHoraExtra { DIURNA_UTIL NOTURNA DESCANSO_FERIADO }
enum RhEstadoAprovacao { PENDENTE APROVADO REJEITADO CANCELADO }
enum RhEstadoFerias { PLANEADA APROVADA GOZADA CANCELADA }

enum RhTipoDivida { ADIANTAMENTO EMPRESTIMO PENHORA OUTRO }
enum RhEstadoDivida { ATIVA SUSPENSA LIQUIDADA CANCELADA }
enum RhEstadoPrestacao { PENDENTE DESCONTADA ANULADA PERDOADA }

enum RhModoSubsidioNatal { PAGAMENTO_UNICO DUODECIMOS }
enum RhModoSubsidioFerias { ANTES_GOZO MES_FIXO DUODECIMOS }

enum RhEstadoRetroativo { PENDENTE APLICADO ANULADO }
enum RhEstadoHonorario { PROCESSADO ANULADO }
```

---

## 3. Estrutura organizacional e funcionários

```prisma
model RhDepartamento {
  id          String   @id @default(cuid())
  codigo      String
  nome        String
  ativo       Boolean  @default(true)
  // EXT: empresaId String
  funcionarios RhFuncionario[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([codigo])
}

model RhCargo {
  id          String   @id @default(cuid())
  codigo      String
  nome        String
  ativo       Boolean  @default(true)
  funcionarios RhFuncionario[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([codigo])
}

model RhFuncionario {
  id              String   @id @default(cuid())
  // EXT: empresaId String
  codigo          String                       // "001", "002"… sequência (RhSequencia)
  nome            String
  documentoNumero String?                      // BI/passaporte
  nif             String?
  niss            String?                      // nº INSS
  dataNascimento  DateTime?
  genero          RhGenero?
  estadoCivil     RhEstadoCivil?
  nacionalidade   String?
  morada          String?
  telefone        String?
  email           String?
  fotoPath        String?

  departamentoId  String?
  departamento    RhDepartamento? @relation(fields: [departamentoId], references: [id])
  cargoId         String?
  cargo           RhCargo?        @relation(fields: [cargoId], references: [id])
  categoria       String?

  dataAdmissao    DateTime
  dataCessacao    DateTime?
  estado          RhEstadoFuncionario @default(ATIVO)

  // Pagamento
  formaPagamento  RhFormaPagamento @default(TRANSFERENCIA)
  banco           String?
  iban            String?
  // EXT: contaBancariaOrigemPadraoId String?

  // Forma de pagamento dos subsídios (sobrescreve a configuração da empresa se não nulo)
  modoSubsidioNatal  RhModoSubsidioNatal?
  modoSubsidioFerias RhModoSubsidioFerias?
  mesPagamentoSubsidioNatal  Int?   // 1..12, se PAGAMENTO_UNICO
  mesPagamentoSubsidioFerias Int?   // 1..12, se MES_FIXO

  contratos        RhContrato[]
  dependentes      RhDependente[]
  documentos       RhFuncionarioDocumento[]
  rubricasFixas    RhFuncionarioRubrica[]
  alteracoes       RhAlteracaoMensal[]
  ausencias        RhAusencia[]
  horasExtra       RhHoraExtra[]
  feriasSaldos     RhFeriasSaldo[]
  marcacoesFerias  RhMarcacaoFerias[]
  afetacoes        RhAfetacao[]
  dividas          RhProcessoDivida[]
  retroativos      RhRetroativo[]
  processamentos   RhProcessamento[]
  pagamentos       RhPagamento[]
  restricoes       RhRestricaoFuncionario[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([codigo])        // com empresaId se multi-empresa: @@unique([empresaId, codigo])
  @@index([estado])
  @@index([nome])
  @@index([nif])
}

model RhDependente {
  id             String   @id @default(cuid())
  funcionarioId  String
  funcionario    RhFuncionario @relation(fields: [funcionarioId], references: [id], onDelete: Cascade)
  nome           String
  parentesco     String
  dataNascimento DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([funcionarioId])
}

model RhFuncionarioDocumento {
  id            String   @id @default(cuid())
  funcionarioId String
  funcionario   RhFuncionario @relation(fields: [funcionarioId], references: [id], onDelete: Cascade)
  tipo          String                       // BI, CONTRATO, CERTIFICADO…
  descricao     String?
  caminho       String
  createdAt     DateTime @default(now())

  @@index([funcionarioId])
}

model RhContrato {
  id               String   @id @default(cuid())
  funcionarioId    String
  funcionario      RhFuncionario @relation(fields: [funcionarioId], references: [id])
  tipo             RhTipoContrato
  estado           RhEstadoContrato @default(ATIVO)
  dataInicio       DateTime
  dataFim          DateTime?
  salarioBase      Decimal  @db.Decimal(18, 4)   // remover @db.* se SQLite
  moeda            String   @default("AOA")      // EXT: Moeda
  cargaHorariaSemanal Int   @default(44)
  categoria        String?
  motivoCessacao   RhMotivoCessacao?
  dataCessacao     DateTime?
  observacoes      String?

  alteracoesSalariais RhAlteracaoSalarial[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([funcionarioId, estado])
}

// Histórico de aumentos/promoções com data de efeito
model RhAlteracaoSalarial {
  id            String   @id @default(cuid())
  contratoId    String
  contrato      RhContrato @relation(fields: [contratoId], references: [id], onDelete: Cascade)
  dataEfeito    DateTime
  salarioAnterior Decimal @db.Decimal(18, 4)
  salarioNovo     Decimal @db.Decimal(18, 4)
  motivo        String?
  criadoPorId   String?   // EXT: Utilizador
  createdAt     DateTime @default(now())

  @@index([contratoId, dataEfeito])
}
```

---

## 4. Rubricas e alterações mensais

```prisma
model RhRubrica {
  id              String   @id @default(cuid())
  codigo          String
  descricao       String
  tipo            RhTipoRubrica
  natureza        RhNaturezaRubrica @default(FIXA)
  formaCalculo    RhFormaCalculoRubrica @default(VALOR_FIXO)
  valorPadrao     Decimal? @db.Decimal(18, 4)
  percentagem     Decimal? @db.Decimal(9, 4)
  incideIRT       Boolean  @default(true)
  incideINSS      Boolean  @default(true)
  limiteIsencaoIRT Decimal? @db.Decimal(18, 4)    // parte isenta (ex.: subs. alimentação até X)
  limiteIsencaoINSS Decimal? @db.Decimal(18, 4)
  ordemRecibo     Int      @default(100)
  sistema         Boolean  @default(false)        // rubricas de seed — não eliminar
  codigoSistema   String?                         // SALARIO_BASE, INSS_TRAB, IRT, HORA_EXTRA, FALTAS…
  // EXT: contaDebitoId, contaCreditoId  (plano de contas)
  ativo           Boolean  @default(true)

  funcionarioRubricas RhFuncionarioRubrica[]
  alteracoes          RhAlteracaoMensal[]
  itens               RhProcessamentoItem[]
  retroativos         RhRetroativo[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([codigo])
  @@index([tipo, ativo])
}

// Rubricas recorrentes atribuídas ao funcionário (ex.: subsídio de renda)
model RhFuncionarioRubrica {
  id            String   @id @default(cuid())
  funcionarioId String
  funcionario   RhFuncionario @relation(fields: [funcionarioId], references: [id], onDelete: Cascade)
  rubricaId     String
  rubrica       RhRubrica @relation(fields: [rubricaId], references: [id])
  valor         Decimal?  @db.Decimal(18, 4)
  percentagem   Decimal?  @db.Decimal(9, 4)
  moeda         String    @default("AOA")
  dataInicio    DateTime
  dataFim       DateTime?
  ativo         Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([funcionarioId, ativo])
}

// Alterações mensais (prémios, comissões, descontos pontuais…)
model RhAlteracaoMensal {
  id            String   @id @default(cuid())
  funcionarioId String
  funcionario   RhFuncionario @relation(fields: [funcionarioId], references: [id])
  ano           Int
  mes           Int
  rubricaId     String
  rubrica       RhRubrica @relation(fields: [rubricaId], references: [id])
  quantidade    Decimal?  @db.Decimal(18, 4)
  valor         Decimal   @db.Decimal(18, 4)
  moeda         String    @default("AOA")
  extraordinaria Boolean  @default(false)       // alimenta tipo EXTRAORDINARIO
  observacao    String?
  estado        RhEstadoAlteracao @default(PENDENTE)
  processamentoItemId String?                    // preenchido ao aplicar
  criadoPorId   String?                          // EXT: Utilizador
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([funcionarioId, ano, mes, estado])
}
```

---

## 5. Assiduidade

```prisma
model RhTipoAusencia {
  id               String  @id @default(cuid())
  codigo           String
  descricao        String
  justificada      Boolean @default(true)
  descontaSalario  Boolean @default(false)
  descontaSubsidioAlimentacao Boolean @default(false)
  ativo            Boolean @default(true)
  ausencias        RhAusencia[]

  @@unique([codigo])
}

model RhAusencia {
  id             String   @id @default(cuid())
  funcionarioId  String
  funcionario    RhFuncionario @relation(fields: [funcionarioId], references: [id])
  tipoId         String
  tipo           RhTipoAusencia @relation(fields: [tipoId], references: [id])
  dataInicio     DateTime
  dataFim        DateTime
  dias           Decimal  @db.Decimal(9, 2)
  horas          Decimal? @db.Decimal(9, 2)
  justificativoPath String?
  observacao     String?
  estado         RhEstadoAprovacao @default(PENDENTE)
  aprovadoPorId  String?          // EXT: Utilizador
  processadaEm   DateTime?        // quando descontada num processamento
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([funcionarioId, dataInicio])
}

model RhHoraExtra {
  id             String   @id @default(cuid())
  funcionarioId  String
  funcionario    RhFuncionario @relation(fields: [funcionarioId], references: [id])
  data           DateTime
  horas          Decimal  @db.Decimal(9, 2)
  tipo           RhTipoHoraExtra
  percentagem    Decimal  @db.Decimal(9, 4)   // ex.: 50.0000 → +50%
  estado         RhEstadoAprovacao @default(PENDENTE)
  processadaEm   DateTime?
  createdAt      DateTime @default(now())

  @@index([funcionarioId, data])
}

model RhFeriasSaldo {
  id             String   @id @default(cuid())
  funcionarioId  String
  funcionario    RhFuncionario @relation(fields: [funcionarioId], references: [id], onDelete: Cascade)
  ano            Int
  diasDireito    Decimal  @db.Decimal(9, 2) @default(22)
  diasTransitados Decimal @db.Decimal(9, 2) @default(0)
  diasMarcados   Decimal  @db.Decimal(9, 2) @default(0)
  diasGozados    Decimal  @db.Decimal(9, 2) @default(0)
  subsidioFeriasProcessado Boolean @default(false)
  updatedAt      DateTime @updatedAt

  @@unique([funcionarioId, ano])
}

model RhMarcacaoFerias {
  id             String   @id @default(cuid())
  funcionarioId  String
  funcionario    RhFuncionario @relation(fields: [funcionarioId], references: [id])
  ano            Int
  dataInicio     DateTime
  dataFim        DateTime
  dias           Decimal  @db.Decimal(9, 2)
  estado         RhEstadoFerias @default(PLANEADA)
  aprovadoPorId  String?
  subsidioProcessamentoId String?   // evita processar 2x o subsídio
  observacao     String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([funcionarioId, ano])
}

// Afetação do custo a centro de custo/projecto
model RhAfetacao {
  id             String   @id @default(cuid())
  funcionarioId  String
  funcionario    RhFuncionario @relation(fields: [funcionarioId], references: [id], onDelete: Cascade)
  centroCustoId  String          // EXT: CentroCusto (ou Projecto)
  percentagem    Decimal  @db.Decimal(9, 4)   // soma = 100 por vigência (validar no service)
  dataInicio     DateTime
  dataFim        DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([funcionarioId, dataInicio])
}
```

---

## 6. Parâmetros fiscais e de configuração

```prisma
// Escalões de IRT com vigência (NÃO hard-code)
model RhTabelaIRT {
  id            String   @id @default(cuid())
  descricao     String
  vigenteDesde  DateTime
  vigenteAte    DateTime?
  ativo         Boolean  @default(true)
  escaloes      RhEscalaoIRT[]
  createdAt     DateTime @default(now())

  @@index([vigenteDesde])
}

model RhEscalaoIRT {
  id            String   @id @default(cuid())
  tabelaId      String
  tabela        RhTabelaIRT @relation(fields: [tabelaId], references: [id], onDelete: Cascade)
  ordem         Int
  rendimentoDe  Decimal  @db.Decimal(18, 2)   // limite inferior (exclusivo/inclusivo — documentar)
  rendimentoAte Decimal? @db.Decimal(18, 2)   // null = sem limite
  parcelaFixa   Decimal  @db.Decimal(18, 2)
  taxa          Decimal  @db.Decimal(9, 4)    // % sobre excesso
  excessoDe     Decimal  @db.Decimal(18, 2)   // valor a partir do qual incide a taxa

  @@unique([tabelaId, ordem])
}

// Parâmetros (chave/valor tipado) com vigência: INSS_TRAB, INSS_PATRONAL,
// PCT_SUBS_NATAL, PCT_SUBS_FERIAS, DIAS_FERIAS_ANO, BASE_DIAS_MES,
// LIMITE_PENHORA_PCT, HE_DIURNA_PCT, EXTRAORD_ACUMULA_IRT, RETENCAO_HONORARIOS…
model RhParametroFiscal {
  id            String   @id @default(cuid())
  chave         String
  valor         String                    // guardado como string; Decimal/Boolean/JSON via tipo
  tipoValor     String   @default("DECIMAL") // DECIMAL | INT | BOOLEAN | JSON | STRING
  descricao     String?
  vigenteDesde  DateTime
  vigenteAte    DateTime?
  createdAt     DateTime @default(now())

  @@index([chave, vigenteDesde])
}

model RhConfiguracao {
  id                    String   @id @default("singleton")   // 1 por empresa (EXT: empresaId)
  modoSubsidioNatalPadrao  RhModoSubsidioNatal  @default(PAGAMENTO_UNICO)
  mesSubsidioNatalPadrao   Int                  @default(12)
  modoSubsidioFeriasPadrao RhModoSubsidioFerias @default(ANTES_GOZO)
  mesSubsidioFeriasPadrao  Int?
  baseDiasMes              Int                  @default(30)
  liquidoNegativoBloqueia  Boolean              @default(true)
  serieRecibo              String               @default("RV")
  updatedAt                DateTime             @updatedAt
}

model RhSequencia {
  id        String @id @default(cuid())
  chave     String               // FUNCIONARIO, RECIBO:RV:2026, ORDEM_PAGAMENTO…
  ultimo    Int    @default(0)
  @@unique([chave])
}
```

---

## 7. Processamento (núcleo)

```prisma
model RhPeriodo {
  id          String   @id @default(cuid())
  ano         Int
  codigo      String                         // "P01".."P12"
  tipo        RhTipoPeriodo @default(MENSAL)
  mes         Int
  descricao   String                         // "Mensal – Abril"
  dataInicio  DateTime
  dataFim     DateTime
  estado      RhEstadoPeriodo @default(ABERTO)
  fechadoEm   DateTime?
  fechadoPorId String?

  lotes           RhLoteProcessamento[]
  processamentos  RhProcessamento[]

  @@unique([ano, codigo])
  @@index([ano, mes])
}

// Cabeçalho de uma execução (individual ou lote)
model RhLoteProcessamento {
  id            String   @id @default(cuid())
  periodoId     String
  periodo       RhPeriodo @relation(fields: [periodoId], references: [id])
  modo          RhModoProcessamento
  operacao      String   @default("PROCESSAR")     // PROCESSAR | ANULAR
  tipos         Json                               // RhTipoProcessamento[]
  parametros    Json                               // snapshot dos params do ecrã (diasProc, datas…)
  estado        RhEstadoLote @default(EM_EXECUCAO)
  totalFuncionarios Int      @default(0)
  totalSucesso      Int      @default(0)
  totalErros        Int      @default(0)
  totalLiquido      Decimal  @db.Decimal(18, 4) @default(0)
  relatorioErros    Json?                          // [{funcionarioId, codigo, mensagem}]
  criadoPorId   String?                            // EXT: Utilizador
  iniciadoEm    DateTime @default(now())
  concluidoEm   DateTime?

  processamentos RhProcessamento[]

  @@index([periodoId, estado])
}

model RhProcessamento {
  id               String   @id @default(cuid())
  loteId           String?
  lote             RhLoteProcessamento? @relation(fields: [loteId], references: [id])
  periodoId        String
  periodo          RhPeriodo @relation(fields: [periodoId], references: [id])
  funcionarioId    String
  funcionario      RhFuncionario @relation(fields: [funcionarioId], references: [id])
  contratoId       String?

  tipo             RhTipoProcessamento
  sequencia        Int      @default(1)      // >1 só para EXTRAORDINARIO
  modo             RhModoProcessamento
  manual           Boolean  @default(false)  // houve ajustes manuais
  estado           RhEstadoProcessamento @default(PROCESSADO)

  dataProcessamento DateTime
  dataLimiteFaltasHE DateTime?
  diasProcessados  Int
  moeda            String   @default("AOA")
  taxaCambio       Decimal? @db.Decimal(18, 6)

  // Totais (AOA)
  totalRemuneracoes Decimal @db.Decimal(18, 4)
  totalDescontos    Decimal @db.Decimal(18, 4)
  totalEncargos     Decimal @db.Decimal(18, 4) @default(0)   // INSS patronal
  liquido           Decimal @db.Decimal(18, 4)

  // Bases e impostos
  baseINSS          Decimal @db.Decimal(18, 4)
  baseIRT           Decimal @db.Decimal(18, 4)
  inssTrabalhador   Decimal @db.Decimal(18, 4)
  inssPatronal      Decimal @db.Decimal(18, 4)
  irt               Decimal @db.Decimal(18, 4)
  irtEscalaoId      String?

  snapshot          Json                       // parâmetros + entrada do cálculo (reprodutibilidade)
  avisos            Json?

  // Anulação
  anuladoEm         DateTime?
  anuladoPorId      String?
  motivoAnulacao    String?

  criadoPorId       String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  itens             RhProcessamentoItem[]
  recibo            RhRecibo?
  pagamentos        RhPagamento[]
  // EXT: lancamentoContabilId String?

  // Unicidade lógica (estado PROCESSADO) validada no service:
  // (funcionarioId, periodoId, tipo, sequencia) com estado = PROCESSADO
  @@index([funcionarioId, periodoId, tipo, estado])
  @@index([periodoId, estado])
  @@index([loteId])
}

model RhProcessamentoItem {
  id               String   @id @default(cuid())
  processamentoId  String
  processamento    RhProcessamento @relation(fields: [processamentoId], references: [id], onDelete: Cascade)
  rubricaId        String?
  rubrica          RhRubrica? @relation(fields: [rubricaId], references: [id])
  codigo           String                      // cópia (imutável) do código da rubrica
  descricao        String                      // cópia da descrição
  tipo             RhTipoRubrica
  origem           RhOrigemItem
  quantidade       Decimal? @db.Decimal(18, 4)
  valorUnitario    Decimal? @db.Decimal(18, 4)
  valor            Decimal  @db.Decimal(18, 4) // arredondado a 2 casas
  moeda            String   @default("AOA")
  taxaCambio       Decimal? @db.Decimal(18, 6)
  incideIRT        Boolean
  incideINSS       Boolean
  ordem            Int      @default(100)
  referenciaId     String?                     // alteração/prestação/ausência de origem

  @@index([processamentoId])
}

model RhRecibo {
  id               String   @id @default(cuid())
  processamentoId  String   @unique
  processamento    RhProcessamento @relation(fields: [processamentoId], references: [id])
  serie            String
  ano              Int
  numero           Int
  estado           RhEstadoRecibo @default(EMITIDO)
  emitidoEm        DateTime @default(now())
  impressoes       Int      @default(0)
  pdfPath          String?
  anuladoEm        DateTime?

  @@unique([serie, ano, numero])
}

// Restrições configuradas por funcionário (bloqueios manuais ao processamento)
model RhRestricaoFuncionario {
  id               String   @id @default(cuid())
  funcionarioId    String
  funcionario      RhFuncionario @relation(fields: [funcionarioId], references: [id], onDelete: Cascade)
  tipoProcessamento RhTipoProcessamento?      // null = todos
  motivo           String
  dataInicio       DateTime
  dataFim          DateTime?
  ativa            Boolean  @default(true)
  criadoPorId      String?
  createdAt        DateTime @default(now())

  @@index([funcionarioId, ativa])
}
```

---

## 8. Pagamentos

```prisma
model RhOrdemPagamento {
  id             String   @id @default(cuid())
  numero         Int
  periodoId      String?
  banco          String?
  // EXT: contaBancariaOrigemId String
  formaPagamento RhFormaPagamento
  estado         RhEstadoOrdemPagamento @default(ABERTA)
  totalValor     Decimal  @db.Decimal(18, 4)
  ficheiroPath   String?                         // ficheiro de transferência gerado
  criadoPorId    String?
  createdAt      DateTime @default(now())
  pagamentos     RhPagamento[]

  @@unique([numero])
}

model RhPagamento {
  id              String   @id @default(cuid())
  processamentoId String
  processamento   RhProcessamento @relation(fields: [processamentoId], references: [id])
  funcionarioId   String
  funcionario     RhFuncionario @relation(fields: [funcionarioId], references: [id])
  ordemId         String?
  ordem           RhOrdemPagamento? @relation(fields: [ordemId], references: [id])
  formaPagamento  RhFormaPagamento
  valor           Decimal  @db.Decimal(18, 4)
  valorPago       Decimal  @db.Decimal(18, 4) @default(0)
  estado          RhEstadoPagamento @default(PENDENTE)
  dataPagamento   DateTime?
  referencia      String?
  // EXT: contaBancariaId String?, movimentoTesourariaId String?
  estornadoEm     DateTime?
  motivoEstorno   String?
  criadoPorId     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([processamentoId])
  @@index([funcionarioId, estado])
}
```

---

## 9. Dívidas, penhoras e retroactivos

```prisma
model RhProcessoDivida {
  id             String   @id @default(cuid())
  funcionarioId  String
  funcionario    RhFuncionario @relation(fields: [funcionarioId], references: [id])
  tipo           RhTipoDivida
  descricao      String?
  credor         String?                     // para PENHORA (tribunal/entidade)
  numeroProcesso String?
  valorTotal     Decimal  @db.Decimal(18, 4)
  numeroPrestacoes Int
  valorPrestacao Decimal  @db.Decimal(18, 4)
  saldo          Decimal  @db.Decimal(18, 4)
  moeda          String   @default("AOA")
  dataInicio     DateTime
  estado         RhEstadoDivida @default(ATIVA)
  respeitaLimitePenhora Boolean @default(false)
  criadoPorId    String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  prestacoes     RhPrestacaoDivida[]

  @@index([funcionarioId, estado])
}

model RhPrestacaoDivida {
  id             String   @id @default(cuid())
  processoId     String
  processo       RhProcessoDivida @relation(fields: [processoId], references: [id], onDelete: Cascade)
  numero         Int
  ano            Int
  mes            Int
  valor          Decimal  @db.Decimal(18, 4)
  valorDescontado Decimal @db.Decimal(18, 4) @default(0)
  estado         RhEstadoPrestacao @default(PENDENTE)
  processamentoItemId String?

  @@unique([processoId, numero])
  @@index([ano, mes, estado])
}

model RhRetroativo {
  id               String   @id @default(cuid())
  funcionarioId    String
  funcionario      RhFuncionario @relation(fields: [funcionarioId], references: [id])
  rubricaId        String
  rubrica          RhRubrica @relation(fields: [rubricaId], references: [id])
  anoOrigem        Int
  mesOrigem        Int
  anoAplicacao     Int
  mesAplicacao     Int
  valor            Decimal  @db.Decimal(18, 4)
  motivo           String?
  estado           RhEstadoRetroativo @default(PENDENTE)
  processamentoItemId String?
  criadoPorId      String?
  createdAt        DateTime @default(now())

  @@index([funcionarioId, anoAplicacao, mesAplicacao, estado])
}
```

---

## 10. Honorários (independentes)

```prisma
model RhIndependente {
  id            String   @id @default(cuid())
  codigo        String
  nome          String
  nif           String?
  email         String?
  telefone      String?
  morada        String?
  banco         String?
  iban          String?
  taxaRetencao  Decimal? @db.Decimal(9, 4)     // sobrescreve parâmetro global
  ativo         Boolean  @default(true)

  atividades    RhAtividade[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([codigo])
}

model RhAtividade {
  id             String   @id @default(cuid())
  independenteId String
  independente   RhIndependente @relation(fields: [independenteId], references: [id])
  descricao      String
  valorFixo      Decimal? @db.Decimal(18, 4)
  valorHora      Decimal? @db.Decimal(18, 4)
  centroCustoId  String?                         // EXT
  dataInicio     DateTime
  dataFim        DateTime?
  ativa          Boolean  @default(true)

  processamentos RhProcessamentoHonorario[]
  createdAt      DateTime @default(now())

  @@index([independenteId])
}

model RhProcessamentoHonorario {
  id             String   @id @default(cuid())
  atividadeId    String
  atividade      RhAtividade @relation(fields: [atividadeId], references: [id])
  ano            Int
  mes            Int
  quantidade     Decimal? @db.Decimal(18, 4)     // horas
  valorBruto     Decimal  @db.Decimal(18, 4)
  taxaRetencao   Decimal  @db.Decimal(9, 4)
  valorRetencao  Decimal  @db.Decimal(18, 4)
  valorLiquido   Decimal  @db.Decimal(18, 4)
  estado         RhEstadoHonorario @default(PROCESSADO)
  anuladoEm      DateTime?
  motivoAnulacao String?
  criadoPorId    String?
  createdAt      DateTime @default(now())

  pagamentos     RhPagamentoHonorario[]

  @@index([atividadeId, ano, mes])
}

model RhPagamentoHonorario {
  id             String   @id @default(cuid())
  processamentoId String
  processamento  RhProcessamentoHonorario @relation(fields: [processamentoId], references: [id])
  formaPagamento RhFormaPagamento
  valor          Decimal  @db.Decimal(18, 4)
  estado         RhEstadoPagamento @default(PENDENTE)
  dataPagamento  DateTime?
  referencia     String?
  // EXT: contaBancariaId, movimentoTesourariaId
  createdAt      DateTime @default(now())

  @@index([processamentoId])
}
```

---

## 11. Regras de integridade (a aplicar nos services)

| Regra | Onde |
|---|---|
| Só 1 `RhContrato` com `estado = ATIVO` por funcionário | `contratos.service` |
| `RhAfetacao`: soma das percentagens = 100 em cada data de vigência | `assiduidade.service` |
| 1 `RhProcessamento` `PROCESSADO` por `(funcionario, periodo, tipo, sequencia)` | `processamento.service` |
| `FIM_CONTRATO` não pode estar num lote (`modo = LOTE`) | schema Zod + service |
| Período `FECHADO` bloqueia processar/anular | `processamento.service` |
| Anular exige não existir `RhPagamento` com `estado ∈ {PARCIAL, PAGO}` | `processamento.service` |
| `RhRecibo.numero` obtido de `RhSequencia` dentro da transacção | `recibos.service` |
| Itens do processamento guardam **cópia** de código/descrição/incidências | motor + service |
| Alteração/prestação/ausência só marcadas como aplicadas na mesma transacção do processamento | `processamento.service` |
| `Decimal` nunca convertido para `number` em cálculo | motor |

## 12. Índices e desempenho
- Índices já definidos nos modelos; rever após *profiling* do lote.
- `RhProcessamento.snapshot` pode crescer: manter apenas parâmetros e entradas necessárias; **não** duplicar listas completas de ausências (referenciar IDs).
- Paginação obrigatória nas listas (`cursor` ou `skip/take`).

## 13. Seeds (obrigatórios)

1. **Rubricas de sistema**: `SALARIO_BASE`, `SUBS_ALIMENTACAO`, `SUBS_TRANSPORTE`, `SUBS_FERIAS`, `SUBS_NATAL`, `HORAS_EXTRA`, `FALTAS`, `INSS_TRAB`, `INSS_PATRONAL`, `IRT`, `PENHORA`, `ADIANTAMENTO`, `EMPRESTIMO`, `INDEMNIZACAO`, `FERIAS_NAO_GOZADAS`, `RETROATIVO`.
2. **Tipos de ausência**: falta justificada, injustificada, doença, maternidade, paternidade, luto, casamento, licença sem vencimento.
3. **Parâmetros fiscais** (valores a **validar com RH/jurídico** — spec §13): `INSS_TRAB`, `INSS_PATRONAL`, `PCT_SUBS_NATAL`, `PCT_SUBS_FERIAS`, `DIAS_FERIAS_ANO`, `BASE_DIAS_MES`, `LIMITE_PENHORA_PCT`, `HE_*_PCT`, `EXTRAORD_ACUMULA_IRT`, `RETENCAO_HONORARIOS`.
4. **Tabela de IRT vigente** com escalões (fornecida pelo RH).
5. **Períodos** `P01..P12` do ano corrente.
6. **`RhConfiguracao`** singleton com defaults.
7. **Permissões** `rh.*` (ligar ao sistema de permissões existente).

## 14. Estratégia de migração
1. Migração 1: enums + estrutura (`RhDepartamento` … `RhContrato`).
2. Migração 2: rubricas, alterações, assiduidade.
3. Migração 3: parâmetros, períodos, processamento, recibos.
4. Migração 4: pagamentos, dívidas, retroactivos, honorários.
5. Cada migração com *seed* correspondente e script de verificação.
> Nunca alterar tabelas de outros módulos nestas migrações; ligações externas via IDs (`// EXT:`) e, quando a convenção do projecto exigir FKs reais, adicioná-las numa migração separada e revista.
