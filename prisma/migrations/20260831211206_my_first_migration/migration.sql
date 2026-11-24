-- CreateEnum
CREATE TYPE "Pais" AS ENUM ('PT', 'AO', 'outro');

-- CreateEnum
CREATE TYPE "RegimeIva" AS ENUM ('geral', 'simplificado', 'isento');

-- CreateEnum
CREATE TYPE "EstadoUtilizador" AS ENUM ('ativo', 'inativo');

-- CreateEnum
CREATE TYPE "TipoArtigo" AS ENUM ('produto_acabado', 'materia_prima', 'produto_intermedio', 'consumivel', 'servico');

-- CreateEnum
CREATE TYPE "UnidadeArtigo" AS ENUM ('UN', 'KG', 'L', 'CX', 'M', 'M²', 'M³');

-- CreateEnum
CREATE TYPE "EstadoArtigo" AS ENUM ('ativo', 'descontinuado', 'inativo');

-- CreateEnum
CREATE TYPE "TipoEntidade" AS ENUM ('particular', 'empresa');

-- CreateEnum
CREATE TYPE "EstadoCliente" AS ENUM ('ativo', 'inativo', 'bloqueado');

-- CreateEnum
CREATE TYPE "RegimeIvaEntidade" AS ENUM ('geral', 'isento', 'misto');

-- CreateEnum
CREATE TYPE "EstadoFornecedor" AS ENUM ('ativo', 'bloqueado');

-- CreateEnum
CREATE TYPE "TipoDocumentoVenda" AS ENUM ('fatura', 'fatura_recibo', 'nota_credito', 'nota_debito');

-- CreateEnum
CREATE TYPE "EstadoPagamento" AS ENUM ('pago', 'pendente', 'parcial', 'vencido');

-- CreateEnum
CREATE TYPE "MeioPagamento" AS ENUM ('numerario', 'transferencia', 'cheque', 'multicaixa');

-- CreateEnum
CREATE TYPE "TipoArmazem" AS ENUM ('materia_prima', 'produto_acabado', 'producao', 'devolucoes');

-- CreateEnum
CREATE TYPE "TipoMovimentoStock" AS ENUM ('entrada', 'saida', 'transferencia', 'ajuste', 'consumo_producao');

-- CreateEnum
CREATE TYPE "TipoContaBancaria" AS ENUM ('banco', 'caixa');

-- CreateEnum
CREATE TYPE "TipoMovimentoTesouraria" AS ENUM ('pagamento', 'recebimento', 'transferencia');

-- CreateEnum
CREATE TYPE "EstadoMovimentoTesouraria" AS ENUM ('confirmado', 'pendente');

-- CreateTable
CREATE TABLE "empresa_config" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nif" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "pais" "Pais" NOT NULL,
    "cae" TEXT,
    "regime_iva" "RegimeIva" NOT NULL,
    "moeda_base" TEXT NOT NULL DEFAULT 'EUR',
    "ano_fiscal_inicio" DATE NOT NULL,
    "ano_fiscal_fim" DATE NOT NULL,
    "serie_default" TEXT,
    "dados_bancarios" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresa_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfis_acesso" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "permissoes_json" TEXT NOT NULL,

    CONSTRAINT "perfis_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilizadores" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "nome_completo" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "estado" "EstadoUtilizador" NOT NULL,
    "perfil_id" TEXT NOT NULL,
    "armazem_default_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empresaConfigId" TEXT,

    CONSTRAINT "utilizadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artigos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoArtigo" NOT NULL,
    "unidade" "UnidadeArtigo" NOT NULL,
    "familia" TEXT,
    "codigo_barras" TEXT,
    "estado" "EstadoArtigo" NOT NULL DEFAULT 'ativo',
    "preco_venda" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "taxa_iva" DECIMAL(5,2) NOT NULL DEFAULT 23.0,
    "fator_conversao" DECIMAL(10,4) DEFAULT 1.0,
    "stock_minimo" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "stock_maximo" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "ponto_encomenda" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "controlo_lote" BOOLEAN NOT NULL DEFAULT false,
    "armazem_padrao_id" TEXT,
    "preco_custo_medio" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "bom" TEXT,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artigos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nif" TEXT NOT NULL,
    "tipo" "TipoEntidade" NOT NULL,
    "endereco" TEXT NOT NULL,
    "codigo_postal" TEXT,
    "cidade" TEXT,
    "pais" TEXT NOT NULL DEFAULT 'Portugal',
    "telefone" TEXT,
    "email" TEXT,
    "cond_pagamento" TEXT,
    "metodo_pagamento" TEXT,
    "limite_credito" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
    "desconto_padrao" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "moeda" TEXT NOT NULL DEFAULT 'EUR',
    "vendedor" TEXT,
    "estado" "EstadoCliente" NOT NULL DEFAULT 'ativo',
    "regime_iva" "RegimeIvaEntidade" NOT NULL DEFAULT 'geral',
    "retencao_fonte" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nif" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "cond_pagamento" TEXT,
    "iban" TEXT,
    "prazo_entrega_dias" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoFornecedor" NOT NULL DEFAULT 'ativo',
    "retencao_fonte" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faturas_venda" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "tipo" "TipoDocumentoVenda" NOT NULL,
    "data_emissao" DATE NOT NULL,
    "data_vencimento" DATE NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "cliente_nome" TEXT NOT NULL,
    "cliente_nif" TEXT NOT NULL,
    "cliente_endereco" TEXT NOT NULL,
    "encomenda_origem" TEXT,
    "motivo_isencao" TEXT,
    "estado_pagamento" "EstadoPagamento" NOT NULL,
    "atcud" TEXT,
    "hash_assinatura" TEXT,
    "total_iliquido" DECIMAL(18,4) NOT NULL,
    "total_iva" DECIMAL(18,4) NOT NULL,
    "total_liquido" DECIMAL(18,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faturas_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linhas_fatura_venda" (
    "id" TEXT NOT NULL,
    "fatura_id" TEXT NOT NULL,
    "artigo_id" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "preco_unitario" DECIMAL(18,4) NOT NULL,
    "desconto" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "taxa_iva" DECIMAL(5,2) NOT NULL,
    "total_linha" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "linhas_fatura_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recibos_venda" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "meio_pagamento" "MeioPagamento" NOT NULL,
    "valor_recebido" DECIMAL(18,4) NOT NULL,
    "conta_bancaria" TEXT,
    "retencao_fonte" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recibos_venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imputacoes_recibo" (
    "id" TEXT NOT NULL,
    "recibo_id" TEXT NOT NULL,
    "fatura_id" TEXT NOT NULL,
    "valor_imputado" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "imputacoes_recibo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "armazens" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT NOT NULL,
    "tipo" "TipoArmazem",
    "localizacao" TEXT,

    CONSTRAINT "armazens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos_stock" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" "TipoMovimentoStock" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "artigo_id" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "armazem_origem_id" TEXT,
    "armazem_destino_id" TEXT,
    "lote" TEXT,
    "documento_origem" TEXT NOT NULL,
    "custo_unitario" DECIMAL(18,4) NOT NULL DEFAULT 0.0,

    CONSTRAINT "movimentos_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_bancarias" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "designacao" TEXT NOT NULL,
    "tipo" "TipoContaBancaria" NOT NULL,
    "iban" TEXT,
    "saldo_atual" DECIMAL(18,4) NOT NULL DEFAULT 0.0,
    "moeda" TEXT NOT NULL DEFAULT 'EUR',

    CONSTRAINT "contas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos_tesouraria" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "tipo" "TipoMovimentoTesouraria" NOT NULL,
    "conta_origem_id" TEXT NOT NULL,
    "conta_destino_id" TEXT,
    "valor" DECIMAL(18,4) NOT NULL,
    "entidade" TEXT,
    "documento_origem" TEXT,
    "descricao" TEXT,
    "estado" "EstadoMovimentoTesouraria" NOT NULL DEFAULT 'confirmado',

    CONSTRAINT "movimentos_tesouraria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresa_config_nif_key" ON "empresa_config"("nif");

-- CreateIndex
CREATE UNIQUE INDEX "perfis_acesso_nome_key" ON "perfis_acesso"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "utilizadores_login_key" ON "utilizadores"("login");

-- CreateIndex
CREATE UNIQUE INDEX "utilizadores_email_key" ON "utilizadores"("email");

-- CreateIndex
CREATE UNIQUE INDEX "artigos_codigo_key" ON "artigos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "artigos_codigo_barras_key" ON "artigos"("codigo_barras");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_codigo_key" ON "clientes"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_codigo_key" ON "fornecedores"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "faturas_venda_numero_key" ON "faturas_venda"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "recibos_venda_numero_key" ON "recibos_venda"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "armazens_codigo_key" ON "armazens"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "movimentos_stock_numero_key" ON "movimentos_stock"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "contas_bancarias_codigo_key" ON "contas_bancarias"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "movimentos_tesouraria_numero_key" ON "movimentos_tesouraria"("numero");

-- AddForeignKey
ALTER TABLE "utilizadores" ADD CONSTRAINT "utilizadores_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfis_acesso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilizadores" ADD CONSTRAINT "utilizadores_empresaConfigId_fkey" FOREIGN KEY ("empresaConfigId") REFERENCES "empresa_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas_venda" ADD CONSTRAINT "faturas_venda_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_fatura_venda" ADD CONSTRAINT "linhas_fatura_venda_fatura_id_fkey" FOREIGN KEY ("fatura_id") REFERENCES "faturas_venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_fatura_venda" ADD CONSTRAINT "linhas_fatura_venda_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos_venda" ADD CONSTRAINT "recibos_venda_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imputacoes_recibo" ADD CONSTRAINT "imputacoes_recibo_recibo_id_fkey" FOREIGN KEY ("recibo_id") REFERENCES "recibos_venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imputacoes_recibo" ADD CONSTRAINT "imputacoes_recibo_fatura_id_fkey" FOREIGN KEY ("fatura_id") REFERENCES "faturas_venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_stock" ADD CONSTRAINT "movimentos_stock_artigo_id_fkey" FOREIGN KEY ("artigo_id") REFERENCES "artigos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_stock" ADD CONSTRAINT "movimentos_stock_armazem_origem_id_fkey" FOREIGN KEY ("armazem_origem_id") REFERENCES "armazens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_stock" ADD CONSTRAINT "movimentos_stock_armazem_destino_id_fkey" FOREIGN KEY ("armazem_destino_id") REFERENCES "armazens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_tesouraria" ADD CONSTRAINT "movimentos_tesouraria_conta_origem_id_fkey" FOREIGN KEY ("conta_origem_id") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_tesouraria" ADD CONSTRAINT "movimentos_tesouraria_conta_destino_id_fkey" FOREIGN KEY ("conta_destino_id") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
