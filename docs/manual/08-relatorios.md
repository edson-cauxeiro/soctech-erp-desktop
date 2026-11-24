# 9. Relatórios

O módulo chama-se **Relatórios — Painel Analítico** e é uma página única, sem abas. A
faixa tem o grupo **Painel**, com o botão **Actualizar**, e o grupo **Exportar
Rápido**, com **CSV Vendas**, **Excel Vendas** e **PDF Vendas** — este último grupo só
aparece a quem tenha permissão de escrita no módulo.

## Escolher o período

Quase tudo neste ecrã depende do intervalo de datas. No cabeçalho **Filtro de Período
& Exportação** tem atalhos — **Este mês**, **Mês anterior**, **Este ano**, **Ano
anterior**, **Últimos 30 dias** — e dois campos, **De** e **Até**, para o intervalo à
medida. Escrever as datas à mão desliga o atalho que estivesse escolhido; o botão
**Recarregar** volta a calcular tudo.

Quando não há documentos no período, o ecrã di-lo com franqueza — «Sem documentos no
período escolhido (… a …). Os números abaixo são zero.» — e mostra as tabelas vazias.

Há ainda um filtro próprio para a tabela de clientes: **Todos os Clientes**,
**Apenas com Saldo Devedor** ou um cliente em concreto.

## Indicadores

Quatro cartões resumem o período:

- **Vendas do Período** — valor líquido, com a nota de quantas notas de crédito foram
  descontadas e quantos documentos foram emitidos.
- **Resultado Operacional** — vendas líquidas menos compras.
- **Margem Bruta** — em percentagem, com o valor absoluto por baixo.
- **IVA Liquidado** — o imposto apurado no período, com o número de clientes atendidos.

## Tabelas

**Vendas por Mês** — por mês do período, o **Total Faturado** e o **Líquido**. A
coluna **Notas de Crédito** existe mas ainda vem sempre a zero: a subtração das NC
ainda não está ligada.

**Fluxo de Tesouraria por Mês** — entradas, saídas e saldo líquido por mês.

**Artigos Mais Vendidos** — os artigos com mais quantidade vendida, com o total e a
percentagem que representam do negócio.

**Clientes Principais** — por cliente, o número de faturas, o total faturado e o que
está em dívida. É aqui que o filtro de clientes atua.

**IVA Liquidado por Taxa** — por taxa de IVA, a incidência (base), o montante do
imposto e o total. É o quadro de apoio ao apuramento fiscal.

**Artigos com Stock Baixo** — os artigos abaixo do ponto de encomenda, com o stock
atual, o mínimo e a sugestão de encomenda.

## Relatórios de Recursos Humanos

Um bloco separado reúne o que se apurou no processamento salarial:

- **Folha de Vencimentos** — por funcionário, cargo, salário base, horas extra, faltas,
  INSS, IRT, outras deduções, total de deduções e líquido, com o mês e o ano.
- **Resumo IRT** — total sujeito e total de imposto, com o detalhe por escalão.
- **Resumo INSS** — total de remunerações, contribuição da empresa, contribuição do
  funcionário e total, com o detalhe por faixa.
- **Mapa de Férias** — por funcionário, o direito do ano, o que está marcado, o que já
  foi gozado, o saldo e a situação do subsídio de férias.
- **Mapa de Ausências** — por funcionário, tipo, datas, dias, horas, estado e
  justificação.
- **Dívidas em Aberto** — por funcionário, o valor original, o já pago, o saldo e a
  próxima prestação.
- **Custo por Departamento** — por departamento, número de funcionários, salários,
  INSS, IRT, férias, subsídio de natal, outros e o total, com a média por funcionário.

Estas tabelas usam o período escolhido no cabeçalho, como as restantes.

## Exportar

Cada tabela tem a sua linha de exportação, com os botões **CSV**, **XLS** e **PDF**.
Os relatórios exportáveis são catorze: vendas por mês, fluxo de tesouraria, artigos
mais vendidos, clientes principais, stock baixo, valorização de stock, IVA por taxa,
folha de vencimentos, resumo IRT, resumo INSS, mapa de férias, mapa de ausências,
dívidas em aberto e custo por departamento.

Ao exportar, o sistema confirma com «Relatório exportado com sucesso para … (N
linhas).», indicando onde ficou o ficheiro. O grupo **Exportar Rápido** da faixa faz o
mesmo, mas apenas para o relatório de vendas e sem escolher destino.
