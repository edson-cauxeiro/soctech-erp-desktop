-- CreateEnum
CREATE TYPE "EstadoEncomendaCompra" AS ENUM ('aberta', 'parcial', 'recebida', 'cancelada');

-- CreateEnum
CREATE TYPE "ConformidadeRecepcao" AS ENUM ('conforme', 'divergente');

-- CreateEnum
CREATE TYPE "EstadoInventario" AS ENUM ('em_curso', 'fechado', 'cancelado');

-- CreateEnum
CREATE TYPE "TipoDocumentoTesouraria" AS ENUM ('manual', 'recibo_venda', 'fatura_venda', 'fatura_compra', 'guia_recepcao');

-- CreateEnum
CREATE TYPE "EstadoSessaoCaixa" AS ENUM ('aberta', 'fechada');

-- AlterEnum
ALTER TYPE "EstadoMovimentoTesouraria" ADD VALUE 'estornado';

-- DropForeignKey
ALTER TABLE "movimentos_tesouraria" DROP CONSTRAINT "movimentos_tesouraria_conta_origem_id_fkey";

-- DropIndex
DROP INDEX "contas_bancarias_codigo_key";

-- AlterTable
ALTER TABLE "armazens" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_default_compras" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_default_vendas" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "contas_bancarias" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "empresa_id" TEXT,
ADD COLUMN     "nome_banco" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "saldo_inicial" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
ADD COLUMN     "swift_bic" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "faturas_venda" ADD COLUMN     "conta_bancaria_id" TEXT,
ADD COLUMN     "data_pagamento" DATE,
ADD COLUMN     "meio_pagamento" "MeioPagamento";

-- AlterTable
ALTER TABLE "movimentos_tesouraria" DROP COLUMN "documento_origem",
DROP COLUMN "entidade",
ADD COLUMN     "conciliado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "data_conciliacao" DATE,
ADD COLUMN     "documento_id" TEXT,
ADD COLUMN     "documento_numero" TEXT,
ADD COLUMN     "documento_tipo" "TipoDocumentoTesouraria" NOT NULL DEFAULT 'manual',
ADD COLUMN     "empresa_id" TEXT,
ADD COLUMN     "entidade_id" TEXT,
ADD COLUMN     "entidade_tipo" TEXT,
ADD COLUMN     "movimento_estorno_id" TEXT,
ADD COLUMN     "observacao_extrato" TEXT,
ADD COLUMN     "sessao_caixa_id" TEXT,
ADD COLUMN     "utilizador_id" TEXT,
ALTER COLUMN "conta_origem_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "recibos_venda" ADD COLUMN     "conta_bancaria_id" TEXT,
ADD COLUMN     "sessao_caixa_id" TEXT;

-- CreateTable
CREATE TABLE "encomendas_compra" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "fornecedor_id" TEXT NOT NULL,
    "data_recepcao" DATE,
    "armazem_destino_id" TEXT,
    "estado" "EstadoEncomendaCompra" NOT NULL DEFAULT 'aberta',
    "observacoes" TEXT,
    "total_iliquido" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "total_iva" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "total_liquido" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encomendas_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linhas_encomenda_compra" (
    "id" TEXT NOT NULL,
    "encomenda_id" TEXT NOT NULL,
    "artigo_id" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "quantidade_recebida" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "preco_acordado" DECIMAL(18,4) NOT NULL,
    "taxa_iva" DECIMAL(5,2) NOT NULL DEFAULT 23.0,
    "total_linha" DECIMAL(18,4) NOT NULL DEFAULT 0.0,

    CONSTRAINT "linhas_encomenda_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guias_recepcao" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "fornecedor_id" TEXT,
    "encomenda_id" TEXT,
    "armazem_destino_id" TEXT NOT NULL,
    "conformidade" "ConformidadeRecepcao" NOT NULL DEFAULT 'conforme',
    "observacoes" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'processado',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guias_recepcao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linhas_guia_recepcao" (
    "id" TEXT NOT NULL,
    "guia_id" TEXT NOT NULL,
    "artigo_id" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "preco_custo" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "lote" TEXT,
    "validade" DATE,

    CONSTRAINT "linhas_guia_recepcao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faturas_compra" (
    "id" TEXT NOT NULL,
    "numero_interno" TEXT NOT NULL,
    "numero_fornecedor" TEXT NOT NULL,
    "data_emissao" DATE NOT NULL,
    "data_vencimento" DATE NOT NULL,
    "fornecedor_id" TEXT NOT NULL,
    "guia_recepcao_id" TEXT,
    "estado_pagamento" "EstadoPagamento" NOT NULL DEFAULT 'pendente',
    "retencao_fonte" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "total_iliquido" DECIMAL(18,4) NOT NULL,
    "total_iva" DECIMAL(18,4) NOT NULL,
    "total_liquido" DECIMAL(18,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faturas_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linhas_fatura_compra" (
    "id" TEXT NOT NULL,
    "fatura_id" TEXT NOT NULL,
    "artigo_id" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "preco_unitario" DECIMAL(18,4) NOT NULL,
    "taxa_iva" DECIMAL(5,2) NOT NULL,
    "total_linha" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "linhas_fatura_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventarios_contagem" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "armazem_id" TEXT NOT NULL,
    "estado" "EstadoInventario" NOT NULL DEFAULT 'em_curso',
    "responsavel" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventarios_contagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linhas_inventario_contagem" (
    "id" TEXT NOT NULL,
    "inventario_id" TEXT NOT NULL,
    "artigo_id" TEXT NOT NULL,
    "qtd_sistema" DECIMAL(18,4) NOT NULL,
    "qtd_contada" DECIMAL(18,4) NOT NULL,
    "diferenca" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "lote" TEXT,

    CONSTRAINT "linhas_inventario_contagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes_caixa" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "conta_caixa_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "data_abertura" DATE NOT NULL,
    "hora_abertura" TIMESTAMP(3) NOT NULL,
    "fundo_inicial" DECIMAL(18,4) NOT NULL,
    "estado" "EstadoSessaoCaixa" NOT NULL DEFAULT 'aberta',
    "data_fecho" DATE,
    "hora_fecho" TIMESTAMP(3),
    "total_numerario" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "total_multicaixa" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "total_transferencia" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "total_esperado" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "total_contado" DECIMAL(18,4),
    "diferenca" DECIMAL(18,4),
    "observacoes" TEXT,
    "utilizador_abertura_id" TEXT,
    "utilizador_fecho_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessoes_caixa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "encomendas_compra_numero_key" ON "encomendas_compra"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "guias_recepcao_numero_key" ON "guias_recepcao"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "faturas_compra_numero_interno_key" ON "faturas_compra"("numero_interno");

-- CreateIndex
CREATE UNIQUE INDEX "inventarios_contagem_numero_key" ON "inventarios_contagem"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_caixa_numero_key" ON "sessoes_caixa"("numero");

-- CreateIndex
CREATE INDEX "sessoes_caixa_empresa_id_data_abertura_idx" ON "sessoes_caixa"("empresa_id", "data_abertura");

-- CreateIndex
CREATE INDEX "sessoes_caixa_conta_caixa_id_estado_idx" ON "sessoes_caixa"("conta_caixa_id", "estado");

-- CreateIndex
CREATE INDEX "contas_bancarias_empresa_id_ativo_idx" ON "contas_bancarias"("empresa_id", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "contas_bancarias_empresa_codigo_key" ON "contas_bancarias"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "faturas_venda_conta_bancaria_id_idx" ON "faturas_venda"("conta_bancaria_id");

-- CreateIndex
CREATE INDEX "movimentos_tesouraria_empresa_id_data_idx" ON "movimentos_tesouraria"("empresa_id", "data");

-- CreateIndex
CREATE INDEX "movimentos_tesouraria_conta_origem_id_data_idx" ON "movimentos_tesouraria"("conta_origem_id", "data");

-- CreateIndex
CREATE INDEX "movimentos_tesouraria_conta_destino_id_data_idx" ON "movimentos_tesouraria"("conta_destino_id", "data");

-- CreateIndex
CREATE INDEX "movimentos_tesouraria_conciliado_idx" ON "movimentos_tesouraria"("conciliado");

-- CreateIndex
CREATE INDEX "movimentos_tesouraria_sessao_caixa_id_idx" ON "movimentos_tesouraria"("sessao_caixa_id");

-- CreateIndex
CREATE INDEX "recibos_venda_conta_bancaria_id_idx" ON "recibos_venda"("conta_bancaria_id");

-- CreateIndex
CREATE INDEX "recibos_venda_sessao_caixa_id_idx" ON "recibos_venda"("sessao_caixa_id");

-- AddForeignKey
ALTER TABLE "faturas_venda" ADD CONSTRAINT "faturas_venda_conta_bancaria_id_fkey" FOREIGN KEY ("conta_bancaria_id") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos_venda" ADD CONSTRAINT "recibos_venda_conta_bancaria_id_fkey" FOREIGN KEY ("conta_bancaria_id") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos_venda" ADD CONSTRAINT "recibos_venda_sessao_caixa_id_fkey" FOREIGN KEY ("sessao_caixa_id") REFERENCES "sessoes_caixa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encomendas_compra" ADD CONSTRAINT "encomendas_compra_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encomendas_compra" ADD CONSTRAINT "encomendas_compra_armazem_destino_id_fkey" FOREIGN KEY ("armazem_destino_id") REFERENCES "armazens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_encomenda_compra" ADD CONSTRAINT "linhas_encomenda_compra_encomenda_id_fkey" FOREIGN KEY ("encomenda_id") REFERENCES "encomendas_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_encomenda_compra" ADD CONSTRAINT "linhas_encomenda_compra_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias_recepcao" ADD CONSTRAINT "guias_recepcao_encomenda_id_fkey" FOREIGN KEY ("encomenda_id") REFERENCES "encomendas_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias_recepcao" ADD CONSTRAINT "guias_recepcao_armazem_destino_id_fkey" FOREIGN KEY ("armazem_destino_id") REFERENCES "armazens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_guia_recepcao" ADD CONSTRAINT "linhas_guia_recepcao_guia_id_fkey" FOREIGN KEY ("guia_id") REFERENCES "guias_recepcao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_guia_recepcao" ADD CONSTRAINT "linhas_guia_recepcao_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas_compra" ADD CONSTRAINT "faturas_compra_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas_compra" ADD CONSTRAINT "faturas_compra_guia_recepcao_id_fkey" FOREIGN KEY ("guia_recepcao_id") REFERENCES "guias_recepcao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_fatura_compra" ADD CONSTRAINT "linhas_fatura_compra_fatura_id_fkey" FOREIGN KEY ("fatura_id") REFERENCES "faturas_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_fatura_compra" ADD CONSTRAINT "linhas_fatura_compra_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios_contagem" ADD CONSTRAINT "inventarios_contagem_armazem_id_fkey" FOREIGN KEY ("armazem_id") REFERENCES "armazens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_inventario_contagem" ADD CONSTRAINT "linhas_inventario_contagem_inventario_id_fkey" FOREIGN KEY ("inventario_id") REFERENCES "inventarios_contagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_inventario_contagem" ADD CONSTRAINT "linhas_inventario_contagem_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_tesouraria" ADD CONSTRAINT "movimentos_tesouraria_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_tesouraria" ADD CONSTRAINT "movimentos_tesouraria_utilizador_id_fkey" FOREIGN KEY ("utilizador_id") REFERENCES "utilizadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_tesouraria" ADD CONSTRAINT "movimentos_tesouraria_sessao_caixa_id_fkey" FOREIGN KEY ("sessao_caixa_id") REFERENCES "sessoes_caixa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_tesouraria" ADD CONSTRAINT "movimentos_tesouraria_conta_origem_id_fkey" FOREIGN KEY ("conta_origem_id") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_tesouraria" ADD CONSTRAINT "movimentos_tesouraria_movimento_estorno_id_fkey" FOREIGN KEY ("movimento_estorno_id") REFERENCES "movimentos_tesouraria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes_caixa" ADD CONSTRAINT "sessoes_caixa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes_caixa" ADD CONSTRAINT "sessoes_caixa_conta_caixa_id_fkey" FOREIGN KEY ("conta_caixa_id") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes_caixa" ADD CONSTRAINT "sessoes_caixa_utilizador_abertura_id_fkey" FOREIGN KEY ("utilizador_abertura_id") REFERENCES "utilizadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes_caixa" ADD CONSTRAINT "sessoes_caixa_utilizador_fecho_id_fkey" FOREIGN KEY ("utilizador_fecho_id") REFERENCES "utilizadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Backfill e integridade da tesouraria (SQL manual, não gerado pelo Prisma)
-- =============================================================================

-- `saldo_inicial` passa a ser a única fonte de verdade do saldo; o saldo
-- antigo é copiado para não perder o histórico de contas já existentes.
UPDATE "contas_bancarias"
SET "saldo_inicial" = "saldo_atual"
WHERE "saldo_inicial" = 0.0
  AND "saldo_atual" <> 0.0;

-- Contas e movimentos legados não tinham empresa; o DoraERP opera com uma
-- única `empresa_config`, por isso preenchemos com a registada.
UPDATE "contas_bancarias" cb
SET "empresa_id" = ec.id
FROM (SELECT id FROM "empresa_config" ORDER BY id LIMIT 1) ec
WHERE cb."empresa_id" IS NULL;

UPDATE "movimentos_tesouraria" mt
SET "empresa_id" = ec.id
FROM (SELECT id FROM "empresa_config" ORDER BY id LIMIT 1) ec
WHERE mt."empresa_id" IS NULL;

-- Garante que não há códigos de conta duplicados antes de aplicar o índice
-- único composto (o índice global `contas_bancarias_codigo_key` foi removido).
DELETE FROM "contas_bancarias" a
USING "contas_bancarias" b
WHERE a.id > b.id
  AND a."codigo" = b."codigo"
  AND a."empresa_id" IS NOT DISTINCT FROM b."empresa_id";

-- Cada caixa só pode ter uma sessão aberta. Um índice parcial é a forma
-- correta: permite várias sessões fechadas, mas bloqueia duas abertas.
CREATE UNIQUE INDEX "sessoes_caixa_caixa_una_sessao_aberta_key"
  ON "sessoes_caixa" ("conta_caixa_id")
  WHERE "estado" = 'aberta';

-- Uma conta de caixa por empresa é obrigatória para o fecho de caixa fazer
-- sentido; criamos a conta base caso ainda não exista.
INSERT INTO "contas_bancarias" (
  "id", "codigo", "designacao", "tipo", "saldo_inicial", "saldo_atual",
  "moeda", "ativo", "empresa_id", "created_at", "updated_at"
)
SELECT
  'conta_caixa_base',
  'CAIXA',
  'Caixa',
  'caixa',
  0.0, 0.0,
  'AOA', true,
  ec.id,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT id FROM "empresa_config" ORDER BY id LIMIT 1) ec
WHERE NOT EXISTS (
  SELECT 1 FROM "contas_bancarias" c
  WHERE c."tipo" = 'caixa' AND c."empresa_id" = ec.id
);
