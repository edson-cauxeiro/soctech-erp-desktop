-- CreateEnum
CREATE TYPE "EstadoDocumentoFiscal" AS ENUM ('emitido', 'anulado');

-- CreateEnum
CREATE TYPE "TipoSerieDocumento" AS ENUM ('FT', 'FR', 'NC', 'ND', 'FP', 'GR', 'RC');

-- CreateEnum
CREATE TYPE "EstadoProforma" AS ENUM ('rascunho', 'emitida', 'convertida', 'anulada');

-- CreateEnum
CREATE TYPE "EstadoGuiaEntrega" AS ENUM ('rascunho', 'confirmada', 'faturada', 'anulada');

-- AlterTable empresa_config
ALTER TABLE "empresa_config" ADD COLUMN IF NOT EXISTS "telefone" TEXT,
ADD COLUMN IF NOT EXISTS "email" TEXT,
ADD COLUMN IF NOT EXISTS "logotipo_url" TEXT;

-- AlterTable series_documentos
ALTER TABLE "series_documentos" ADD COLUMN IF NOT EXISTS "tipo_documento" "TipoSerieDocumento";
UPDATE "series_documentos" SET "tipo_documento" = 'FT' WHERE "tipo_documento" IS NULL;
DROP INDEX IF EXISTS "series_documentos_empresa_id_codigo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "series_documentos_empresa_id_tipo_documento_codigo_key" ON "series_documentos"("empresa_id", "tipo_documento", "codigo");

-- AlterTable faturas_venda
ALTER TABLE "faturas_venda" ADD COLUMN IF NOT EXISTS "empresa_id" TEXT,
ADD COLUMN IF NOT EXISTS "estado_documento" "EstadoDocumentoFiscal" NOT NULL DEFAULT 'emitido',
ADD COLUMN IF NOT EXISTS "fatura_origem_id" TEXT,
ADD COLUMN IF NOT EXISTS "proforma_origem_id" TEXT,
ADD COLUMN IF NOT EXISTS "guia_entrega_origem_id" TEXT,
ADD COLUMN IF NOT EXISTS "motivo_nota_credito" TEXT,
ADD COLUMN IF NOT EXISTS "motivo_anulacao" TEXT,
ADD COLUMN IF NOT EXISTS "anulada_em" TIMESTAMP(3);

-- AlterTable linhas_fatura_venda
ALTER TABLE "linhas_fatura_venda" ADD COLUMN IF NOT EXISTS "artigo_codigo" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "artigo_descricao" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "artigo_unidade" TEXT NOT NULL DEFAULT 'UN',
ADD COLUMN IF NOT EXISTS "motivo_isencao" TEXT;

-- AlterTable recibos_venda
ALTER TABLE "recibos_venda" ADD COLUMN IF NOT EXISTS "serie" TEXT NOT NULL DEFAULT 'LEGACY',
ADD COLUMN IF NOT EXISTS "empresa_id" TEXT,
ADD COLUMN IF NOT EXISTS "estado_documento" "EstadoDocumentoFiscal" NOT NULL DEFAULT 'emitido',
ADD COLUMN IF NOT EXISTS "cliente_nome" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "cliente_nif" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "cliente_endereco" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "motivo_anulacao" TEXT,
ADD COLUMN IF NOT EXISTS "anulada_em" TIMESTAMP(3);

-- CreateTable proformas_venda
CREATE TABLE IF NOT EXISTS "proformas_venda" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "empresa_id" TEXT,
    "data_emissao" DATE NOT NULL,
    "data_validade" DATE NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'EUR',
    "cliente_id" TEXT NOT NULL,
    "cliente_nome" TEXT NOT NULL,
    "cliente_nif" TEXT NOT NULL,
    "cliente_endereco" TEXT NOT NULL,
    "encomenda_origem" TEXT,
    "motivo_isencao" TEXT,
    "estado" "EstadoProforma" NOT NULL DEFAULT 'rascunho',
    "motivo_anulacao" TEXT,
    "anulada_em" TIMESTAMP(3),
    "total_iliquido" DECIMAL(18,4) NOT NULL,
    "total_iva" DECIMAL(18,4) NOT NULL,
    "total_liquido" DECIMAL(18,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proformas_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable linhas_proforma_venda
CREATE TABLE IF NOT EXISTS "linhas_proforma_venda" (
    "id" TEXT NOT NULL,
    "proforma_id" TEXT NOT NULL,
    "artigo_id" TEXT NOT NULL,
    "artigo_codigo" TEXT NOT NULL,
    "artigo_descricao" TEXT NOT NULL,
    "artigo_unidade" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "preco_unitario" DECIMAL(18,4) NOT NULL,
    "desconto" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "taxa_iva" DECIMAL(5,2) NOT NULL,
    "motivo_isencao" TEXT,
    "total_linha" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "linhas_proforma_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable guias_entrega
CREATE TABLE IF NOT EXISTS "guias_entrega" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "empresa_id" TEXT,
    "data" DATE NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "cliente_nome" TEXT NOT NULL,
    "cliente_nif" TEXT NOT NULL,
    "cliente_endereco" TEXT NOT NULL,
    "armazem_expedicao_id" TEXT NOT NULL,
    "armazem_designacao" TEXT NOT NULL,
    "proforma_origem_id" TEXT,
    "encomenda_origem" TEXT,
    "local_entrega" TEXT,
    "transportador" TEXT,
    "observacoes" TEXT,
    "estado" "EstadoGuiaEntrega" NOT NULL DEFAULT 'rascunho',
    "motivo_anulacao" TEXT,
    "anulada_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guias_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable linhas_guia_entrega
CREATE TABLE IF NOT EXISTS "linhas_guia_entrega" (
    "id" TEXT NOT NULL,
    "guia_id" TEXT NOT NULL,
    "artigo_id" TEXT NOT NULL,
    "artigo_codigo" TEXT NOT NULL,
    "artigo_descricao" TEXT NOT NULL,
    "artigo_unidade" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "lote" TEXT,

    CONSTRAINT "linhas_guia_entrega_pkey" PRIMARY KEY ("id")
);

-- Unique Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "proformas_venda_numero_key" ON "proformas_venda"("numero");
CREATE UNIQUE INDEX IF NOT EXISTS "guias_entrega_numero_key" ON "guias_entrega"("numero");
CREATE UNIQUE INDEX IF NOT EXISTS "faturas_venda_proforma_origem_id_key" ON "faturas_venda"("proforma_origem_id");
CREATE UNIQUE INDEX IF NOT EXISTS "faturas_venda_guia_entrega_origem_id_key" ON "faturas_venda"("guia_entrega_origem_id");
CREATE UNIQUE INDEX IF NOT EXISTS "guias_entrega_proforma_origem_id_key" ON "guias_entrega"("proforma_origem_id");

-- Foreign Keys
ALTER TABLE "faturas_venda" ADD CONSTRAINT "faturas_venda_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "faturas_venda" ADD CONSTRAINT "faturas_venda_fatura_origem_id_fkey" FOREIGN KEY ("fatura_origem_id") REFERENCES "faturas_venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "faturas_venda" ADD CONSTRAINT "faturas_venda_proforma_origem_id_fkey" FOREIGN KEY ("proforma_origem_id") REFERENCES "proformas_venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "faturas_venda" ADD CONSTRAINT "faturas_venda_guia_entrega_origem_id_fkey" FOREIGN KEY ("guia_entrega_origem_id") REFERENCES "guias_entrega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recibos_venda" ADD CONSTRAINT "recibos_venda_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proformas_venda" ADD CONSTRAINT "proformas_venda_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "proformas_venda" ADD CONSTRAINT "proformas_venda_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "linhas_proforma_venda" ADD CONSTRAINT "linhas_proforma_venda_proforma_id_fkey" FOREIGN KEY ("proforma_id") REFERENCES "proformas_venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "linhas_proforma_venda" ADD CONSTRAINT "linhas_proforma_venda_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guias_entrega" ADD CONSTRAINT "guias_entrega_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guias_entrega" ADD CONSTRAINT "guias_entrega_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guias_entrega" ADD CONSTRAINT "guias_entrega_armazem_expedicao_id_fkey" FOREIGN KEY ("armazem_expedicao_id") REFERENCES "armazens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guias_entrega" ADD CONSTRAINT "guias_entrega_proforma_origem_id_fkey" FOREIGN KEY ("proforma_origem_id") REFERENCES "proformas_venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "linhas_guia_entrega" ADD CONSTRAINT "linhas_guia_entrega_guia_id_fkey" FOREIGN KEY ("guia_id") REFERENCES "guias_entrega"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "linhas_guia_entrega" ADD CONSTRAINT "linhas_guia_entrega_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
