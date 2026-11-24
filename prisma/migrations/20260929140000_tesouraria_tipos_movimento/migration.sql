-- AlterEnum
BEGIN;
CREATE TYPE "TipoMovimentoTesouraria_new" AS ENUM ('entrada', 'saida', 'transferencia', 'ajuste');
ALTER TABLE "movimentos_tesouraria" ALTER COLUMN "tipo" TYPE "TipoMovimentoTesouraria_new" USING ("tipo"::text::"TipoMovimentoTesouraria_new");
ALTER TYPE "TipoMovimentoTesouraria" RENAME TO "TipoMovimentoTesouraria_old";
ALTER TYPE "TipoMovimentoTesouraria_new" RENAME TO "TipoMovimentoTesouraria";
DROP TYPE "public"."TipoMovimentoTesouraria_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoSerieDocumento" ADD VALUE 'TS';
ALTER TYPE "TipoSerieDocumento" ADD VALUE 'SC';
