# 4. Compras

O módulo chama-se **Compras & Logística de Entrada** e tem duas abas, cada uma com o
seu grupo na faixa: **Gestão de Compras & Receção** (grupo «Operações de Compra») e
**Fornecedores** (grupo «Registo»).

A ordem natural de trabalho é: abrir a encomenda ao fornecedor, receber a mercadoria
quando ela chega, e registar a fatura do fornecedor quando ela é recebida.

## Fornecedores

### Criar um fornecedor

1. Abra **Fornecedores** e carregue em **Novo Fornecedor**.
2. A ficha tem três separadores. Em **Identificação**: **Código**, **Razão Social /
   Nome**, **NIF** e **Estado** (`Ativo` ou `Bloqueado`).
3. Em **Contactos & Morada**: **Endereço / Sede**, **Telefone** e **Email**.
4. Em **Condições Comerciais**: **Condição de Pagamento** (pronto pagamento, 15, 30,
   60 ou 90 dias), **IBAN / Conta Bancária**, **Prazo Médio de Entrega (dias)** e
   **Retenção na Fonte (%)**.
5. Carregue em **Guardar Fornecedor**.

### A lista

Pesquisa por **Código, Nome, NIF, IBAN...**, com filtro de estado (`Ativos` ou
`Bloqueados`). As colunas são **Código**, **Razão Social / Nome**, **NIF**,
**Contactos**, **IBAN**, **Prazo Entrega** e **Estado**. Em cada linha pode editar ou
remover.

## Encomendas a fornecedor

1. Na aba **Gestão de Compras & Receção**, escolha o separador **Encomendas a
   Fornecedor**.
2. Carregue em **Nova Encomenda**.
3. Indique o **Fornecedor** e o **Armazém Destino Previsto**, que é onde a mercadoria
   deve entrar quando chegar.
4. Em **Linhas da Encomenda**, carregue em **Adicionar Linha** e preencha, por linha,
   o artigo, a quantidade e o preço acordado.
5. Carregue em **Emitir Encomenda**.

A lista mostra **Nº Encomenda**, **Data**, **Fornecedor**, **Armazém Destino**,
**Total Líquido** e **Estado**. Os estados são `aberta`, `parcial`, `recebida` e
`cancelada`, e evoluem sozinhos à medida que as receções vão sendo registadas: uma
encomenda passa a `parcial` quando é recebida em parte e a `recebida` quando a
quantidade está completa.

## Receção de mercadorias

É aqui que o stock entra pela primeira vez, e é também onde o custo médio do artigo é
recalculado.

1. No separador **Guias de Receção (Entrada de Stock)**, carregue em **Rececionar
   Mercadoria**.
2. Escolha o **Fornecedor** e o **Armazém de Destino (Entrada de Stock)**.
3. Em **Artigos Rececionados**, carregue em **Adicionar Artigo** e indique, por
   linha, o artigo, a quantidade, o **Custo Unit.** e o lote, quando o artigo o exige.
4. Carregue em **Confirmar Receção & Dar Entrada de Stock**.

O sistema cria um movimento de entrada por linha e recalcula o preço de custo médio
dos artigos. A lista de guias mostra **Nº Guia**, **Data Receção**, **Armazém
Destino**, **Encomenda Origem** (ou `Receção Direta`, quando não vem de encomenda),
**Itens Recebidos**, **Conformidade** (`conforme` ou `divergente`) e o **Estado**, que
aparece como `Stock Entrado`.

Receções diretas são legítimas: nem toda a mercadoria chega precedida de encomenda.

## Faturas de compra

O registo da fatura do fornecedor é um documento financeiro. Não movimenta stock — o
stock já entrou na receção.

1. No separador **Faturas de Compra**, carregue em **Registar Fatura Fornecedor**.
2. Preencha o **Fornecedor**, o **Nº Fatura Fornecedor** (o número que vem no papel
   do fornecedor), a **Data Emissão** e a **Data Vencimento**.
3. Em **Itens da Fatura**, carregue em **Adicionar Item** e indique artigo,
   quantidade e preço unitário.
4. Carregue em **Guardar Fatura de Compra**.

A lista mostra **Nº Interno**, **Nº Fornecedor**, **Fornecedor**, **Emissão**,
**Vencimento**, **Total** e **Pagamento**, com os estados `pago`, `pendente`,
`parcial` e `vencido`. A fatura nasce `pendente`.

## O que pesa no custo

O sistema trabalha com **preço de custo médio ponderado** (PMP). Sempre que entra
mercadoria com um custo unitário indicado, o custo médio do artigo é recalculado
juntando o que já existia ao que acabou de entrar. Não existe conceito separado de
«último custo»: o que conta é sempre a média.

O custo médio é o valor usado na valorização do inventário em **Stock › Estado de
Stock** e nas contas de valorização dos relatórios.
