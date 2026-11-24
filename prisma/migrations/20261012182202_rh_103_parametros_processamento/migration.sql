-- CreateEnum
CREATE TYPE "RhTipoProcessamento" AS ENUM ('VENCIMENTO', 'SUBSIDIO_FERIAS', 'SUBSIDIO_NATAL', 'EXTRAORDINARIO', 'FIM_CONTRATO');

-- CreateEnum
CREATE TYPE "RhModoProcessamento" AS ENUM ('INDIVIDUAL', 'LOTE');

-- CreateEnum
CREATE TYPE "RhEstadoProcessamento" AS ENUM ('PROCESSADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "RhEstadoLote" AS ENUM ('EM_EXECUCAO', 'CONCLUIDO', 'CONCLUIDO_COM_ERROS', 'FALHADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "RhEstadoPeriodo" AS ENUM ('ABERTO', 'FECHADO');

-- CreateEnum
CREATE TYPE "RhTipoPeriodo" AS ENUM ('MENSAL');

-- CreateEnum
CREATE TYPE "RhEstadoRecibo" AS ENUM ('EMITIDO', 'ANULADO');

-- CreateTable
CREATE TABLE "rh_tabelas_irt" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "vigente_ate" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_tabelas_irt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_escaloes_irt" (
    "id" TEXT NOT NULL,
    "tabela_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "rendimento_de" DECIMAL(18,2) NOT NULL,
    "rendimento_ate" DECIMAL(18,2),
    "parcela_fixa" DECIMAL(18,2) NOT NULL,
    "taxa" DECIMAL(9,4) NOT NULL,
    "excesso_de" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "rh_escaloes_irt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_parametros_fiscais" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "tipo_valor" TEXT NOT NULL DEFAULT 'DECIMAL',
    "descricao" TEXT,
    "vigente_desde" DATE NOT NULL,
    "vigente_ate" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_parametros_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_configuracoes" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "modo_subsidio_natal_padrao" "RhModoSubsidioNatal" NOT NULL DEFAULT 'PAGAMENTO_UNICO',
    "mes_subsidio_natal_padrao" INTEGER NOT NULL DEFAULT 12,
    "modo_subsidio_ferias_padrao" "RhModoSubsidioFerias" NOT NULL DEFAULT 'ANTES_GOZO',
    "mes_subsidio_ferias_padrao" INTEGER,
    "base_dias_mes" INTEGER NOT NULL DEFAULT 30,
    "liquido_negativo_bloqueia" BOOLEAN NOT NULL DEFAULT true,
    "serie_recibo" TEXT NOT NULL DEFAULT 'RV',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_configuracoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_periodos" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "RhTipoPeriodo" NOT NULL DEFAULT 'MENSAL',
    "mes" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "estado" "RhEstadoPeriodo" NOT NULL DEFAULT 'ABERTO',
    "fechado_em" TIMESTAMP(3),
    "fechado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_periodos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_lotes_processamento" (
    "id" TEXT NOT NULL,
    "periodo_id" TEXT NOT NULL,
    "modo" "RhModoProcessamento" NOT NULL,
    "operacao" TEXT NOT NULL DEFAULT 'PROCESSAR',
    "tipos" JSONB NOT NULL,
    "parametros" JSONB NOT NULL,
    "estado" "RhEstadoLote" NOT NULL DEFAULT 'EM_EXECUCAO',
    "total_funcionarios" INTEGER NOT NULL DEFAULT 0,
    "total_sucesso" INTEGER NOT NULL DEFAULT 0,
    "total_erros" INTEGER NOT NULL DEFAULT 0,
    "total_liquido" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "relatorio_erros" JSONB,
    "criado_por_id" TEXT,
    "iniciado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluido_em" TIMESTAMP(3),

    CONSTRAINT "rh_lotes_processamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_processamentos" (
    "id" TEXT NOT NULL,
    "lote_id" TEXT,
    "periodo_id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "contrato_id" TEXT,
    "tipo" "RhTipoProcessamento" NOT NULL,
    "sequencia" INTEGER NOT NULL DEFAULT 1,
    "modo" "RhModoProcessamento" NOT NULL,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "estado" "RhEstadoProcessamento" NOT NULL DEFAULT 'PROCESSADO',
    "data_processamento" TIMESTAMP(3) NOT NULL,
    "data_limite_faltas_he" TIMESTAMP(3),
    "dias_processados" INTEGER NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'AOA',
    "taxa_cambio" DECIMAL(18,6),
    "total_remuneracoes" DECIMAL(18,4) NOT NULL,
    "total_descontos" DECIMAL(18,4) NOT NULL,
    "total_encargos" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "liquido" DECIMAL(18,4) NOT NULL,
    "base_inss" DECIMAL(18,4) NOT NULL,
    "base_irt" DECIMAL(18,4) NOT NULL,
    "inss_trabalhador" DECIMAL(18,4) NOT NULL,
    "inss_patronal" DECIMAL(18,4) NOT NULL,
    "irt" DECIMAL(18,4) NOT NULL,
    "irt_escalao_id" TEXT,
    "snapshot" JSONB NOT NULL,
    "avisos" JSONB,
    "anulado_em" TIMESTAMP(3),
    "anulado_por_id" TEXT,
    "motivo_anulacao" TEXT,
    "criado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_processamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_processamento_itens" (
    "id" TEXT NOT NULL,
    "processamento_id" TEXT NOT NULL,
    "rubrica_id" TEXT,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "RhTipoRubrica" NOT NULL,
    "origem" "RhOrigemItem" NOT NULL,
    "quantidade" DECIMAL(18,4),
    "valor_unitario" DECIMAL(18,4),
    "valor" DECIMAL(18,4) NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'AOA',
    "taxa_cambio" DECIMAL(18,6),
    "incide_irt" BOOLEAN NOT NULL,
    "incide_inss" BOOLEAN NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 100,
    "referencia_id" TEXT,

    CONSTRAINT "rh_processamento_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_recibos" (
    "id" TEXT NOT NULL,
    "processamento_id" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "RhEstadoRecibo" NOT NULL DEFAULT 'EMITIDO',
    "emitido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impressoes" INTEGER NOT NULL DEFAULT 0,
    "pdf_path" TEXT,
    "anulado_em" TIMESTAMP(3),

    CONSTRAINT "rh_recibos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_restricoes_funcionario" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "tipo_processamento" "RhTipoProcessamento",
    "motivo" TEXT NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_restricoes_funcionario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rh_tabelas_irt_empresa_id_vigente_desde_idx" ON "rh_tabelas_irt"("empresa_id", "vigente_desde");

-- CreateIndex
CREATE UNIQUE INDEX "rh_escaloes_irt_tabela_id_ordem_key" ON "rh_escaloes_irt"("tabela_id", "ordem");

-- CreateIndex
CREATE INDEX "rh_parametros_fiscais_empresa_id_chave_vigente_desde_idx" ON "rh_parametros_fiscais"("empresa_id", "chave", "vigente_desde");

-- CreateIndex
CREATE UNIQUE INDEX "rh_configuracoes_empresa_id_key" ON "rh_configuracoes"("empresa_id");

-- CreateIndex
CREATE INDEX "rh_periodos_empresa_id_ano_mes_idx" ON "rh_periodos"("empresa_id", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "rh_periodos_empresa_id_ano_codigo_key" ON "rh_periodos"("empresa_id", "ano", "codigo");

-- CreateIndex
CREATE INDEX "rh_lotes_processamento_periodo_id_estado_idx" ON "rh_lotes_processamento"("periodo_id", "estado");

-- CreateIndex
CREATE INDEX "rh_processamentos_funcionario_id_periodo_id_tipo_estado_idx" ON "rh_processamentos"("funcionario_id", "periodo_id", "tipo", "estado");

-- CreateIndex
CREATE INDEX "rh_processamentos_periodo_id_estado_idx" ON "rh_processamentos"("periodo_id", "estado");

-- CreateIndex
CREATE INDEX "rh_processamentos_lote_id_idx" ON "rh_processamentos"("lote_id");

-- CreateIndex
CREATE INDEX "rh_processamento_itens_processamento_id_idx" ON "rh_processamento_itens"("processamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "rh_recibos_processamento_id_key" ON "rh_recibos"("processamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "rh_recibos_serie_ano_numero_key" ON "rh_recibos"("serie", "ano", "numero");

-- CreateIndex
CREATE INDEX "rh_restricoes_funcionario_funcionario_id_ativa_idx" ON "rh_restricoes_funcionario"("funcionario_id", "ativa");

-- AddForeignKey
ALTER TABLE "rh_tabelas_irt" ADD CONSTRAINT "rh_tabelas_irt_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_escaloes_irt" ADD CONSTRAINT "rh_escaloes_irt_tabela_id_fkey" FOREIGN KEY ("tabela_id") REFERENCES "rh_tabelas_irt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_parametros_fiscais" ADD CONSTRAINT "rh_parametros_fiscais_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_configuracoes" ADD CONSTRAINT "rh_configuracoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_periodos" ADD CONSTRAINT "rh_periodos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_lotes_processamento" ADD CONSTRAINT "rh_lotes_processamento_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "rh_periodos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_processamentos" ADD CONSTRAINT "rh_processamentos_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "rh_lotes_processamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_processamentos" ADD CONSTRAINT "rh_processamentos_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "rh_periodos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_processamentos" ADD CONSTRAINT "rh_processamentos_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_processamento_itens" ADD CONSTRAINT "rh_processamento_itens_processamento_id_fkey" FOREIGN KEY ("processamento_id") REFERENCES "rh_processamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_processamento_itens" ADD CONSTRAINT "rh_processamento_itens_rubrica_id_fkey" FOREIGN KEY ("rubrica_id") REFERENCES "rh_rubricas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_recibos" ADD CONSTRAINT "rh_recibos_processamento_id_fkey" FOREIGN KEY ("processamento_id") REFERENCES "rh_processamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_restricoes_funcionario" ADD CONSTRAINT "rh_restricoes_funcionario_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
