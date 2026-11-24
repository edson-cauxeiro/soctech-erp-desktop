-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoAcaoAuditoria" ADD VALUE 'conciliar';
ALTER TYPE "TipoAcaoAuditoria" ADD VALUE 'desconciliar';

-- CreateTable
CREATE TABLE "regras_contabilizacao" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT NOT NULL,
    "modulo_origem" TEXT NOT NULL,
    "tipo_origem" TEXT NOT NULL,
    "diario_id" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regras_contabilizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linhas_regra_contabilizacao" (
    "id" TEXT NOT NULL,
    "regra_id" TEXT NOT NULL,
    "numero_linha" INTEGER NOT NULL,
    "lado" "LadoLancamento" NOT NULL,
    "chave_conta" TEXT NOT NULL,
    "expressao_valor" TEXT NOT NULL,
    "taxa_imposto" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "linhas_regra_contabilizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erros_integracao_contabil" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "modulo_origem" TEXT NOT NULL,
    "tipo_origem" TEXT NOT NULL,
    "origem_id" TEXT NOT NULL,
    "origem" "OrigemLancamento" NOT NULL,
    "codigo_erro" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "detalhes_json" TEXT,
    "resolvido" BOOLEAN NOT NULL DEFAULT false,
    "resolvido_em" TIMESTAMP(3),
    "resolvido_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erros_integracao_contabil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "regras_contabilizacao_empresa_id_activa_idx" ON "regras_contabilizacao"("empresa_id", "activa");

-- CreateIndex
CREATE UNIQUE INDEX "regras_contabilizacao_empresa_id_modulo_origem_tipo_origem_key" ON "regras_contabilizacao"("empresa_id", "modulo_origem", "tipo_origem");

-- CreateIndex
CREATE UNIQUE INDEX "linhas_regra_contabilizacao_regra_id_numero_linha_key" ON "linhas_regra_contabilizacao"("regra_id", "numero_linha");

-- CreateIndex
CREATE INDEX "erros_integracao_contabil_empresa_id_modulo_origem_tipo_ori_idx" ON "erros_integracao_contabil"("empresa_id", "modulo_origem", "tipo_origem", "origem_id", "origem");

-- CreateIndex
CREATE INDEX "erros_integracao_contabil_empresa_id_resolvido_idx" ON "erros_integracao_contabil"("empresa_id", "resolvido");

-- AddForeignKey
ALTER TABLE "regras_contabilizacao" ADD CONSTRAINT "regras_contabilizacao_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_contabilizacao" ADD CONSTRAINT "regras_contabilizacao_diario_id_fkey" FOREIGN KEY ("diario_id") REFERENCES "diarios_contabeis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_regra_contabilizacao" ADD CONSTRAINT "linhas_regra_contabilizacao_regra_id_fkey" FOREIGN KEY ("regra_id") REFERENCES "regras_contabilizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erros_integracao_contabil" ADD CONSTRAINT "erros_integracao_contabil_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erros_integracao_contabil" ADD CONSTRAINT "erros_integracao_contabil_resolvido_por_id_fkey" FOREIGN KEY ("resolvido_por_id") REFERENCES "utilizadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Regras de integridade adicionais.
ALTER TABLE "regras_contabilizacao"
  ADD CONSTRAINT "regras_contabilizacao_codigo_valido"
  CHECK ("codigo" ~ '^[A-Z0-9_]{2,30}$');

ALTER TABLE "linhas_regra_contabilizacao"
  ADD CONSTRAINT "linhas_regra_contabilizacao_expressao_valida"
  CHECK (
    "expressao_valor" IN (
      'TOTAL', 'NET', 'TAX', 'BASE', 'DISCOUNT', 'PAID', 'OUTSTANDING'
    )
    OR "expressao_valor" ~ '^TAX:[0-9]+(\.[0-9]+)?$'
  );

ALTER TABLE "erros_integracao_contabil"
  ADD CONSTRAINT "erros_integracao_contabil_codigo_erro_valido"
  CHECK ("codigo_erro" ~ '^[A-Z0-9_]{2,40}$');
