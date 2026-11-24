-- =============================================================================
-- Contabilidade — fundações
-- Plano de contas, diários, períodos e mapeamentos de contas.
-- A coluna `exercicios_fiscais.estado` passa de texto livre a enum, com
-- conversão explícita para não perder os exercícios já existentes.
-- =============================================================================

-- CreateEnum
CREATE TYPE "NaturezaConta" AS ENUM ('devedora', 'credora');

-- CreateEnum
CREATE TYPE "TipoContaContabil" AS ENUM ('activo', 'passivo', 'capitalProprio', 'proveito', 'custo', 'resultado', 'memo');

-- CreateEnum
CREATE TYPE "EstadoExercicio" AS ENUM ('aberto', 'emFecho', 'fechado');

-- CreateEnum
CREATE TYPE "EstadoPeriodoContabil" AS ENUM ('aberto', 'fechado', 'bloqueado');

-- CreateEnum
CREATE TYPE "TipoDiario" AS ENUM ('vendas', 'compras', 'caixa', 'banco', 'geral', 'ajustamento', 'abertura', 'liquidacao', 'salarios', 'imobilizado');

-- AlterTable
ALTER TABLE "contas_bancarias" ADD COLUMN     "conta_contabil_id" TEXT;

-- AlterTable (estado convertido de text para enum sem perder valores)
ALTER TABLE "exercicios_fiscais"
  ADD COLUMN "fechado_em" TIMESTAMP(3),
  ADD COLUMN "fechado_por_id" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "exercicios_fiscais" ALTER COLUMN "estado" DROP DEFAULT;

ALTER TABLE "exercicios_fiscais"
  ALTER COLUMN "estado" TYPE "EstadoExercicio"
  USING (
    CASE "estado"
      WHEN 'fechado' THEN 'fechado'::"EstadoExercicio"
      WHEN 'emFecho' THEN 'emFecho'::"EstadoExercicio"
      ELSE 'aberto'::"EstadoExercicio"
    END
  );

ALTER TABLE "exercicios_fiscais" ALTER COLUMN "estado" SET DEFAULT 'aberto';

-- CreateTable
CREATE TABLE "contas_contabeis" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT NOT NULL,
    "conta_pai_id" TEXT,
    "nivel" INTEGER NOT NULL,
    "classe" INTEGER NOT NULL,
    "tipo" "TipoContaContabil" NOT NULL,
    "natureza" "NaturezaConta" NOT NULL,
    "aceita_movimento" BOOLEAN NOT NULL DEFAULT false,
    "exige_centro_custo" BOOLEAN NOT NULL DEFAULT false,
    "exige_entidade" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contas_contabeis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodos_contabeis" (
    "id" TEXT NOT NULL,
    "exercicio_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "estado" "EstadoPeriodoContabil" NOT NULL DEFAULT 'aberto',
    "fechado_em" TIMESTAMP(3),
    "fechado_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periodos_contabeis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diarios_contabeis" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT NOT NULL,
    "tipo" "TipoDiario" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diarios_contabeis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequencias_diario" (
    "id" TEXT NOT NULL,
    "diario_id" TEXT NOT NULL,
    "exercicio_id" TEXT NOT NULL,
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequencias_diario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mapeamentos_conta" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "conta_id" TEXT NOT NULL,

    CONSTRAINT "mapeamentos_conta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contas_contabeis_empresa_id_classe_idx" ON "contas_contabeis"("empresa_id", "classe");

-- CreateIndex
CREATE INDEX "contas_contabeis_empresa_id_aceita_movimento_idx" ON "contas_contabeis"("empresa_id", "aceita_movimento");

-- CreateIndex
CREATE INDEX "contas_contabeis_empresa_id_activa_idx" ON "contas_contabeis"("empresa_id", "activa");

-- CreateIndex
CREATE UNIQUE INDEX "contas_contabeis_empresa_id_codigo_key" ON "contas_contabeis"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "periodos_contabeis_exercicio_id_estado_idx" ON "periodos_contabeis"("exercicio_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "periodos_contabeis_exercicio_id_numero_key" ON "periodos_contabeis"("exercicio_id", "numero");

-- CreateIndex
CREATE INDEX "diarios_contabeis_empresa_id_activo_idx" ON "diarios_contabeis"("empresa_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "diarios_contabeis_empresa_id_codigo_key" ON "diarios_contabeis"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "sequencias_diario_diario_id_exercicio_id_key" ON "sequencias_diario"("diario_id", "exercicio_id");

-- CreateIndex
CREATE INDEX "mapeamentos_conta_conta_id_idx" ON "mapeamentos_conta"("conta_id");

-- CreateIndex
CREATE UNIQUE INDEX "mapeamentos_conta_empresa_id_chave_key" ON "mapeamentos_conta"("empresa_id", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "contas_bancarias_conta_contabil_id_key" ON "contas_bancarias"("conta_contabil_id");

-- CreateIndex
CREATE INDEX "exercicios_fiscais_empresa_id_estado_idx" ON "exercicios_fiscais"("empresa_id", "estado");

-- AddForeignKey
ALTER TABLE "exercicios_fiscais" ADD CONSTRAINT "exercicios_fiscais_fechado_por_id_fkey" FOREIGN KEY ("fechado_por_id") REFERENCES "utilizadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_conta_contabil_id_fkey" FOREIGN KEY ("conta_contabil_id") REFERENCES "contas_contabeis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_contabeis" ADD CONSTRAINT "contas_contabeis_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_contabeis" ADD CONSTRAINT "contas_contabeis_conta_pai_id_fkey" FOREIGN KEY ("conta_pai_id") REFERENCES "contas_contabeis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodos_contabeis" ADD CONSTRAINT "periodos_contabeis_exercicio_id_fkey" FOREIGN KEY ("exercicio_id") REFERENCES "exercicios_fiscais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodos_contabeis" ADD CONSTRAINT "periodos_contabeis_fechado_por_id_fkey" FOREIGN KEY ("fechado_por_id") REFERENCES "utilizadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diarios_contabeis" ADD CONSTRAINT "diarios_contabeis_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequencias_diario" ADD CONSTRAINT "sequencias_diario_diario_id_fkey" FOREIGN KEY ("diario_id") REFERENCES "diarios_contabeis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequencias_diario" ADD CONSTRAINT "sequencias_diario_exercicio_id_fkey" FOREIGN KEY ("exercicio_id") REFERENCES "exercicios_fiscais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mapeamentos_conta" ADD CONSTRAINT "mapeamentos_conta_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mapeamentos_conta" ADD CONSTRAINT "mapeamentos_conta_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas_contabeis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
