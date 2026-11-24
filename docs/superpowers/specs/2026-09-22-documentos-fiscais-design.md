# Desenho — Documentos Fiscais e Comerciais

**Data:** 2026-09-22  
**Estado:** aprovado para revisão da especificação

## Objetivo

Adicionar ao DoraERP documentos de venda persistidos, auditáveis e imprimíveis: Fatura (FT), Fatura-Recibo (FR), Nota de Crédito (NC), Fatura Proforma (FP), Guia de Entrega (GR) e Recibo (RC). Os documentos devem respeitar as regras atuais de clientes, artigos, armazéns, stock, séries, IVA e AGT, sem duplicar infraestrutura.

## Decisões de negócio aprovadas

- Uma Proforma é comercial: não reserva nem movimenta stock.
- A confirmação de uma Guia de Entrega representa a saída física e baixa stock apenas uma vez.
- Uma Fatura criada a partir de uma Guia não cria nova saída de stock.
- Recibos podem não ter imputações: o valor não alocado constitui adiantamento do cliente e pode ser imputado mais tarde.
- Faturas, Faturas-Recibo, Notas de Crédito, Proformas, Guias e Recibos têm numeração e série próprias: FT, FR, NC, FP, GR e RC.
- Documentos emitidos são imutáveis. A anulação mantém o registo e a rastreabilidade; não há eliminação.

## Persistência

### FaturaVenda e linhas existentes

`FaturaVenda` continua a representar FT, FR, NC e ND. Será estendida com:

- `estadoDocumento` para distinguir documento emitido de anulado, independentemente do estado de pagamento.
- `faturaOrigemId` para ligar uma NC à Fatura/Fatura-Recibo retificado; uma NC exige esta referência.
- `guiaEntregaOrigemId` para ligar uma Fatura a uma Guia confirmada e impedir uma segunda baixa de stock.
- campos de referência de origem e de anulação, quando aplicável.

`LinhaFaturaVenda` recebe snapshots do artigo (código, descrição e unidade). A impressão de um documento emitido nunca depende da ficha atual do artigo.

A emissão direta de FT/FR mantém a baixa de stock atual. A emissão derivada de uma Guia confirmada não gera movimentos. Uma NC não repõe stock automaticamente: devoluções físicas permanecem movimentos de stock explícitos, auditáveis e independentes da retificação financeira.

### ProformaVenda e LinhaProformaVenda

Novas entidades para propostas comerciais:

- Cabeçalho: número, série, data de emissão, data de validade, moeda, cliente e snapshots fiscais, referências de encomenda, totais, motivo de isenção, estado e referências de conversão.
- Linhas: artigo, snapshots, quantidade, preço unitário, desconto, IVA, motivo de isenção e total de linha.
- Estados: `rascunho`, `emitida`, `convertida`, `anulada`.
- Uma Proforma emitida é convertível em Guia ou Fatura. A conversão cria novo documento, preserva a ligação de origem e marca a Proforma como convertida.
- Não cria movimentos de stock, contas a receber nem saldos de cliente.

### GuiaEntrega e LinhaGuiaEntrega

Novas entidades logísticas de saída:

- Cabeçalho: número, série, data, cliente e snapshots, armazém de expedição, referências de encomenda/proforma, local de entrega, transportador opcional, observações, estado e referência à Fatura originada.
- Linhas: artigo, snapshots, quantidade, unidade, armazém e lote quando aplicável. Não têm preço, desconto, IVA nem totais fiscais.
- Estados: `rascunho`, `confirmada`, `faturada`, `anulada`.
- Confirmar uma Guia valida cliente, artigos, lote e saldo no armazém. Numa única transação, grava a guia e os movimentos de saída com `documentoOrigem` igual ao número da guia.
- Apenas Guias confirmadas podem originar uma Fatura. A Fatura resultante fica ligada à Guia e não baixa stock novamente.

### ReciboVenda e ImputacaoRecibo

`ReciboVenda` passa a guardar série, estado do documento e snapshots do cliente para garantir fidelidade histórica. `ImputacaoRecibo` mantém a ligação a faturas e valores imputados.

- A criação do Recibo valida que cada imputação não ultrapassa o saldo da fatura e que a soma imputada não ultrapassa o valor recebido, descontada a retenção configurada.
- Recibos sem imputações são válidos e representam adiantamentos.
- Uma operação própria permite imputar posteriormente saldo de adiantamento a uma Fatura elegível do mesmo cliente.
- Cada imputação recalcula o estado de pagamento da fatura (`pendente`, `parcial`, `pago`) de forma transacional.

### Empresa, série e numeração

`EmpresaConfig` será estendida com contacto telefónico, email e URL de logótipo opcionais para a composição dos documentos. Os dados bancários existentes serão convertidos para a estrutura de apresentação quando preenchidos.

A série existente (`SerieDocumento`) será usada como fonte de numeração. Cada tipo de documento usará uma série ativa própria. A geração decorre dentro da transação de emissão, atualizando `ultimoLancamento` de forma atómica e compondo o número legível com o prefixo e a série. Nenhum formulário aceitará número final livre sem autorização do serviço.

## Serviços, validação e IPC

Novos serviços e validadores Zod cobrirão Proformas, Guias e Recibos. O `VendasService` será adaptado apenas para regras comuns de FT/FR/NC e conversões de origem.

Os serviços expostos por IPC serão organizados em operações explícitas:

- criar, listar, obter, emitir, converter e anular Proformas;
- criar, listar, obter, confirmar, faturar e anular Guias;
- criar, listar, obter, imputar, pré-visualizar e anular Recibos;
- listar, obter, emitir, pré-visualizar, anular e exportar Faturas e NC.

Todas as entradas de IPC são validadas por Zod. Operações de emissão/confirmação usam transações Prisma e devolvem os DTOs já enriquecidos com os snapshots necessários para apresentação.

## Modelo de apresentação

A pasta de documentos conterá apenas modelos de leitura e componentes de impressão. Um adaptador converte os DTOs persistidos para um modelo comum de apresentação, sem criar um modelo de negócio paralelo.

Componentes partilhados:

- folha A4 com largura de 210 mm, altura mínima de 297 mm e estilos próprios de impressão;
- cabeçalho com emitente, logótipo, dados fiscais, destinatário e selo Original/Duplicado;
- tabela de linhas configurável;
- resumo de impostos, totais por extenso e dados bancários;
- rodapé com referências, observações e área de assinatura quando aplicável.

Templates:

| Documento | Conteúdo específico |
| --- | --- |
| Fatura / Fatura-Recibo | Linhas com valores, impostos, totais, vencimento/condição de pagamento e QR AGT quando aplicável. |
| Nota de Crédito | Campos da Fatura, motivo de emissão e referência obrigatória à fatura origem. |
| Fatura Proforma | Linhas e totais comerciais, data de validade, referências e marca visível de que não é documento fiscal nem movimenta stock. |
| Guia de Entrega | Armazém, local de entrega, quantidades e lotes; esconde preços, descontos, IVA, totais e QR; inclui a menção “Não serve como fatura”. |
| Recibo | Meio de pagamento, conta de destino, retenção, valor recebido, valores imputados, saldo de adiantamento e referências das faturas liquidadas. |

## QR Code AGT

A dependência `qrcode` gera um PNG Model 2, modo UTF-8, correção M e 350×350 px. O módulo disponibiliza funções isoladas para construir a URL de verificação e validar NIF/número do documento.

A geração tenta inicialmente a versão 4. Quando o conteúdo ultrapassa a capacidade dessa versão, a biblioteca escolhe automaticamente a menor versão adequada, mantendo correção M. O componente de QR apresenta estado de carregamento e erro, e aceita opcionalmente um logótipo AGT abaixo de 20% da área.

O QR é apresentado em FT, FR e NC quando a empresa estiver configurada para Angola e existirem NIF e número válidos. Nunca é exibido em Proforma, Guia ou Recibo.

## Pré-visualização, impressão e PDF

O histórico de Vendas receberá ações por documento: pré-visualizar, imprimir/PDF, confirmar, converter e anular, conforme o estado e o tipo.

A pré-visualização renderiza o template dentro de uma área dedicada de impressão. O CSS `@media print` oculta a shell do ERP e remove sombras, preservando exclusivamente a folha A4.

No Electron, um handler IPC recebe apenas um nome de ficheiro sugerido, normaliza-o para evitar caminhos arbitrários, abre `dialog.showSaveDialog` e executa `webContents.printToPDF` sobre o `webContents` chamador com A4, fundo impresso e margens nulas. Fora do Electron, a ação usa `window.print()`.

## Erros e estados inválidos

- Um documento não pode ser emitido sem cliente, série ativa e pelo menos uma linha válida.
- IVA a 0% exige motivo de isenção no documento e nas linhas apresentadas.
- Uma NC exige Fatura origem elegível e valor retificado não superior ao permitido.
- Uma Guia só pode ser confirmada com stock suficiente e lote preenchido para artigos com controlo de lote.
- Uma Fatura não pode ser criada a partir de uma Guia não confirmada ou já faturada.
- Uma imputação não pode cruzar clientes, ultrapassar o adiantamento disponível ou o saldo pendente da Fatura.
- Os erros de domínio chegam ao renderer como respostas IPC estruturadas e são apresentados de forma clara, sem expor detalhes internos.

## Testes e validação

Testes Vitest cobrirão:

- numeração por série/tipo e snapshots fiscais;
- motivo de isenção, cálculos de totais e limites de NC;
- Proforma sem reserva/movimento de stock e conversões rastreáveis;
- confirmação de Guia com uma única baixa e faturação posterior sem duplicação;
- imputações, liquidações parciais e adiantamentos;
- construção/validação de URL QR AGT e fallback da versão 4;
- adaptadores de DTO para os modelos imprimíveis.

A validação final executará `npm test`, `npm run typecheck` e `npm run build`. A aplicação Electron será aberta para verificar pré-visualização e impressão de cada documento, incluindo os casos de Guia sem valores e QR AGT de número longo.

## Fora do âmbito

- Integração com a API de registo eletrónico AGT e assinatura remota. O campo de hash existente continua preparado para essa futura ligação.
- Comunicação SAF-T e submissão fiscal automática.
- Reservas de stock por Proforma.
