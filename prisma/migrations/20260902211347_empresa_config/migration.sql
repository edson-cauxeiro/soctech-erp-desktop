/*
  Warnings:

  - A unique constraint covering the columns `[identificador]` on the table `empresa_config` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "empresa_config" ADD COLUMN     "identificador" TEXT,
ADD COLUMN     "mes_final" DATE,
ADD COLUMN     "mes_inicial" DATE,
ADD COLUMN     "modulos_json" TEXT DEFAULT '[]',
ADD COLUMN     "moeda_alternativa" TEXT,
ADD COLUMN     "motivo_isencao" TEXT,
ADD COLUMN     "regime_iva_tipo" TEXT DEFAULT 'normal_mensal',
ALTER COLUMN "endereco" SET DEFAULT '',
ALTER COLUMN "regime_iva" SET DEFAULT 'geral';

-- CreateTable
CREATE TABLE "exercicios_fiscais" (
    "id" TEXT NOT NULL,
    "ano" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "modulos_json" TEXT NOT NULL DEFAULT '[]',
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'aberto',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercicios_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "series_documentos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "modulos_json" TEXT NOT NULL DEFAULT '[]',
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "ultimo_lancamento" INTEGER NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'ativo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "series_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exercicios_fiscais_empresa_id_ano_key" ON "exercicios_fiscais"("empresa_id", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "series_documentos_empresa_id_codigo_key" ON "series_documentos"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "empresa_config_identificador_key" ON "empresa_config"("identificador");

-- AddForeignKey
ALTER TABLE "exercicios_fiscais" ADD CONSTRAINT "exercicios_fiscais_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_documentos" ADD CONSTRAINT "series_documentos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;
