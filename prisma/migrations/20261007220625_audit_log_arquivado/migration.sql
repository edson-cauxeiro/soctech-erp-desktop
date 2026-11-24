-- AlterEnum
ALTER TYPE "EstrategiaPicking" ADD VALUE 'lifo';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "arquivado" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "audit_logs_arquivado_idx" ON "audit_logs"("arquivado");
