-- =============================================================================
-- Utilizadores, Perfis de Acesso e RBAC
--
-- - Torna a empresa obrigatória para qualquer utilizador (RN de multi-empresa).
-- - Normaliza a coluna da empresa para a convenção snake_case do projecto.
-- - Acrescenta telefone e datas de auditoria ao utilizador.
-- - Acrescenta descrição e sinalizador de sistema ao perfil de acesso.
-- - Liga o armazém por defeito do utilizador ao armazém real (integridade referencial).
-- =============================================================================

-- Perfis de acesso ------------------------------------------------------------
ALTER TABLE "perfis_acesso" ADD COLUMN IF NOT EXISTS "descricao" TEXT;
ALTER TABLE "perfis_acesso" ADD COLUMN IF NOT EXISTS "sistema" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "perfis_acesso" ALTER COLUMN "permissoes_json" SET DEFAULT '{}';

-- O perfil Administrador é de sistema: protege-se de ser apagado pela aplicação.
UPDATE "perfis_acesso" SET "sistema" = true WHERE "nome" = 'Administrador';

-- Utilizadores ---------------------------------------------------------------
ALTER TABLE "utilizadores" RENAME COLUMN "empresaConfigId" TO "empresa_config_id";

ALTER TABLE "utilizadores" ALTER COLUMN "empresa_config_id" SET NOT NULL;
ALTER TABLE "utilizadores" ALTER COLUMN "estado" SET DEFAULT 'ativo';

ALTER TABLE "utilizadores" ADD COLUMN IF NOT EXISTS "telefone" TEXT;
ALTER TABLE "utilizadores" ADD COLUMN IF NOT EXISTS "ultimo_acesso_em" TIMESTAMP(3);
ALTER TABLE "utilizadores" ADD COLUMN IF NOT EXISTS "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "utilizadores" ADD COLUMN IF NOT EXISTS "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- A empresa é eliminada em cascata quando os seus utilizadores são removidos.
ALTER TABLE "utilizadores" DROP CONSTRAINT IF EXISTS "utilizadores_empresaConfigId_fkey";
ALTER TABLE "utilizadores"
  ADD CONSTRAINT "utilizadores_empresa_config_id_fkey"
  FOREIGN KEY ("empresa_config_id") REFERENCES "empresa_config"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- O armazém por defeito passa a ser uma referência válida, não texto livre.
ALTER TABLE "utilizadores" DROP CONSTRAINT IF EXISTS "utilizadores_armazem_default_id_fkey";
ALTER TABLE "utilizadores"
  ADD CONSTRAINT "utilizadores_armazem_default_id_fkey"
  FOREIGN KEY ("armazem_default_id") REFERENCES "armazens"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Índices para os filtros mais usados na gestão de utilizadores.
CREATE INDEX IF NOT EXISTS "utilizadores_empresa_config_id_idx" ON "utilizadores"("empresa_config_id");
CREATE INDEX IF NOT EXISTS "utilizadores_perfil_id_idx" ON "utilizadores"("perfil_id");
CREATE INDEX IF NOT EXISTS "utilizadores_estado_idx" ON "utilizadores"("estado");
