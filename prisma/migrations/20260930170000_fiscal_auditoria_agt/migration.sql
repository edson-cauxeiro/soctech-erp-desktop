-- Auditoria fiscal e rastreio de submissões AGT (SPRINT 5).
--
-- `audit_logs` é append-only por desenho: não há coluna `updated_at` e não
-- se cria `trigger`/`rule` de protecção aqui porque o Prisma Client não
-- expõe um caminho de update para esta tabela. O hash de integridade por
-- linha cobre a mesma necessidade sem depender de trigger.
--
-- Os enums replicam os de `prisma/schema.prisma` com os mesmos valores em
-- minúsculas, para os literais gravados serem legíveis numa consulta manual.

CREATE TYPE "SeveridadeAuditoria" AS ENUM ('info', 'aviso', 'critico');

CREATE TYPE "TipoAcaoAuditoria" AS ENUM (
    'criar',
    'actualizar',
    'eliminar',
    'exportar',
    'validar',
    'imprimir',
    'login',
    'logout',
    'anular',
    'submeter'
);

CREATE TYPE "EstadoSubmissaoAgt" AS ENUM (
    'rascunho',
    'assinado',
    'submetido',
    'aceite',
    'rejeitado'
);

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "utilizador_id" TEXT,
    "acao" "TipoAcaoAuditoria" NOT NULL,
    "severidade" "SeveridadeAuditoria" NOT NULL DEFAULT 'info',
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT,
    "modulo" TEXT NOT NULL DEFAULT 'fiscal',
    "descricao" TEXT NOT NULL,
    "dados_anteriores" TEXT,
    "dados_novos" TEXT,
    "endereco_ip" TEXT,
    "agente_utilizador" TEXT,
    "integridade" TEXT,
    "data_hora" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "submissoes_agt" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nome_ficheiro" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'AOA',
    "periodo" TEXT NOT NULL,
    "estado" "EstadoSubmissaoAgt" NOT NULL DEFAULT 'rascunho',
    "hash_ficheiro" TEXT NOT NULL,
    "hash_assinatura" TEXT,
    "utilizador_id" TEXT,
    "resultado_validacao" TEXT,
    "resposta_agt" TEXT,
    "observacoes" TEXT,
    "submitted_at" TIMESTAMPTZ,
    "data_hora" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissoes_agt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_empresa_id_data_hora_idx" ON "audit_logs"("empresa_id", "data_hora");
CREATE INDEX "audit_logs_entidade_entidade_id_idx" ON "audit_logs"("entidade", "entidade_id");
CREATE INDEX "audit_logs_utilizador_id_data_hora_idx" ON "audit_logs"("utilizador_id", "data_hora");
CREATE INDEX "submissoes_agt_empresa_id_data_hora_idx" ON "submissoes_agt"("empresa_id", "data_hora");
CREATE INDEX "submissoes_agt_estado_idx" ON "submissoes_agt"("estado");

ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_utilizador_id_fkey"
    FOREIGN KEY ("utilizador_id") REFERENCES "utilizadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "submissoes_agt"
    ADD CONSTRAINT "submissoes_agt_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresa_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "submissoes_agt"
    ADD CONSTRAINT "submissoes_agt_utilizador_id_fkey"
    FOREIGN KEY ("utilizador_id") REFERENCES "utilizadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
