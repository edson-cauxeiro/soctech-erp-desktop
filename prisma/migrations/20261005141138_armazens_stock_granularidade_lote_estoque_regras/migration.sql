-- CreateEnum
CREATE TYPE "EstadoEstoque" AS ENUM ('disponivel', 'quarentena', 'bloqueado', 'esgotado');

-- CreateEnum
CREATE TYPE "EstrategiaPicking" AS ENUM ('fifo', 'fefo', 'mais_proximo', 'manual');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMovimentoStock" ADD VALUE 'devolucao';
ALTER TYPE "TipoMovimentoStock" ADD VALUE 'quarentena';
ALTER TYPE "TipoMovimentoStock" ADD VALUE 'liberacao';

-- Duas instruções que o `prisma migrate dev` sugeriu e que foram removidas de
-- propósito, por serem anteriores a este trabalho e não lhe dizerem respeito
-- (ver a justificação completa na migration
-- `20261005141007_armazens_estrutura_area_zona_localizacao_classe`):
--
--   ALTER TABLE "contas_bancarias" DROP CONSTRAINT "contas_bancarias_empresa_id_fkey";
--   DROP INDEX "movimentos_tesouraria_meio_pagamento_idx";

-- AlterTable
ALTER TABLE "movimentos_stock" ADD COLUMN     "criado_por_id" TEXT,
ADD COLUMN     "documento_id" TEXT,
ADD COLUMN     "documento_tipo" TEXT,
ADD COLUMN     "localizacao_destino_id" TEXT,
ADD COLUMN     "localizacao_origem_id" TEXT,
ADD COLUMN     "lote_id" TEXT;

-- CreateTable
CREATE TABLE "lotes" (
    "id" TEXT NOT NULL,
    "artigo_id" TEXT NOT NULL,
    "numero_lote" TEXT NOT NULL,
    "data_fabrico" DATE,
    "data_validade" DATE,
    "fornecedor_id" TEXT,
    "preco_custo" DECIMAL(18,4),
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estoques" (
    "id" TEXT NOT NULL,
    "artigo_id" TEXT NOT NULL,
    "armazem_id" TEXT NOT NULL,
    "localizacao_id" TEXT,
    "lote_id" TEXT,
    "quantidade" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "quantidade_reservada" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "custo_unitario" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "estado" "EstadoEstoque" NOT NULL DEFAULT 'disponivel',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estoques_pkey" PRIMARY KEY ("id")
);

-- Invariantes de saldo que o Prisma não sabe exprimir, e que têm de estar na
-- base de dados: um saldo negativo ou uma reserva maior do que o disponível
-- corromperia o stock sem que nenhum serviço se llegue a dar por ela.

-- Uma posição de stock é única por artigo + armazém + localização + lote.
-- `localizacao_id` e `lote_id` são opcionais (decisão D4 da auditoria), e o
-- `NULLS NOT DISTINCT` do PostgreSQL 15+ não é expressável no schema do Prisma,
-- pelo que se usa um índice sobre `COALESCE`. Sem isto, duas linhas com
-- localização nula seriam ambas válidas e o saldo passaria a contar duas vezes.
CREATE UNIQUE INDEX "estoques_posicao_unica" ON "estoques" (
    "artigo_id",
    "armazem_id",
    COALESCE("localizacao_id", ''),
    COALESCE("lote_id", '')
);

-- Não pode existir stock negativo, nem reservado acima do disponível.
ALTER TABLE "estoques" ADD CONSTRAINT "estoques_quantidade_nao_negativa"
    CHECK ("quantidade" >= 0);

ALTER TABLE "estoques" ADD CONSTRAINT "estoques_reserva_valida"
    CHECK ("quantidade_reservada" >= 0 AND "quantidade_reservada" <= "quantidade");

-- A capacidade declarada não pode ser negativa.
ALTER TABLE "armazens_localizacoes" ADD CONSTRAINT "armazens_localizacoes_capacidade_nao_negativa"
    CHECK (
        ("capacidade_quantidade" IS NULL OR "capacidade_quantidade" >= 0) AND
        ("capacidade_peso" IS NULL OR "capacidade_peso" >= 0) AND
        ("capacidade_volume" IS NULL OR "capacidade_volume" >= 0)
    );

-- Uma localização não pode ser pai de si própria.
ALTER TABLE "armazens_localizacoes" ADD CONSTRAINT "armazens_localizacoes_pai_diferente"
    CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- CreateTable
CREATE TABLE "regras_putaway" (
    "id" TEXT NOT NULL,
    "armazem_id" TEXT NOT NULL,
    "classe_armazenamento_id" TEXT,
    "zona_id" TEXT,
    "prioridade" INTEGER NOT NULL DEFAULT 100,
    "capacidade_minima" DECIMAL(18,4),
    "capacidade_maxima" DECIMAL(18,4),
    "permitir_mix_produtos" BOOLEAN,
    "permitir_mix_lotes" BOOLEAN,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regras_putaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regras_picking" (
    "id" TEXT NOT NULL,
    "armazem_id" TEXT NOT NULL,
    "classe_armazenamento_id" TEXT,
    "zona_id" TEXT,
    "estrategia" "EstrategiaPicking" NOT NULL DEFAULT 'fifo',
    "prioridade" INTEGER NOT NULL DEFAULT 100,
    "respeitar_validade" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regras_picking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lotes_artigo_id_idx" ON "lotes"("artigo_id");

-- CreateIndex
CREATE INDEX "lotes_data_validade_idx" ON "lotes"("data_validade");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_artigo_id_numero_lote_key" ON "lotes"("artigo_id", "numero_lote");

-- CreateIndex
CREATE INDEX "estoques_artigo_id_idx" ON "estoques"("artigo_id");

-- CreateIndex
CREATE INDEX "estoques_armazem_id_idx" ON "estoques"("armazem_id");

-- CreateIndex
CREATE INDEX "estoques_localizacao_id_idx" ON "estoques"("localizacao_id");

-- CreateIndex
CREATE INDEX "estoques_lote_id_idx" ON "estoques"("lote_id");

-- CreateIndex
CREATE INDEX "regras_putaway_armazem_id_prioridade_idx" ON "regras_putaway"("armazem_id", "prioridade");

-- CreateIndex
CREATE INDEX "regras_putaway_classe_armazenamento_id_idx" ON "regras_putaway"("classe_armazenamento_id");

-- CreateIndex
CREATE INDEX "regras_picking_armazem_id_prioridade_idx" ON "regras_picking"("armazem_id", "prioridade");

-- CreateIndex
CREATE INDEX "regras_picking_classe_armazenamento_id_idx" ON "regras_picking"("classe_armazenamento_id");

-- CreateIndex
CREATE INDEX "movimentos_stock_artigo_id_idx" ON "movimentos_stock"("artigo_id");

-- CreateIndex
CREATE INDEX "movimentos_stock_armazem_origem_id_idx" ON "movimentos_stock"("armazem_origem_id");

-- CreateIndex
CREATE INDEX "movimentos_stock_armazem_destino_id_idx" ON "movimentos_stock"("armazem_destino_id");

-- CreateIndex
CREATE INDEX "movimentos_stock_lote_id_idx" ON "movimentos_stock"("lote_id");

-- CreateIndex
CREATE INDEX "movimentos_stock_localizacao_origem_id_idx" ON "movimentos_stock"("localizacao_origem_id");

-- CreateIndex
CREATE INDEX "movimentos_stock_localizacao_destino_id_idx" ON "movimentos_stock"("localizacao_destino_id");

-- CreateIndex
CREATE INDEX "movimentos_stock_data_idx" ON "movimentos_stock"("data");

-- AddForeignKey
ALTER TABLE "movimentos_stock" ADD CONSTRAINT "movimentos_stock_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_stock" ADD CONSTRAINT "movimentos_stock_localizacao_origem_id_fkey" FOREIGN KEY ("localizacao_origem_id") REFERENCES "armazens_localizacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_stock" ADD CONSTRAINT "movimentos_stock_localizacao_destino_id_fkey" FOREIGN KEY ("localizacao_destino_id") REFERENCES "armazens_localizacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_stock" ADD CONSTRAINT "movimentos_stock_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "utilizadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoques" ADD CONSTRAINT "estoques_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoques" ADD CONSTRAINT "estoques_armazem_id_fkey" FOREIGN KEY ("armazem_id") REFERENCES "armazens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoques" ADD CONSTRAINT "estoques_localizacao_id_fkey" FOREIGN KEY ("localizacao_id") REFERENCES "armazens_localizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoques" ADD CONSTRAINT "estoques_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_putaway" ADD CONSTRAINT "regras_putaway_armazem_id_fkey" FOREIGN KEY ("armazem_id") REFERENCES "armazens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_putaway" ADD CONSTRAINT "regras_putaway_classe_armazenamento_id_fkey" FOREIGN KEY ("classe_armazenamento_id") REFERENCES "classes_armazenamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_putaway" ADD CONSTRAINT "regras_putaway_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "armazens_zonas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_picking" ADD CONSTRAINT "regras_picking_armazem_id_fkey" FOREIGN KEY ("armazem_id") REFERENCES "armazens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_picking" ADD CONSTRAINT "regras_picking_classe_armazenamento_id_fkey" FOREIGN KEY ("classe_armazenamento_id") REFERENCES "classes_armazenamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_picking" ADD CONSTRAINT "regras_picking_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "armazens_zonas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
