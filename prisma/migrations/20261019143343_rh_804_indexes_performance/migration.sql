-- CreateIndex
CREATE INDEX "rh_processamentos_data_processamento_idx" ON "rh_processamentos"("data_processamento");

-- CreateIndex
CREATE INDEX "rh_recibos_processamento_id_idx" ON "rh_recibos"("processamento_id");
