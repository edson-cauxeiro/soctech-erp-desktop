-- CreateEnum
CREATE TYPE "TipoLocalizacao" AS ENUM ('estrutura', 'prateleira', 'nivel', 'posicao', 'palete', 'contentor');

-- Duas instruções que o `prisma migrate dev` sugeriu e que foram removidas de
-- propósito, por serem anteriores a este trabalho e não lhe dizerem respeito:
--
--   ALTER TABLE "contas_bancarias" DROP CONSTRAINT "contas_bancarias_empresa_id_fkey";
--   DROP INDEX "movimentos_tesouraria_meio_pagamento_idx";
--
-- A primeira só tentaria reescrever `NO ACTION` como `RESTRICT`, que em
-- PostgreSQL se comporta igual numa FK não diferível. A segunda apagaria um
-- índice criado por `20260929160000_tesouraria_totais_sessao`, mas que
-- `schema.prisma` nunca declarou — uma divergência antiga entre schema e base
-- de dados, que não deve ser resolvida às escondidas numa migração de armazéns.
-- A correcção pertence a uma alteração própria da tesouraria.

-- AlterTable
ALTER TABLE "armazens" ADD COLUMN     "descricao" TEXT,
ADD COLUMN     "empresa_id" TEXT;

-- AlterTable
ALTER TABLE "artigos" ADD COLUMN     "classe_armazenamento_id" TEXT;

-- CreateTable
CREATE TABLE "armazens_areas" (
    "id" TEXT NOT NULL,
    "armazem_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT NOT NULL,
    "tipo" TEXT,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "armazens_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "armazens_zonas" (
    "id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT NOT NULL,
    "descricao" TEXT,
    "alta_rotacao" BOOLEAN NOT NULL DEFAULT false,
    "temperatura_controlada" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "armazens_zonas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "armazens_localizacoes" (
    "id" TEXT NOT NULL,
    "zona_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT,
    "tipo" "TipoLocalizacao" NOT NULL DEFAULT 'estrutura',
    "corredor" TEXT,
    "estante" TEXT,
    "nivel" INTEGER,
    "posicao" INTEGER,
    "capacidade_quantidade" DECIMAL(18,4),
    "capacidade_peso" DECIMAL(18,4),
    "capacidade_volume" DECIMAL(18,4),
    "permitir_mix_produtos" BOOLEAN NOT NULL DEFAULT true,
    "permitir_mix_lotes" BOOLEAN NOT NULL DEFAULT true,
    "is_pickable" BOOLEAN NOT NULL DEFAULT true,
    "is_putaway" BOOLEAN NOT NULL DEFAULT true,
    "bloqueada" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "armazens_localizacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes_armazenamento" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT NOT NULL,
    "descricao" TEXT,
    "exige_temperatura_controlada" BOOLEAN NOT NULL DEFAULT false,
    "exige_lote" BOOLEAN NOT NULL DEFAULT false,
    "exige_numero_serie" BOOLEAN NOT NULL DEFAULT false,
    "exige_data_validade" BOOLEAN NOT NULL DEFAULT false,
    "max_armazenamento_peso" DECIMAL(18,4),
    "max_armazenamento_volume" DECIMAL(18,4),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_armazenamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "armazens_areas_armazem_id_idx" ON "armazens_areas"("armazem_id");

-- CreateIndex
CREATE UNIQUE INDEX "armazens_areas_armazem_id_codigo_key" ON "armazens_areas"("armazem_id", "codigo");

-- CreateIndex
CREATE INDEX "armazens_zonas_area_id_idx" ON "armazens_zonas"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "armazens_zonas_area_id_codigo_key" ON "armazens_zonas"("area_id", "codigo");

-- CreateIndex
CREATE INDEX "armazens_localizacoes_zona_id_idx" ON "armazens_localizacoes"("zona_id");

-- CreateIndex
CREATE INDEX "armazens_localizacoes_parent_id_idx" ON "armazens_localizacoes"("parent_id");

-- CreateIndex
CREATE INDEX "armazens_localizacoes_is_pickable_is_putaway_idx" ON "armazens_localizacoes"("is_pickable", "is_putaway");

-- CreateIndex
CREATE UNIQUE INDEX "armazens_localizacoes_zona_id_codigo_key" ON "armazens_localizacoes"("zona_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "classes_armazenamento_codigo_key" ON "classes_armazenamento"("codigo");

-- CreateIndex
CREATE INDEX "armazens_empresa_id_idx" ON "armazens"("empresa_id");

-- CreateIndex
CREATE INDEX "artigos_classe_armazenamento_id_idx" ON "artigos"("classe_armazenamento_id");

-- AddForeignKey
ALTER TABLE "artigos" ADD CONSTRAINT "artigos_armazem_padrao_id_fkey" FOREIGN KEY ("armazem_padrao_id") REFERENCES "armazens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artigos" ADD CONSTRAINT "artigos_classe_armazenamento_id_fkey" FOREIGN KEY ("classe_armazenamento_id") REFERENCES "classes_armazenamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armazens" ADD CONSTRAINT "armazens_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armazens_areas" ADD CONSTRAINT "armazens_areas_armazem_id_fkey" FOREIGN KEY ("armazem_id") REFERENCES "armazens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armazens_zonas" ADD CONSTRAINT "armazens_zonas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "armazens_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armazens_localizacoes" ADD CONSTRAINT "armazens_localizacoes_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "armazens_zonas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "armazens_localizacoes" ADD CONSTRAINT "armazens_localizacoes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "armazens_localizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
