-- Tesouraria: totais fiados e meio de pagamento por movimento.
--
-- `total_entradas` e `total_saidas` passam a ser persistidos no fecho da sessão
-- para que a apuração de uma sessão fechada reproduza os mesmos números que a
-- sessão aberta mostra, sem os reconstruir a partir de somas agregadas.
--
-- `meio_pagamento` distingue numerário de multicaixa ao nível do movimento,
-- único sítio fiável para separar as moedas contadas na arqueação.

ALTER TABLE "sessoes_caixa"
  ADD COLUMN "total_entradas" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
  ADD COLUMN "total_saidas"   DECIMAL(18,4) NOT NULL DEFAULT 0.0;

ALTER TABLE "movimentos_tesouraria"
  ADD COLUMN "meio_pagamento" TEXT;

-- Sessões já fechadas antes desta migração: as entradas e saídas não eram
-- distinguíveis dos totais agregados, por isso ficam a zero e a apuração passa
-- a devolver a mesma informação (zero) em vez de números inventados.
UPDATE "sessoes_caixa"
SET "total_entradas" = 0.0,
    "total_saidas"   = 0.0
WHERE "total_entradas" = 0.0 AND "total_saidas" = 0.0;

CREATE INDEX "movimentos_tesouraria_meio_pagamento_idx" ON "movimentos_tesouraria"("meio_pagamento");
