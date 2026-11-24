-- CreateEnum
CREATE TYPE "RhEstadoFuncionario" AS ENUM ('ATIVO', 'SUSPENSO', 'INATIVO', 'CESSADO');

-- CreateEnum
CREATE TYPE "RhGenero" AS ENUM ('MASCULINO', 'FEMININO', 'OUTRO');

-- CreateEnum
CREATE TYPE "RhEstadoCivil" AS ENUM ('SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_FACTO');

-- CreateEnum
CREATE TYPE "RhFormaPagamento" AS ENUM ('TRANSFERENCIA', 'NUMERARIO', 'CHEQUE');

-- CreateEnum
CREATE TYPE "RhTipoContrato" AS ENUM ('PRAZO_INDETERMINADO', 'PRAZO_CERTO', 'EXPERIENCIA', 'ESTAGIO', 'TEMPO_PARCIAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "RhEstadoContrato" AS ENUM ('ATIVO', 'ENCERRADO', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "RhMotivoCessacao" AS ENUM ('TERMO', 'DEMISSAO', 'DESPEDIMENTO', 'MUTUO_ACORDO', 'REFORMA', 'FALECIMENTO', 'PERIODO_EXPERIENCIA', 'OUTRO');

-- CreateEnum
CREATE TYPE "RhModoSubsidioNatal" AS ENUM ('PAGAMENTO_UNICO', 'DUODECIMOS');

-- CreateEnum
CREATE TYPE "RhModoSubsidioFerias" AS ENUM ('ANTES_GOZO', 'MES_FIXO', 'DUODECIMOS');

-- CreateTable
CREATE TABLE "rh_departamentos" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_departamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_cargos" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_cargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_funcionarios" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento_numero" TEXT,
    "nif" TEXT,
    "niss" TEXT,
    "data_nascimento" DATE,
    "genero" "RhGenero",
    "estado_civil" "RhEstadoCivil",
    "nacionalidade" TEXT,
    "morada" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "foto_path" TEXT,
    "departamento_id" TEXT,
    "cargo_id" TEXT,
    "categoria" TEXT,
    "data_admissao" DATE NOT NULL,
    "data_cessacao" DATE,
    "estado" "RhEstadoFuncionario" NOT NULL DEFAULT 'ATIVO',
    "forma_pagamento" "RhFormaPagamento" NOT NULL DEFAULT 'TRANSFERENCIA',
    "banco" TEXT,
    "iban" TEXT,
    "modo_subsidio_natal" "RhModoSubsidioNatal",
    "modo_subsidio_ferias" "RhModoSubsidioFerias",
    "mes_pagamento_subsidio_natal" INTEGER,
    "mes_pagamento_subsidio_ferias" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_funcionarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_dependentes" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "parentesco" TEXT NOT NULL,
    "data_nascimento" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_dependentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_funcionario_documentos" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT,
    "caminho" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_funcionario_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_contratos" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "tipo" "RhTipoContrato" NOT NULL,
    "estado" "RhEstadoContrato" NOT NULL DEFAULT 'ATIVO',
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE,
    "salario_base" DECIMAL(18,4) NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'AOA',
    "carga_horaria_semanal" INTEGER NOT NULL DEFAULT 44,
    "categoria" TEXT,
    "motivo_cessacao" "RhMotivoCessacao",
    "data_cessacao" DATE,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rh_contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_alteracoes_salariais" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "data_efeito" DATE NOT NULL,
    "salario_anterior" DECIMAL(18,4) NOT NULL,
    "salario_novo" DECIMAL(18,4) NOT NULL,
    "motivo" TEXT,
    "criado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_alteracoes_salariais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_sequencias" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rh_sequencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rh_departamentos_empresa_id_ativo_idx" ON "rh_departamentos"("empresa_id", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "rh_departamentos_empresa_id_codigo_key" ON "rh_departamentos"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "rh_cargos_empresa_id_ativo_idx" ON "rh_cargos"("empresa_id", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "rh_cargos_empresa_id_codigo_key" ON "rh_cargos"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "rh_funcionarios_empresa_id_estado_idx" ON "rh_funcionarios"("empresa_id", "estado");

-- CreateIndex
CREATE INDEX "rh_funcionarios_nome_idx" ON "rh_funcionarios"("nome");

-- CreateIndex
CREATE INDEX "rh_funcionarios_nif_idx" ON "rh_funcionarios"("nif");

-- CreateIndex
CREATE UNIQUE INDEX "rh_funcionarios_empresa_id_codigo_key" ON "rh_funcionarios"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "rh_dependentes_funcionario_id_idx" ON "rh_dependentes"("funcionario_id");

-- CreateIndex
CREATE INDEX "rh_funcionario_documentos_funcionario_id_idx" ON "rh_funcionario_documentos"("funcionario_id");

-- CreateIndex
CREATE INDEX "rh_contratos_funcionario_id_estado_idx" ON "rh_contratos"("funcionario_id", "estado");

-- CreateIndex
CREATE INDEX "rh_alteracoes_salariais_contrato_id_data_efeito_idx" ON "rh_alteracoes_salariais"("contrato_id", "data_efeito");

-- CreateIndex
CREATE UNIQUE INDEX "rh_sequencias_chave_key" ON "rh_sequencias"("chave");

-- AddForeignKey
ALTER TABLE "rh_departamentos" ADD CONSTRAINT "rh_departamentos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_cargos" ADD CONSTRAINT "rh_cargos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_funcionarios" ADD CONSTRAINT "rh_funcionarios_departamento_id_fkey" FOREIGN KEY ("departamento_id") REFERENCES "rh_departamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_funcionarios" ADD CONSTRAINT "rh_funcionarios_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "rh_cargos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_funcionarios" ADD CONSTRAINT "rh_funcionarios_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_dependentes" ADD CONSTRAINT "rh_dependentes_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_funcionario_documentos" ADD CONSTRAINT "rh_funcionario_documentos_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_contratos" ADD CONSTRAINT "rh_contratos_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "rh_funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh_alteracoes_salariais" ADD CONSTRAINT "rh_alteracoes_salariais_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "rh_contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
