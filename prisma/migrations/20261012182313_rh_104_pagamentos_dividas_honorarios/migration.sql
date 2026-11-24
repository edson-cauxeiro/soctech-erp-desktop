-- CreateEnum
CREATE TYPE "RhEstadoPagamento" AS ENUM ('PENDENTE', 'PARCIAL', 'PAGO', 'ESTORNADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "RhEstadoOrdemPagamento" AS ENUM ('ABERTA', 'ENVIADA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "RhTipoDivida" AS ENUM ('ADIANTAMENTO', 'EMPRESTIMO', 'PENHORA', 'OUTRO');

-- CreateEnum
CREATE TYPE "RhEstadoDivida" AS ENUM ('ATIVA', 'SUSPENSA', 'LIQUIDADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "RhEstadoPrestacao" AS ENUM ('PENDENTE', 'DESCONTADA', 'ANULADA', 'PERDOADA');

-- CreateEnum
CREATE TYPE "RhEstadoRetroativo" AS ENUM ('PENDENTE', 'APLICADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "RhEstadoHonorario" AS ENUM ('PROCESSADO', 'ANULADO');

-- CreateTable
CREATE TABLE "centros_custo" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "centros_custo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_ordens_pagamento" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "periodo_id" TEXT,
    "banco" TEXT,
    "forma_pagamento" "RhFormaPagamento" NOT NULL,
    "estado" "RhEstadoOrdemPagamento" NOT NULL DEFAULT 'ABERTA',
    "total_valor" DECIMAL(18,4) NOT NULL,
    "ficheiro_path" TEXT,
    "criado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_ordens_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_pagamentos" (
    "id" TEXT NOT NULL,
    "processamento_id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "ordem_id" TEXT,
    "formaPagamento" "RhFormaPagamento" NOT NULL,
    "valor" DECIMAL(18,4) NOT NULL,
    "valor_pago" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "estado" "RhEstadoPagamento" NOT NULL DEFAULT 'PENDENTE',
    "data_pagamento" TIMESTAMP(3),
    "referencia" TEXT,
    "estornado_em" TIMESTAMP(3),
    "motivo_estorno" TEXT,
    "criado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_processos_divida" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "tipo" "RhTipoDivida" NOT NULL,
    "descricao" TEXT,
    "credor" TEXT,
    "numero_processo" TEXT,
    "valor_total" DECIMAL(18,4) NOT NULL,
    "numero_prestacoes" INTEGER NOT NULL,
    "valor_prestacao" DECIMAL(18,4) NOT NULL,
    "saldo" DECIMAL(18,4) NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'AOA',
    "data_inicio" DATE NOT NULL,
    "estado" "RhEstadoDivida" NOT NULL DEFAULT 'ATIVA',
    "respeita_limite_penhora" BOOLEAN NOT NULL DEFAULT false,
    "criado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_processos_divida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_prestacoes_divida" (
    "id" TEXT NOT NULL,
    "processo_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "valor" DECIMAL(18,4) NOT NULL,
    "valor_descontado" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "estado" "RhEstadoPrestacao" NOT NULL DEFAULT 'PENDENTE',
    "processamento_item_id" TEXT,

    CONSTRAINT "rh_prestacoes_divida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_retroativos" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "rubrica_id" TEXT NOT NULL,
    "ano_origem" INTEGER NOT NULL,
    "mes_origem" INTEGER NOT NULL,
    "ano_aplicacao" INTEGER NOT NULL,
    "mes_aplicacao" INTEGER NOT NULL,
    "valor" DECIMAL(18,4) NOT NULL,
    "motivo" TEXT,
    "estado" "RhEstadoRetroativo" NOT NULL DEFAULT 'PENDENTE',
    "processamento_item_id" TEXT,
    "criado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_retroativos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_independentes" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nif" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "morada" TEXT,
    "banco" TEXT,
    "iban" TEXT,
    "taxa_retencao" DECIMAL(9,4),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_independentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_atividades" (
    "id" TEXT NOT NULL,
    "independente_id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor_fixo" DECIMAL(18,4),
    "valor_hora" DECIMAL(18,4),
    "centro_custo_id" TEXT,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_atividades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_processamentos_honorario" (
    "id" TEXT NOT NULL,
    "atividade_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "quantidade" DECIMAL(18,4),
    "valor_bruto" DECIMAL(18,4) NOT NULL,
    "taxa_retencao" DECIMAL(9,4) NOT NULL,
    "valor_retencao" DECIMAL(18,4) NOT NULL,
    "valor_liquido" DECIMAL(18,4) NOT NULL,
    "estado" "RhEstadoHonorario" NOT NULL DEFAULT 'PROCESSADO',
    "anulado_em" TIMESTAMP(3),
    "motivo_anulacao" TEXT,
    "criado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_processamentos_honorario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_pagamentos_honorario" (
    "id" TEXT NOT NULL,
    "processamento_id" TEXT NOT NULL,
    "formaPagamento" "RhFormaPagamento" NOT NULL,
    "valor" DECIMAL(18,4) NOT NULL,
    "estado" "RhEstadoPagamento" NOT NULL DEFAULT 'PENDENTE',
    "data_pagamento" TIMESTAMP(3),
    "referencia" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_pagamentos_honorario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "centros_custo_empresa_id_ativo_idx" ON "centros_custo"("empresa_id", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "centros_custo_empresa_id_codigo_key" ON "centros_custo"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "rh_ordens_pagamento_empresa_id_numero_key" ON "rh_ordens_pagamento"("empresa_id", "numero");

-- CreateIndex
CREATE INDEX "rh_pagamentos_processamento_id_idx" ON "rh_pagamentos"("processamento_id");

-- CreateIndex
CREATE INDEX "rh_pagamentos_funcionario_id_estado_idx" ON "rh_pagamentos"("funcionario_id", "estado");

-- CreateIndex
CREATE INDEX "rh_processos_divida_funcionario_id_estado_idx" ON "rh_processos_divida"("funcionario_id", "estado");

-- CreateIndex
CREATE INDEX "rh_prestacoes_divida_ano_mes_estado_idx" ON "rh_prestacoes_divida"("ano", "mes", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "rh_prestacoes_divida_processo_id_numero_key" ON "rh_prestacoes_divida"("processo_id", "numero");

-- CreateIndex
CREATE INDEX "rh_retroativos_funcionario_id_ano_aplicacao_mes_aplicacao_e_idx" ON "rh_retroativos"("funcionario_id", "ano_aplicacao", "mes_aplicacao", "estado");

-- CreateIndex
CREATE INDEX "rh_independentes_empresa_id_ativo_idx" ON "rh_independentes"("empresa_id", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "rh_independentes_empresa_id_codigo_key" ON "rh_independentes"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "rh_atividades_independente_id_idx" ON "rh_atividades"("independente_id");

-- CreateIndex
CREATE INDEX "rh_processamentos_honorario_atividade_id_ano_mes_idx" ON "rh_processamentos_honorario"("atividade_id", "ano", "mes");

-- CreateIndex
CREATE INDEX "rh_pagamentos_honorario_processamento_id_idx" ON "rh_pagamentos_honorario"("processamento_id");

-- AddForeignKey
ALTER TABLE "rh_afetacoes" ADD CONSTRAINT "rh_afetacoes_centro_custo_id_fkey" FOREIGN KEY ("centro_custo_id") REFERENCES "centros_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "centros_custo" ADD CONSTRAINT "centros_custo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_ordens_pagamento" ADD CONSTRAINT "rh_ordens_pagamento_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_pagamentos" ADD CONSTRAINT "rh_pagamentos_processamento_id_fkey" FOREIGN KEY ("processamento_id") REFERENCES "rh_processamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_pagamentos" ADD CONSTRAINT "rh_pagamentos_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_pagamentos" ADD CONSTRAINT "rh_pagamentos_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "rh_ordens_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_processos_divida" ADD CONSTRAINT "rh_processos_divida_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_prestacoes_divida" ADD CONSTRAINT "rh_prestacoes_divida_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "rh_processos_divida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_retroativos" ADD CONSTRAINT "rh_retroativos_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_retroativos" ADD CONSTRAINT "rh_retroativos_rubrica_id_fkey" FOREIGN KEY ("rubrica_id") REFERENCES "rh_rubricas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_independentes" ADD CONSTRAINT "rh_independentes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_atividades" ADD CONSTRAINT "rh_atividades_independente_id_fkey" FOREIGN KEY ("independente_id") REFERENCES "rh_independentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_atividades" ADD CONSTRAINT "rh_atividades_centro_custo_id_fkey" FOREIGN KEY ("centro_custo_id") REFERENCES "centros_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_processamentos_honorario" ADD CONSTRAINT "rh_processamentos_honorario_atividade_id_fkey" FOREIGN KEY ("atividade_id") REFERENCES "rh_atividades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_pagamentos_honorario" ADD CONSTRAINT "rh_pagamentos_honorario_processamento_id_fkey" FOREIGN KEY ("processamento_id") REFERENCES "rh_processamentos_honorario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
