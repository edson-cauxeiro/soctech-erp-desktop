-- CreateEnum
CREATE TYPE "TipoExecucaoFecho" AS ENUM ('fechoMensal', 'apuramentoIva', 'apuramentoResultados', 'fechoAnual', 'aberturaExercicioSeguinte');

-- CreateEnum
CREATE TYPE "EstadoExecucaoFecho" AS ENUM ('previsao', 'executado', 'revertido', 'falhado');

-- CreateEnum
CREATE TYPE "EstadoApuramentoImposto" AS ENUM ('rascunho', 'validado', 'pago');

-- AlterTable
ALTER TABLE "lancamentos_contabeis" ADD COLUMN     "apuramento_id" TEXT;

-- CreateTable
CREATE TABLE "execucoes_fecho" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "periodo_id" TEXT,
    "exercicio_id" TEXT NOT NULL,
    "tipo" "TipoExecucaoFecho" NOT NULL,
    "estado" "EstadoExecucaoFecho" NOT NULL DEFAULT 'previsao',
    "iniciado_por_id" TEXT NOT NULL,
    "iniciado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluido_em" TIMESTAMP(3),
    "detalhes_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "execucoes_fecho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apuramentos_imposto" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "periodo_id" TEXT NOT NULL,
    "exercicio_id" TEXT NOT NULL,
    "tipo_imposto" TEXT NOT NULL,
    "estado" "EstadoApuramentoImposto" NOT NULL DEFAULT 'rascunho',
    "liquidado" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "dedutivel" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "credito_transitado" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lancamento_id" TEXT,
    "pago_em" TIMESTAMP(3),
    "pago_por_id" TEXT,
    "execucao_fecho_id" TEXT,
    "criado_por_id" TEXT NOT NULL,
    "validado_por_id" TEXT,
    "validado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apuramentos_imposto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "execucoes_fecho_empresa_id_tipo_estado_idx" ON "execucoes_fecho"("empresa_id", "tipo", "estado");

-- CreateIndex
CREATE INDEX "execucoes_fecho_periodo_id_tipo_idx" ON "execucoes_fecho"("periodo_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "apuramentos_imposto_lancamento_id_key" ON "apuramentos_imposto"("lancamento_id");

-- CreateIndex
CREATE INDEX "apuramentos_imposto_empresa_id_periodo_id_tipo_imposto_idx" ON "apuramentos_imposto"("empresa_id", "periodo_id", "tipo_imposto");

-- CreateIndex
CREATE UNIQUE INDEX "apuramentos_imposto_periodo_id_tipo_imposto_key" ON "apuramentos_imposto"("periodo_id", "tipo_imposto");

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_contabeis_apuramento_id_key" ON "lancamentos_contabeis"("apuramento_id");

-- AddForeignKey
ALTER TABLE "execucoes_fecho" ADD CONSTRAINT "execucoes_fecho_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucoes_fecho" ADD CONSTRAINT "execucoes_fecho_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "periodos_contabeis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucoes_fecho" ADD CONSTRAINT "execucoes_fecho_exercicio_id_fkey" FOREIGN KEY ("exercicio_id") REFERENCES "exercicios_fiscais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucoes_fecho" ADD CONSTRAINT "execucoes_fecho_iniciado_por_id_fkey" FOREIGN KEY ("iniciado_por_id") REFERENCES "utilizadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apuramentos_imposto" ADD CONSTRAINT "apuramentos_imposto_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apuramentos_imposto" ADD CONSTRAINT "apuramentos_imposto_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "periodos_contabeis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apuramentos_imposto" ADD CONSTRAINT "apuramentos_imposto_exercicio_id_fkey" FOREIGN KEY ("exercicio_id") REFERENCES "exercicios_fiscais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apuramentos_imposto" ADD CONSTRAINT "apuramentos_imposto_execucao_fecho_id_fkey" FOREIGN KEY ("execucao_fecho_id") REFERENCES "execucoes_fecho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apuramentos_imposto" ADD CONSTRAINT "apuramentos_imposto_pago_por_id_fkey" FOREIGN KEY ("pago_por_id") REFERENCES "utilizadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apuramentos_imposto" ADD CONSTRAINT "apuramentos_imposto_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "utilizadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apuramentos_imposto" ADD CONSTRAINT "apuramentos_imposto_validado_por_id_fkey" FOREIGN KEY ("validado_por_id") REFERENCES "utilizadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_contabeis" ADD CONSTRAINT "lancamentos_contabeis_execucao_fecho_id_fkey" FOREIGN KEY ("execucao_fecho_id") REFERENCES "execucoes_fecho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_contabeis" ADD CONSTRAINT "lancamentos_contabeis_apuramento_id_fkey" FOREIGN KEY ("apuramento_id") REFERENCES "apuramentos_imposto"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Constraints para ExecucaoFecho
ALTER TABLE "execucoes_fecho"
  ADD CONSTRAINT "execucoes_fecho_tipo_estado_valido"
  CHECK (
    ("tipo" = 'fechoMensal' AND "periodo_id" IS NOT NULL) OR
    ("tipo" = 'apuramentoIva' AND "periodo_id" IS NOT NULL) OR
    ("tipo" = 'apuramentoResultados' AND "periodo_id" IS NOT NULL) OR
    ("tipo" = 'fechoAnual' AND "periodo_id" IS NOT NULL) OR
    ("tipo" = 'aberturaExercicioSeguinte')
  );

ALTER TABLE "execucoes_fecho"
  ADD CONSTRAINT "execucoes_fecho_estado_transicao_valida"
  CHECK (
    "estado" IN ('previsao', 'executado', 'revertido', 'falhado')
  );

-- Constraints para ApuramentoImposto
ALTER TABLE "apuramentos_imposto"
  ADD CONSTRAINT "apuramentos_imposto_valores_nao_negativos"
  CHECK ("liquidado" >= 0 AND "dedutivel" >= 0 AND "credito_transitado" >= 0);

ALTER TABLE "apuramentos_imposto"
  ADD CONSTRAINT "apuramentos_imposto_saldo_consistente"
  CHECK ("saldo" = "liquidado" - "dedutivel" - "credito_transitado");

ALTER TABLE "apuramentos_imposto"
  ADD CONSTRAINT "apuramentos_imposto_estado_valido"
  CHECK ("estado" IN ('rascunho', 'validado', 'pago'));

-- Trigger para impedir escrita em período/exercício fechado via ExecucaoFecho
CREATE OR REPLACE FUNCTION "proteger_fecho_periodo"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE', 'DELETE') THEN
    IF EXISTS (
      SELECT 1 FROM "execucoes_fecho" ef
      JOIN "periodos_contabeis" p ON ef."periodo_id" = p.id
      WHERE ef."periodo_id" = COALESCE(NEW."periodo_id", OLD."periodo_id")
        AND p."estado" IN ('fechado', 'bloqueado')
        AND ef."estado" = 'executado'
    ) THEN
      RAISE EXCEPTION 'Período está fechado/bloqueado e não permite alterações.';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_execucao_fecho_proteger_periodo"
BEFORE INSERT OR UPDATE OR DELETE ON "apuramentos_imposto"
FOR EACH ROW EXECUTE FUNCTION "proteger_fecho_periodo"();
