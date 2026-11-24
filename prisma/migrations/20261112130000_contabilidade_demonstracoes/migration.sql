-- CreateEnum
CREATE TYPE "TipoEstruturaRelatorio" AS ENUM ('balanco', 'demonstracaoResultados', 'fluxosCaixa', 'alteracoesCapitalProprio');

-- CreateEnum
CREATE TYPE "TipoLinhaRelatorio" AS ENUM ('activo', 'passivo', 'capitalProprio', 'proveito', 'custo', 'resultado', 'subtotal', 'total', 'fluxo', 'memo');

-- CreateEnum
CREATE TYPE "OperacaoLinhaRelatorio" AS ENUM ('saldo', 'debito', 'credito', 'creditoMenosDebito');

-- AlterEnum
ALTER TYPE "TipoAcaoAuditoria" ADD VALUE 'pagar';

-- CreateTable
CREATE TABLE "estruturas_relatorio" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT NOT NULL,
    "tipo" "TipoEstruturaRelatorio" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estruturas_relatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linhas_estrutura_relatorio" (
    "id" TEXT NOT NULL,
    "estrutura_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "nivel" INTEGER NOT NULL DEFAULT 1,
    "tipo" "TipoLinhaRelatorio" NOT NULL DEFAULT 'subtotal',
    "operacao" "OperacaoLinhaRelatorio" NOT NULL DEFAULT 'saldo',
    "sinal" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "linhas_estrutura_relatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_estrutura_relatorio" (
    "id" TEXT NOT NULL,
    "linha_id" TEXT NOT NULL,
    "conta_id" TEXT NOT NULL,
    "sinal" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "contas_estrutura_relatorio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estruturas_relatorio_empresa_id_tipo_idx" ON "estruturas_relatorio"("empresa_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "estruturas_relatorio_empresa_id_codigo_key" ON "estruturas_relatorio"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "linhas_estrutura_relatorio_estrutura_id_ordem_idx" ON "linhas_estrutura_relatorio"("estrutura_id", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "linhas_estrutura_relatorio_estrutura_id_codigo_key" ON "linhas_estrutura_relatorio"("estrutura_id", "codigo");

-- CreateIndex
CREATE INDEX "contas_estrutura_relatorio_conta_id_idx" ON "contas_estrutura_relatorio"("conta_id");

-- CreateIndex
CREATE UNIQUE INDEX "contas_estrutura_relatorio_linha_id_conta_id_key" ON "contas_estrutura_relatorio"("linha_id", "conta_id");

-- AddForeignKey
ALTER TABLE "estruturas_relatorio" ADD CONSTRAINT "estruturas_relatorio_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_estrutura_relatorio" ADD CONSTRAINT "linhas_estrutura_relatorio_estrutura_id_fkey" FOREIGN KEY ("estrutura_id") REFERENCES "estruturas_relatorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_estrutura_relatorio" ADD CONSTRAINT "linhas_estrutura_relatorio_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "linhas_estrutura_relatorio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_estrutura_relatorio" ADD CONSTRAINT "contas_estrutura_relatorio_linha_id_fkey" FOREIGN KEY ("linha_id") REFERENCES "linhas_estrutura_relatorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_estrutura_relatorio" ADD CONSTRAINT "contas_estrutura_relatorio_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas_contabeis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

