-- CreateEnum
CREATE TYPE "EstadoLancamento" AS ENUM ('rascunho', 'validado', 'estornado');

-- CreateEnum
CREATE TYPE "OrigemLancamento" AS ENUM ('manual', 'integracao', 'abertura', 'fecho', 'ajustamento', 'liquidacao', 'estorno');

-- CreateEnum
CREATE TYPE "LadoLancamento" AS ENUM ('debito', 'credito');

-- CreateEnum
CREATE TYPE "TipoEntidadeLancamento" AS ENUM ('cliente', 'fornecedor', 'funcionario', 'outro');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoAcaoAuditoria" ADD VALUE 'estornar';
ALTER TYPE "TipoAcaoAuditoria" ADD VALUE 'fechar';
ALTER TYPE "TipoAcaoAuditoria" ADD VALUE 'reabrir';
ALTER TYPE "TipoAcaoAuditoria" ADD VALUE 'apurar';

-- CreateTable
CREATE TABLE "lancamentos_contabeis" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "diario_id" TEXT NOT NULL,
    "exercicio_id" TEXT NOT NULL,
    "periodo_id" TEXT NOT NULL,
    "numero" INTEGER,
    "data_contabilistica" DATE NOT NULL,
    "data_documento" DATE,
    "descricao" TEXT NOT NULL,
    "estado" "EstadoLancamento" NOT NULL DEFAULT 'rascunho',
    "origem" "OrigemLancamento" NOT NULL DEFAULT 'manual',
    "modulo_origem" TEXT,
    "tipo_origem" TEXT,
    "origem_id" TEXT,
    "execucao_fecho_id" TEXT,
    "estorno_de_id" TEXT,
    "moeda" TEXT NOT NULL DEFAULT 'AOA',
    "taxa_cambio" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "total_debito" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total_credito" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "criado_por_id" TEXT NOT NULL,
    "validado_por_id" TEXT,
    "validado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lancamentos_contabeis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linhas_lancamento_contabil" (
    "id" TEXT NOT NULL,
    "lancamento_id" TEXT NOT NULL,
    "numero_linha" INTEGER NOT NULL,
    "conta_id" TEXT NOT NULL,
    "debito" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "credito" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "descricao" TEXT,
    "centro_custo_id" TEXT,
    "entidade_tipo" "TipoEntidadeLancamento",
    "entidade_id" TEXT,
    "codigo_imposto" TEXT,
    "base_imposto" DECIMAL(18,4),
    "data_vencimento" DATE,
    "conciliado_em" TIMESTAMP(3),
    "movimento_tesouraria_id" TEXT,

    CONSTRAINT "linhas_lancamento_contabil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_contabeis_estorno_de_id_key" ON "lancamentos_contabeis"("estorno_de_id");

-- CreateIndex
CREATE INDEX "lancamentos_contabeis_empresa_id_data_contabilistica_idx" ON "lancamentos_contabeis"("empresa_id", "data_contabilistica");

-- CreateIndex
CREATE INDEX "lancamentos_contabeis_periodo_id_estado_idx" ON "lancamentos_contabeis"("periodo_id", "estado");

-- CreateIndex
CREATE INDEX "lancamentos_contabeis_exercicio_id_estado_idx" ON "lancamentos_contabeis"("exercicio_id", "estado");

-- CreateIndex
CREATE INDEX "lancamentos_contabeis_diario_id_estado_idx" ON "lancamentos_contabeis"("diario_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_contabeis_diario_id_exercicio_id_numero_key" ON "lancamentos_contabeis"("diario_id", "exercicio_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_contabeis_modulo_origem_tipo_origem_origem_id_o_key" ON "lancamentos_contabeis"("modulo_origem", "tipo_origem", "origem_id", "origem");

-- CreateIndex
CREATE INDEX "linhas_lancamento_contabil_conta_id_idx" ON "linhas_lancamento_contabil"("conta_id");

-- CreateIndex
CREATE INDEX "linhas_lancamento_contabil_entidade_tipo_entidade_id_idx" ON "linhas_lancamento_contabil"("entidade_tipo", "entidade_id");

-- CreateIndex
CREATE INDEX "linhas_lancamento_contabil_movimento_tesouraria_id_idx" ON "linhas_lancamento_contabil"("movimento_tesouraria_id");

-- CreateIndex
CREATE INDEX "linhas_lancamento_contabil_lancamento_id_numero_linha_idx" ON "linhas_lancamento_contabil"("lancamento_id", "numero_linha");

-- AddForeignKey
ALTER TABLE "lancamentos_contabeis" ADD CONSTRAINT "lancamentos_contabeis_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_contabeis" ADD CONSTRAINT "lancamentos_contabeis_diario_id_fkey" FOREIGN KEY ("diario_id") REFERENCES "diarios_contabeis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_contabeis" ADD CONSTRAINT "lancamentos_contabeis_exercicio_id_fkey" FOREIGN KEY ("exercicio_id") REFERENCES "exercicios_fiscais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_contabeis" ADD CONSTRAINT "lancamentos_contabeis_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "periodos_contabeis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_contabeis" ADD CONSTRAINT "lancamentos_contabeis_estorno_de_id_fkey" FOREIGN KEY ("estorno_de_id") REFERENCES "lancamentos_contabeis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_contabeis" ADD CONSTRAINT "lancamentos_contabeis_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "utilizadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_contabeis" ADD CONSTRAINT "lancamentos_contabeis_validado_por_id_fkey" FOREIGN KEY ("validado_por_id") REFERENCES "utilizadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_lancamento_contabil" ADD CONSTRAINT "linhas_lancamento_contabil_lancamento_id_fkey" FOREIGN KEY ("lancamento_id") REFERENCES "lancamentos_contabeis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_lancamento_contabil" ADD CONSTRAINT "linhas_lancamento_contabil_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas_contabeis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_lancamento_contabil" ADD CONSTRAINT "linhas_lancamento_contabil_centro_custo_id_fkey" FOREIGN KEY ("centro_custo_id") REFERENCES "centros_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_lancamento_contabil" ADD CONSTRAINT "linhas_lancamento_contabil_movimento_tesouraria_id_fkey" FOREIGN KEY ("movimento_tesouraria_id") REFERENCES "movimentos_tesouraria"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Regras de integridade que o Prisma não expressa no schema.
ALTER TABLE "lancamentos_contabeis"
  ADD CONSTRAINT "lancamentos_contabeis_totais_nao_negativos"
  CHECK ("total_debito" >= 0 AND "total_credito" >= 0);

ALTER TABLE "lancamentos_contabeis"
  ADD CONSTRAINT "lancamentos_contabeis_taxa_cambio_positiva"
  CHECK ("taxa_cambio" > 0);

ALTER TABLE "linhas_lancamento_contabil"
  ADD CONSTRAINT "linhas_lancamento_contabil_valor_unico_lado"
  CHECK (
    "debito" >= 0
    AND "credito" >= 0
    AND (
      ("debito" > 0 AND "credito" = 0)
      OR ("credito" > 0 AND "debito" = 0)
    )
  );

ALTER TABLE "linhas_lancamento_contabil"
  ADD CONSTRAINT "linhas_lancamento_contabil_base_imposto_nao_negativa"
  CHECK ("base_imposto" IS NULL OR "base_imposto" >= 0);

-- Imutabilidade dos lançamentos validados. A única transição permitida é
-- validado -> estornado, e mesmo essa só pode alterar o estado e o updated_at;
-- todos os restantes campos têm de permanecer iguais.
CREATE OR REPLACE FUNCTION "proteger_lancamento_contabil"()
RETURNS trigger AS $$
BEGIN
  IF OLD."estado" = 'estornado' THEN
    RAISE EXCEPTION 'Lançamento estornado é imutável.';
  END IF;

  IF OLD."estado" = 'validado' THEN
    IF TG_OP = 'UPDATE'
       AND NEW."estado" = 'estornado'
       AND (to_jsonb(NEW) - 'estado' - 'updated_at') = (to_jsonb(OLD) - 'estado' - 'updated_at')
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Lançamento validado é imutável. Use o estorno.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_lancamento_contabil_update"
BEFORE UPDATE ON "lancamentos_contabeis"
FOR EACH ROW EXECUTE FUNCTION "proteger_lancamento_contabil"();

CREATE TRIGGER "trg_lancamento_contabil_delete"
BEFORE DELETE ON "lancamentos_contabeis"
FOR EACH ROW EXECUTE FUNCTION "proteger_lancamento_contabil"();

-- As linhas de um lançamento validado ou estornado também são imutáveis.
CREATE OR REPLACE FUNCTION "proteger_linha_lancamento_contabil"()
RETURNS trigger AS $$
DECLARE
  estado_pai "EstadoLancamento";
BEGIN
  SELECT "estado" INTO estado_pai
  FROM "lancamentos_contabeis"
  WHERE "id" = COALESCE(NEW."lancamento_id", OLD."lancamento_id");

  IF estado_pai IN ('validado', 'estornado') THEN
    RAISE EXCEPTION 'Linhas de lançamento validado ou estornado são imutáveis.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_linha_lancamento_contabil_ins"
BEFORE INSERT ON "linhas_lancamento_contabil"
FOR EACH ROW EXECUTE FUNCTION "proteger_linha_lancamento_contabil"();

CREATE TRIGGER "trg_linha_lancamento_contabil_upd"
BEFORE UPDATE ON "linhas_lancamento_contabil"
FOR EACH ROW EXECUTE FUNCTION "proteger_linha_lancamento_contabil"();

CREATE TRIGGER "trg_linha_lancamento_contabil_del"
BEFORE DELETE ON "linhas_lancamento_contabil"
FOR EACH ROW EXECUTE FUNCTION "proteger_linha_lancamento_contabil"();
