-- Moeda padrão AOA (Kwanza) nas quatro entidades e reconciliação de drift pré-existente
-- (enum UnidadeArtigo com M2/M3 e remoção de defaults obsoletos introduzidos no WIP RBAC/stocks
-- mas nunca migrados; necessários para que a BD volte a ficar sincronizada com o schema).

-- 1) Defaults de moeda passam a AOA (Kwanza)
ALTER TABLE "empresa_config" ALTER COLUMN "moeda_base" SET DEFAULT 'AOA';
ALTER TABLE "clientes" ALTER COLUMN "moeda" SET DEFAULT 'AOA';
ALTER TABLE "proformas_venda" ALTER COLUMN "moeda" SET DEFAULT 'AOA';
ALTER TABLE "contas_bancarias" ALTER COLUMN "moeda" SET DEFAULT 'AOA';

-- 2) Reconciliar enum UnidadeArtigo (adicionar M2/M3 já presentes no schema)
BEGIN;
CREATE TYPE "UnidadeArtigo_new" AS ENUM ('UN', 'KG', 'L', 'CX', 'M', 'M2', 'M3');
ALTER TABLE "artigos" ALTER COLUMN "unidade" TYPE "UnidadeArtigo_new" USING ("unidade"::text::"UnidadeArtigo_new");
ALTER TYPE "UnidadeArtigo" RENAME TO "UnidadeArtigo_old";
ALTER TYPE "UnidadeArtigo_new" RENAME TO "UnidadeArtigo";
DROP TYPE "public"."UnidadeArtigo_old";
COMMIT;

-- 3) Remover defaults obsoletos (colunas que deixaram de ser nullable/preechidas por trigger)
ALTER TABLE "linhas_fatura_venda" ALTER COLUMN "artigo_codigo" DROP DEFAULT,
ALTER COLUMN "artigo_descricao" DROP DEFAULT,
ALTER COLUMN "artigo_unidade" DROP DEFAULT;

ALTER TABLE "utilizadores" ALTER COLUMN "atualizado_em" DROP DEFAULT;