# 3. Vendas

O módulo chama-se **Vendas — Registo & Documentos** e está dividido em sete abas.
A faixa tem três grupos:

- **Documentos** — **Fatura**, **Proforma**, **Guia**, **Recibo**, **Encomenda**
- **Registo** — **Clientes**, **Artigos**, **Tarifários**
- **Operações** — **Cobranças**, **Enviar**, **Imprimir**, **PDF**

Duas notas antes de começar. Os quatro botões do grupo **Operações** e o botão
**Tarifários** ainda não fazem nada: não têm ação associada. E a aba **Encomenda**
mostra um formulário completo, mas os dados preenchidos ficam só no registo técnico
da aplicação — ainda não são gravados. Para trabalho real, hoje, use proformas como
documento de intenção de venda.

## Clientes

### Criar um cliente

1. Abra a aba **Clientes** e carregue em **Novo Cliente**.
2. A ficha tem quatro separadores. Em **Identificação**: **Código**, **Nome /
   Designação**, **NIF**, **Tipo de Entidade** (`Empresa (Pessoa Coletiva)` ou
   `Particular (Pessoa Singular)`), **Estado** (`Ativo`, `Inativo`, `Bloqueado`) e
   **Regime de IVA** (`Regime Geral`, `Isento`, `Misto`).
3. Em **Morada & Contactos**: **Endereço Fiscal**, **Código Postal**, **Cidade**,
   **País**, **Telefone** e **Email**.
4. Em **Condições Comerciais**: **Condição de Pagamento** (pronto pagamento, 15, 30,
   60 ou 90 dias), **Método Preferido** (transferência, numerário, Multicaixa, TPA ou
   cheque), **Limite de Crédito** em Kz, **Desconto Padrão** em percentagem, **Moeda
   Base**, **Vendedor Responsável** e **Retenção na Fonte** em percentagem.
5. Use **Observações** para notas internas, se precisar.
6. Carregue em **Guardar Cliente**.

O sistema confirma com «Cliente cadastrado com sucesso!» ou «Cliente atualizado com
sucesso!».

O NIF é validado conforme o país escolhido. Para Portugal espera nove dígitos; para
Angola, dez dígitos ou o formato do BI; para outros países aceita letras, dígitos e
hífenes. Um NIF mal formado é recusado com a mensagem própria.

### A lista de clientes

Filtra por **Pesquisar por Código, Nome, NIF, Email...**, por tipo (`Todos os Tipos`)
e por estado (`Todos os Estados`). As colunas são **Código**, **Nome / Razão Social**,
**NIF**, **Tipo**, **País**, **Contactos**, **Limite Crédito** e **Estado**, com a
etiqueta `Ativo`, `Inativo` ou `Bloqueado`. Em **Ações** pode **Editar** ou
**Remover ou Inativar**.

Atenção a esta última: se o cliente já tiver faturas ou recibos emitidos, o sistema
não o apaga — marca-o como inativo e explica: «O cliente possui faturas ou recibos
emitidos e foi marcado como inativo.». Sem histórico, a remoção é definitiva. Os
códigos de cliente não se repetem.

## Artigos

### Criar um artigo

1. Abra a aba **Artigos** e carregue em **Novo Artigo**. A ficha tem quatro
   separadores.
2. **Identificação Geral**: **Código (SKU)**, **Descrição**, **Tipo de Artigo**
   (produto acabado, matéria-prima, produto intermédio, consumível ou serviço),
   **Unidade Base** (UN, KG, L, CX, M, M², M³), **Família / Categoria**, **Código de
   Barras (EAN)** e **Estado** (ativo, descontinuado, inativo).
3. **Comercial & Preços**: **Preço de Venda Base** e **Taxa de IVA (%)**. O valor por
   omissão da taxa é 23.
4. **Stock & Logística**: **Fator de Conversão**, **Armazém Padrão**, **Stock
   Mínimo**, **Stock Máximo**, **Ponto de Encomenda** e a caixa **Controlo por Lote /
   Validade**. Escolher um tipo de artigo «Serviço» desativa o controlo de
   inventário, e o próprio formulário avisa disso.
5. **Custeio & Produção**: **Preço de Custo Médio**, **Lista de Materiais (BOM)** e
   observações internas.
6. Carregue em **Guardar Artigo**.

O sistema confirma a operação e recusa SKU ou código de barras repetidos, indicando
qual o artigo que já os usa.

### A lista de artigos

Filtra por **Pesquisar por SKU, Descrição, EAN...**, tipo e estado. Colunas:
**Código (SKU)**, **Descrição**, **Tipo**, **Unidade**, **Preço Venda**, **IVA**,
**Custo Médio** e **Estado**. Aqui, como nos clientes, o botão **Remover ou Inativar**
respeita o histórico: um artigo com movimentos não é apagado, passa a inativo.

## Faturas, notas de débito e notas de crédito

A aba **Fatura** trata dos documentos fiscais. Tem dois modos: **Emitir Nova Fatura**
e **Histórico de Faturas**.

### Emitir

1. Em **Dados do Documento & Logística de Saída**, escolha o **Armazém de Expedição
   (Baixa de Stock)**, o **Tipo de Documento** — `Fatura (FT)`, `Fatura-Recibo (FR)`,
   `Nota de Crédito (NC)` ou `Nota de Débito (ND)` —, a **Série Fiscal** do tipo
   correspondente, a **Data de Emissão** (hoje por omissão), a **Data de Vencimento**
   (hoje mais 30 dias por omissão) e o **Estado de Pagamento** (pendente, pago,
   parcial ou vencido). Se indicar uma **Encomenda / PO de Origem**, fica registada a
   ligação.
2. Em **Dados Fiscais do Cliente**, escolha o **Selecionar Cliente**. O **NIF** e a
   **Morada Fiscal** aparecem preenchidos, a partir da ficha do cliente. Este é o
   retrato fiscal que fica gravado no documento.
3. Em **Artigos & Serviços a Faturar**, carregue em **Adicionar Artigo** e preencha,
   por linha, o artigo, a quantidade, o preço unitário, o desconto em percentagem e a
   taxa de IVA. A coluna **Stock no Armazém** mostra o que existe e assinala em
   vermelho as linhas sem stock suficiente.
4. Confirme os totais: **Subtotal Ilíquido**, **Total IVA** e **Total a Pagar**.
5. Carregue em **Emitir Fatura & Dar Baixa**.

Se alguma linha tiver IVA a 0%, aparece o campo **Motivo de Isenção de IVA**, que
passa a ser obrigatório. Sem ele, o sistema recusa com «Indique o motivo de isenção
de IVA para os itens isentos.».

Duas variantes mudam o formulário:

- **Fatura-Recibo (FR)** pede o **Meio de Pagamento** e a **Conta de Entrada**, e
  entra logo no estado pago.
- **Nota de Crédito (NC)** pede a **Fatura a Retificar** e o **Motivo da Nota de
  Crédito**. A NC não repõe stock automaticamente; o formulário avisa.

### O que acontece ao stock e ao dinheiro

Vale a pena perceber estas regras, porque são a origem da maior parte das dúvidas:

- Uma fatura normal (FT), uma fatura-recibo (FR) e uma nota de débito (ND) dão baixa
  de stock, uma linha física de cada vez, no armazém de expedição escolhido. Se não
  houver saldo suficiente, o sistema recusa com «Stock insuficiente no armazém …».
- Uma **nota de crédito não movimenta stock**, nem devolve as mercadorias ao armazém.
- Só a **fatura-recibo** e o **recibo** geram movimento de tesouraria. As faturas
  normais não; o dinheiro entra quando se emite o recibo.
- Se a conta de entrada for uma caixa, é preciso ter uma sessão de caixa aberta em
  **Comercial › Abertura de Caixa**; caso contrário o sistema avisa.

### Histórico, anulação e reimpressão

O **Histórico de Faturas** pesquisa por **Nº da Fatura, Cliente, NIF...** e mostra
**Nº Documento**, **Tipo**, **Data**, **Cliente**, **NIF**, **Total Líquido** e
**Estado** — dois estados, na verdade: o do documento (`EMITIDO` ou `ANULADO`) e o do
pagamento (`PAGO`, `PENDENTE`, `PARCAL`, `VENCIDO`).

Em cada linha:

- **Ver linhas do documento** abre o detalhe, com as linhas e os totais.
- **Pré-visualizar / Imprimir / PDF** abre a janela de visualização, com os botões
  **Imprimir** e **Exportar PDF**. O PDF é guardado na pasta de documentos do
  utilizador e o sistema diz onde.
- **Anular documento** pede um **Motivo** com pelo menos três caracteres. O documento
  passa a `ANULADO`, mas mantém-se para auditoria: nada é apagado. Anular não reverte
  stock nem tesouraria, e uma fatura com recibos imputados não pode ser anulada.

## Proformas

A proforma é um documento não fiscal. Não movimenta stock e serve para apresentar
uma proposta ou reservar condições.

1. Em **Nova Proforma**, escolha o **Cliente**, a **Série FP**, a **Data de Emissão**
   e a **Válida Até** (por omissão, quinze dias depois). Preencha as linhas como numa
   fatura.
2. Carregue em **Gravar Rascunho**. A proforma nasce em rascunho: «Proforma … criada
   como rascunho. Emita-a para reservar o número.».

No **Histórico de Proformas**, os estados são `Rascunho`, `Emitida`, `Convertida` e
`Anulada`, e as ações dependem do estado:

- **Emitir (reservar número FP)** — passa a emitida e consome numeração.
- **Converter em Guia de Entrega** ou **Converter em Fatura** — abre um diálogo que
  pede a **Série** de destino; na conversão em guia pede também o **Armazém de
  Expedição**, o **Local de Entrega** e o **Transportador**. A conversão em fatura
  gera o documento fiscal e a baixa de stock.
- **Anular proforma** — pede o motivo; o registo fica preservado.

## Guias de entrega

A guia é um documento logístico, sem valores fiscais. Serve para acompanhar a
mercadoria.

1. Em **Nova Guia**, escolha o **Cliente**, a **Série GR**, a **Data**, o **Armazém
   de Expedição**, e, se quiser, **Local de Entrega**, **Transportador** e
   **Encomenda de Origem**.
2. Nas linhas, indique o artigo, a quantidade e — para artigos sob controlo de lote —
   o **Lote**. Um artigo com controlo de lote exige lote, e o sistema recusa sem ele.
3. Carregue em **Gravar Rascunho**.

O rascunho não mexe no stock. A baixa só acontece ao confirmar:

- **Confirmar (baixa de stock)** — gera uma saída por linha física. A confirmação diz
  exatamente isso: «Guia … confirmada. Uma saída de stock foi gerada por linha
  física.».
- **Faturar guia** — pede a **Série da Fatura** e emite a fatura correspondente, sem
  repetir a saída de stock.
- **Anular guia** — numa guia confirmada, gera as entradas de reversão, com registo
  de auditoria. Uma guia já faturada não pode ser anulada.

Os estados são `Rascunho`, `Confirmada`, `Faturada` e `Anulada`.

## Recibos

O recibo regista a entrada de dinheiro e imputa-o às faturas em aberto. O que não for
imputado fica como adiantamento do cliente.

1. Em **Novo Recibo**, escolha o **Cliente**, a **Série RC**, a **Data**, escreva o
   **Valor Recebido**, o **Meio de Pagamento** e a **Conta de Entrada** — com o aviso
   «Onde entrou o dinheiro?». Se houver retenção na fonte, indique a percentagem.
2. Em **Imputação a Faturas**, carregue em **Adicionar Fatura** e escolha a fatura e o
   valor a imputar, sem ultrapassar o saldo de cada uma. Pode não imputar nada, se
   quiser emitir o recibo como adiantamento puro.
3. Confirme os totais **Total recebido**, **Total imputado** e **Adiantamento**.
4. Carregue em **Emitir Recibo**.

Se ficar adiantamento, o histórico mostra o botão **Imputar a faturas** na linha, para
o aplicar mais tarde. Anular um recibo repõe o saldo das faturas e estorna o
movimento de tesouraria; o registo mantém-se, como sempre.

## Referência rápida dos documentos

| Documento | Série | Move stock | Move tesouraria | Estados |
|---|---|---|---|---|
| Fatura (FT) | FT | Sim, na emissão | Não | `EMITIDO` / `ANULADO` |
| Fatura-Recibo (FR) | FR | Sim, na emissão | Sim, entrada | `EMITIDO` / `ANULADO` |
| Nota de Crédito (NC) | NC | Não | Não | `EMITIDO` / `ANULADO` |
| Nota de Débito (ND) | ND | Sim, na emissão | Não | `EMITIDO` / `ANULADO` |
| Proforma (FP) | FP | Não | Não | `Rascunho`, `Emitida`, `Convertida`, `Anulada` |
| Guia de Entrega (GR) | GR | Sim, ao confirmar | Não | `Rascunho`, `Confirmada`, `Faturada`, `Anulada` |
| Recibo (RC) | RC | Não | Sim, entrada | `Emitido` / `Anulado` |

## Como se calcula o que o cliente paga

Por linha, a base é quantidade × preço × (1 − desconto). O IVA é a base vezes a taxa.
O total da linha é a soma das duas coisas. O documento soma as bases em **Subtotal
Ilíquido**, os impostos em **Total IVA** e apresenta a soma em **Total a Pagar**. O
resumo de IVA do documento agrupa por taxa e por motivo de isenção, que é o que o
contabilista precisa para o apuramento.

Os valores são gravados com quatro casas decimais por dentro e apresentados
arredondados. Note que algumas colunas deste módulo mostram o sufixo «(€)»; o valor
introduzido é sempre na moeda base da empresa, o kwanza.
