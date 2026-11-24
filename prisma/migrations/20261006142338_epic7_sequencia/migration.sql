-- DropForeignKey
ALTER TABLE "contas_bancarias" DROP CONSTRAINT "contas_bancarias_empresa_id_fkey";

-- DropIndex
DROP INDEX "armazens_codigo_key";

-- DropIndex
DROP INDEX "movimentos_tesouraria_meio_pagamento_idx";

-- CreateTable
CREATE TABLE "sequencias" (
    "id" TEXT NOT NULL,
    "escopo" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sequencias_escopo_ano_key" ON "sequencias"("escopo", "ano");

-- AddForeignKey
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
