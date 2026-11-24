# 5. Stock

O módulo chama-se **Stock & Gestão Multi-Armazém** e abre na aba **Movimentos**. A
faixa tem três grupos:

- **Movimentos & Inventário** — **Movimentos**, **Transferência**, **Inventário**,
  **Stock por Localização**, **Estrutura do Armazém**
- **Registo** — **Artigos**, **Armazéns**, **Lotes & Validades**
- **Análise & Alertas** — **Estado de Stock**

A aba **Artigos** é a mesma do módulo de Vendas e está descrita no capítulo 3. Aqui
trata-se de tudo o resto.

## Duas ideias que valem por metade do módulo

Primeira: **o saldo vive por artigo, armazém, localização e lote**. O que interessa
não é uma quantidade abstrata, é quanto há em cada sítio. O «disponível» é a
quantidade menos a quantidade reservada.

Segunda: **toda a alteração de stock deixa um movimento**. Não há forma de mexer numa
quantidade sem que fique registado quem, quando, de onde e para onde. É essa a razão
de existirem tantos ecrãs: cada um é uma porta de entrada diferente para o mesmo
livro de movimentos.

## Armazéns

### A lista e os dois armazéns fixos

A lista é antecedida por dois cartões, **ARM-01 Armazém Geral** e **ARM-02 Armazém de
Vendas**, com os papéis «Padrão de Compras & Entradas» e «Padrão de Vendas & PDV
(Baixas)». Estes dois armazéns são criados automaticamente e não podem ser removidos
nem desativados.

Filtra por **Pesquisar por Código, Designação, Localização...**, por tipo
(`Matéria-prima`, `Produto acabado`, `Produção`, `Devoluções`) e por estado. As
colunas são **Código**, **Designação**, **Tipo**, **Finalidade**, **Papel**,
**Localização**, **Endereço**, **Estado** e **Ações**, com as etiquetas `Padrão
Compras`, `Padrão Vendas` e `Secundário`.

### Criar ou editar um armazém

O formulário pede **Código do Armazém**, **Designação**, **Tipo de Armazém** e
**Localização / Endereço Físico**. Em **Papéis**, três caixas decidem o
comportamento do armazém no resto do sistema:

- **Armazém Padrão de Vendas (Default PDV)** — é o que as faturas propõem como
  armazém de expedição.
- **Armazém Padrão de Compras (Receções)** — é o que as receções propõem como destino.
- **Armazém Ativo para Operações** — desligar esta caixa impede novas operações no
  armazém, sem perder o histórico.

Cada linha tem ainda **Ver Stock**, que abre o stock do armazém com **SKU**,
**Descrição**, **Unidade**, **Qtd. em Armazém**, **PMP** e **Total**, antecedido de
três indicadores: linhas com stock, valorização total e localização.

## Estrutura do armazém

O endereço físico de cada coisa é uma árvore de quatro níveis: **Armazém → Área →
Zona → Localização**. Existe para que o picking e a contagem se façam por referência
física, e não por memória.

1. Escolha o armazém no seletor **Escolha o armazém...**.
2. Carregue em **Nova Área** e preencha **Código da Área**, **Designação**, **Tipo**
   (texto livre) e **Descrição**.
3. Dentro da área, o botão **Nova zona nesta área** abre o formulário de **Zona**:
   **Código da Zona**, **Designação**, **Descrição** e as caixas **Zona de alta
   rotação** e **Temperatura controlada**.
4. Dentro da zona, **Nova localização nesta zona** abre o formulário de
   **Localização**, o mais detalhado dos três. Além do **Código**, **Tipo**
   (estrutura, prateleira, nível, posição, palete ou contentor) e **Designação**,
   permite definir **Capacidade** — quantidade em unidades, peso em kg e volume em m³,
   deixando em branco o que não tiver limite — e marcar a localização como **Elegível
   para picking** e/ou **Elegível para putaway**.
5. Também pode criar **sub-localizações** dentro de uma localização.

As ações de linha são **Editar**, criar o nível seguinte, **Ver capacidade**, **Ver
estado operacional** e **Desactivar**. Desativar é sempre lógico: áreas e zonas com
filhos ativos não se desativam, e nada é apagado.

## Movimentos de stock

### Registar um movimento

1. Na aba **Movimentos**, carregue em **Novo Movimento**.
2. Escolha o **Tipo de Movimento**: **Entrada Manual (Geral / Compras)**, **Saída
   Manual / Baixa** ou **Ajuste Manual de Inventário**. A escolha determina os campos
   seguintes.
3. Indique o **Artigo** e a **Quantidade (UN)**.
4. Conforme o tipo: numa saída, escolha o **Armazém de Origem** (o formulário mostra o
   saldo disponível); numa entrada, o **Armazém de Destino**; num ajuste, ambos.
5. Se o artigo exigir, indique o **Lote / Nº de Série**.
6. O **Documento de Origem** vem preenchido com `AJUSTE-MANUAL`, e é editável — use-o
   para ligar o movimento ao papel que o justifica.
7. Numa entrada, o **Custo Unitário** atualiza o preço de custo médio do artigo.
8. Carregue em **Confirmar Movimento**. O botão **Limpar** repõe o formulário.

### A lista de movimentos

Filtra por pesquisa (**Pesquisar por Nº, Artigo, Lote, Documento...**), tipo, armazém
e intervalo de datas. As colunas são **Nº Movimento**, **Data**, **Hora**, **Tipo**,
**Artigo**, **Qtd.**, **Origem**, **Destino**, **Lote**, **Doc. Origem** e **Custo**.
O tipo aparece como `Entrada`, `Saída` ou `Ajuste / Inventário`. O ícone do olho, em
cada linha, abre o **Detalhe do Movimento**.

Por baixo do que o ecrã mostra, o sistema conhece ainda outros tipos de movimento,
criados por outros fluxos e não por este formulário: `transferencia`, `devolucao`,
`consumo_producao`, `quarentena` e `liberacao`.

## Transferência entre armazéns

A transferência faz-se com um assistente de cinco passos, sempre na mesma ordem:
**Produto → Origem → Quantidade → Destino → Confirmar**. Em baixo do título aparece
«Passo N de 5». Ande com **Seguinte** e **Anterior**.

1. **Produto** — procure o artigo em **Procurar produto...**.
2. **Origem** — escolha o armazém que cede o stock; o saldo disponível aparece ao lado.
3. **Quantidade** — indique quanto sai e, se o artigo tiver controlo de lote, o lote.
   Se pedir mais do que existe, o assistente avisa.
4. **Destino** — escolha o armazém que recebe.
5. **Confirmar** — reveja o resumo (artigo, origem, quantidade, lote, destino) e
   carregue em **Confirmar Transferência**.

O débito na origem e o crédito no destino acontecem na mesma operação. Não existe
passo de receção separado, nem estado intermédio: a transferência está feita ou não
está. Em baixo aparecem as dez últimas transferências, com número, data, artigo,
quantidade e o par origem → destino.

## Inventário físico

O inventário compara o que o sistema diz com o que existe na prateleira e regulariza
a diferença.

1. Na aba **Inventário**, carregue em **Nova Contagem**.
2. Escolha o **Armazém** (obrigatório), o **Responsável** e, se quiser, **Observações**.
3. Em **Artigos a Contar**, use **Carregar Todo o Catálogo** para trazer todos os
   artigos ou **Adicionar Linha** para contar só alguns. Em cada linha indique a
   **Qtd. Contada** e o lote, quando aplicável.
4. Carregue em **Guardar Folha de Contagem**. A contagem fica `Em Curso`.

A lista mostra **Nº Inventário**, **Data**, **Armazém**, **Responsável**, **Itens
Contados** e **Estado** (`Em Curso` ou `Fechado & Reconciliado`). O botão **Ver Linhas
& Reconciliar** abre o detalhe, com **Qtd. Sistema**, **Qtd. Contada**, **Diferença** e
**Impacto** por linha — `Sem divergência`, `Sobra (Entrada Ajuste)` ou `Falta (Saída
Ajuste)`.

Quando a contagem estiver fechada, carregue em **Fechar & Reconciliar Stock**. O
sistema cria um movimento de ajuste por cada linha com diferença, positivo para as
sobras e negativo para as faltas, com a referência `INV` e o número do inventário. Uma
contagem não se fecha duas vezes.

## Lotes e validades

### Criar um lote

1. Na aba **Lotes & Validades**, carregue em **Novo Lote**.
2. Indique o **Produto** e o **Nº de Lote** — o número é único por artigo. Ao editar
   um lote existente, o produto não se altera.
3. Preencha **Data de Fabrico**, **Data de Validade**, **Preço de Custo** e
   **Fornecedor** (a opção vazia é `Sem fornecedor`).
4. Carregue em **Guardar**.

### Estados de validade

A lista classifica cada lote sozinha, com base na data de validade e na antecedência
configurada na empresa:

| Estado | Significado |
|---|---|
| Válido | Ainda longe do fim |
| A caducar | Entra na janela de alerta antes da validade |
| Caducado | A validade já passou |
| Sem validade | O lote não tem data de validade registada |

Filtre por produto, por pesquisa (**Nº de lote, código ou descrição...**) ou pelo
estado de validade. As colunas são **Nº de Lote**, **Produto**, **Fornecedor**,
**Fabrico**, **Validade**, **Estado**, **Custo** e **Ações**. Um lote com stock não
pode ser eliminado.

## Estado de stock e alertas

Este é o ecrã de vigilância. No topo, seis indicadores: **Ruturas de Stock (Saldo Zero
ou Negativo)**, **Abaixo do Stock Mínimo**, **Lotes Caducados**, **Lotes a Caducar**,
**Dentro dos Parâmetros** e **Valor de Inventário (Custo Médio)**.

A pesquisa é por código ou descrição, o seletor de situações filtra por `Rutura`,
`Stock baixo`, `A caducar` e `Caducado`, e o botão **Todos / Só alertas** esconde o que
está tudo bem.

As colunas são **Código (SKU)**, **Descrição do Artigo**, **Estado**, **Stock Atual**,
**Stock Mínimo**, **Ponto de Encomenda**, **Valor (Custo)**, **Situação** e
**Recomenda-se Reabastecer**.

A situação calcula-se assim:

- **Rutura** — saldo igual ou inferior a zero.
- **Stock Baixo** — saldo acima de zero mas igual ou inferior ao stock mínimo.
- **Caducado** e **A Caducar** — lidos dos lotes. Quando um artigo tem lotes nestas
  condições, a situação do lote prevalece sobre a do stock.
- **Normal** — tudo dentro dos parâmetros.

A coluna **Recomenda-se Reabastecer** sugere uma quantidade a encomendar: o ponto de
encomenda menos o stock atual, nunca abaixo de zero. O stock máximo está definido na
ficha do artigo mas não entra nesta conta.

## Estado de stock por localização

O ecrã **Stock por Localização** diz exatamente onde está cada coisa, sem mexer em
nada. Tem filtros em cascata — armazém, área, zona e localização — mais pesquisa por
**Nº de lote...**, estado (`Disponível`, `Quarentena`, `Bloqueado`, `Esgotado`) e
produto. **Limpar filtros** repõe tudo.

As colunas são **Produto**, **Armazém**, **Endereço (Área / Zona / Localização)**,
**Lote**, **Estado**, **Qtd.**, **Reservada**, **Disponível** e **Valor**. A listagem
tem cinquenta linhas por página, com **Anterior** e **Seguinte**.

## O que o sistema não deixa fazer

Vale a pena conhecer os bloqueios, para não perder tempo a tentar:

- Saídas, transferências e consumos que deixariam o saldo negativo são recusados.
- Artigos do tipo **Serviço** não movimentam stock, por definição.
- Artigos com controlo de lote exigem lote em entradas, saídas e transferências. A
  única exceção são os ajustes de inventário.
- Um armazém sem sessão ativa não aceita novas operações.
