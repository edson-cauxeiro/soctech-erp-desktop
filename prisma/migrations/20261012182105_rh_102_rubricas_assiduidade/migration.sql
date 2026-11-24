-- CreateEnum
CREATE TYPE "RhTipoRubrica" AS ENUM ('REMUNERACAO', 'DESCONTO', 'ENCARGO_PATRONAL');

-- CreateEnum
CREATE TYPE "RhNaturezaRubrica" AS ENUM ('FIXA', 'VARIAVEL', 'EXTRAORDINARIA');

-- CreateEnum
CREATE TYPE "RhFormaCalculoRubrica" AS ENUM ('VALOR_FIXO', 'PERCENTAGEM_SALARIO', 'VALOR_X_QUANTIDADE', 'SISTEMA');

-- CreateEnum
CREATE TYPE "RhOrigemItem" AS ENUM ('AUTOMATICO', 'MANUAL', 'ALTERACAO_MENSAL', 'RECORRENTE', 'DIVIDA', 'RETROATIVO', 'SISTEMA');

-- CreateEnum
CREATE TYPE "RhEstadoAlteracao" AS ENUM ('PENDENTE', 'APLICADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "RhTipoHoraExtra" AS ENUM ('DIURNA_UTIL', 'NOTURNA', 'DESCANSO_FERIADO');

-- CreateEnum
CREATE TYPE "RhEstadoAprovacao" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "RhEstadoFerias" AS ENUM ('PLANEADA', 'APROVADA', 'GOZADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "rh_rubricas" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "RhTipoRubrica" NOT NULL,
    "natureza" "RhNaturezaRubrica" NOT NULL DEFAULT 'FIXA',
    "forma_calculo" "RhFormaCalculoRubrica" NOT NULL DEFAULT 'VALOR_FIXO',
    "valor_padrao" DECIMAL(18,4),
    "percentagem" DECIMAL(9,4),
    "incide_irt" BOOLEAN NOT NULL DEFAULT true,
    "incide_inss" BOOLEAN NOT NULL DEFAULT true,
    "limite_isencao_irt" DECIMAL(18,4),
    "limite_isencao_inss" DECIMAL(18,4),
    "ordem_recibo" INTEGER NOT NULL DEFAULT 100,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "codigo_sistema" TEXT,
    "conta_debito_id" TEXT,
    "conta_credito_id" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_rubricas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_funcionario_rubricas" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "rubrica_id" TEXT NOT NULL,
    "valor" DECIMAL(18,4),
    "percentagem" DECIMAL(9,4),
    "moeda" TEXT NOT NULL DEFAULT 'AOA',
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_funcionario_rubricas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_alteracoes_mensais" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "rubrica_id" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4),
    "valor" DECIMAL(18,4) NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'AOA',
    "extraordinaria" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "estado" "RhEstadoAlteracao" NOT NULL DEFAULT 'PENDENTE',
    "processamento_item_id" TEXT,
    "criado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_alteracoes_mensais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_tipos_ausencia" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "justificada" BOOLEAN NOT NULL DEFAULT true,
    "desconta_salario" BOOLEAN NOT NULL DEFAULT false,
    "desconta_subsidio_alimentacao" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_tipos_ausencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_ausencias" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "tipo_id" TEXT NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "dias" DECIMAL(9,2) NOT NULL,
    "horas" DECIMAL(9,2),
    "justificativo_path" TEXT,
    "observacao" TEXT,
    "estado" "RhEstadoAprovacao" NOT NULL DEFAULT 'PENDENTE',
    "aprovado_por_id" TEXT,
    "processada_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_ausencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_horas_extra" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "horas" DECIMAL(9,2) NOT NULL,
    "tipo" "RhTipoHoraExtra" NOT NULL,
    "percentagem" DECIMAL(9,4) NOT NULL,
    "estado" "RhEstadoAprovacao" NOT NULL DEFAULT 'PENDENTE',
    "processada_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_horas_extra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_ferias_saldos" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "dias_direito" DECIMAL(9,2) NOT NULL DEFAULT 22,
    "dias_transitados" DECIMAL(9,2) NOT NULL DEFAULT 0,
    "dias_marcados" DECIMAL(9,2) NOT NULL DEFAULT 0,
    "dias_gozados" DECIMAL(9,2) NOT NULL DEFAULT 0,
    "subsidio_ferias_processado" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_ferias_saldos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_marcacoes_ferias" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "dias" DECIMAL(9,2) NOT NULL,
    "estado" "RhEstadoFerias" NOT NULL DEFAULT 'PLANEADA',
    "aprovado_por_id" TEXT,
    "subsidio_processamento_id" TEXT,
    "observacao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_marcacoes_ferias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_afetacoes" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "centro_custo_id" TEXT,
    "percentagem" DECIMAL(9,4) NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_afetacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rh_rubricas_empresa_id_tipo_ativo_idx" ON "rh_rubricas"("empresa_id", "tipo", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "rh_rubricas_empresa_id_codigo_key" ON "rh_rubricas"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "rh_funcionario_rubricas_funcionario_id_ativo_idx" ON "rh_funcionario_rubricas"("funcionario_id", "ativo");

-- CreateIndex
CREATE INDEX "rh_alteracoes_mensais_funcionario_id_ano_mes_estado_idx" ON "rh_alteracoes_mensais"("funcionario_id", "ano", "mes", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "rh_tipos_ausencia_empresa_id_codigo_key" ON "rh_tipos_ausencia"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "rh_ausencias_funcionario_id_data_inicio_idx" ON "rh_ausencias"("funcionario_id", "data_inicio");

-- CreateIndex
CREATE INDEX "rh_horas_extra_funcionario_id_data_idx" ON "rh_horas_extra"("funcionario_id", "data");

-- CreateIndex
CREATE UNIQUE INDEX "rh_ferias_saldos_funcionario_id_ano_key" ON "rh_ferias_saldos"("funcionario_id", "ano");

-- CreateIndex
CREATE INDEX "rh_marcacoes_ferias_funcionario_id_ano_idx" ON "rh_marcacoes_ferias"("funcionario_id", "ano");

-- CreateIndex
CREATE INDEX "rh_afetacoes_funcionario_id_data_inicio_idx" ON "rh_afetacoes"("funcionario_id", "data_inicio");

-- AddForeignKey
ALTER TABLE "rh_rubricas" ADD CONSTRAINT "rh_rubricas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_funcionario_rubricas" ADD CONSTRAINT "rh_funcionario_rubricas_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_funcionario_rubricas" ADD CONSTRAINT "rh_funcionario_rubricas_rubrica_id_fkey" FOREIGN KEY ("rubrica_id") REFERENCES "rh_rubricas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_alteracoes_mensais" ADD CONSTRAINT "rh_alteracoes_mensais_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_alteracoes_mensais" ADD CONSTRAINT "rh_alteracoes_mensais_rubrica_id_fkey" FOREIGN KEY ("rubrica_id") REFERENCES "rh_rubricas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_tipos_ausencia" ADD CONSTRAINT "rh_tipos_ausencia_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_ausencias" ADD CONSTRAINT "rh_ausencias_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_ausencias" ADD CONSTRAINT "rh_ausencias_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "rh_tipos_ausencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_horas_extra" ADD CONSTRAINT "rh_horas_extra_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_ferias_saldos" ADD CONSTRAINT "rh_ferias_saldos_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_marcacoes_ferias" ADD CONSTRAINT "rh_marcacoes_ferias_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_afetacoes" ADD CONSTRAINT "rh_afetacoes_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
