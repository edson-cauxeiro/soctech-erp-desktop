-- CreateIndex
CREATE INDEX "estoques_estado_idx" ON "estoques"("estado");

-- CreateIndex
CREATE INDEX "estoques_artigo_id_armazem_id_idx" ON "estoques"("artigo_id", "armazem_id");

-- CreateIndex
CREATE INDEX "movimentos_stock_criado_por_id_idx" ON "movimentos_stock"("criado_por_id");

-- CreateIndex
CREATE INDEX "movimentos_stock_documento_tipo_documento_id_idx" ON "movimentos_stock"("documento_tipo", "documento_id");
