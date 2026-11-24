# 6. Finanças

O módulo chama-se **Finanças — Tesouraria** e abre na aba **Contas**. Tem três abas:
**Contas** e **Reconciliação**, no grupo «Bancos», e **Lançamentos**, no grupo
«Tesouraria».

O módulo trata de duas coisas: as contas onde o dinheiro está (bancos e caixas) e os
movimentos que o fazem entrar e sair.

## Contas

### Criar uma conta

1. Na aba **Contas**, carregue em **Nova conta**.
2. Preencha o **Código** (por exemplo `BANC-01`) e a **Designação**.
3. Escolha o **Tipo**: **Banco** ou **Caixa**. A escolha muda o resto do formulário:
   no tipo Banco aparecem **Banco**, **IBAN / Nº de conta** e **SWIFT / BIC**.
4. Escolha a **Moeda** (AOA, EUR ou USD) e indique o **Saldo inicial**. O saldo
   inicial só se define na criação; depois disso, qualquer correção faz-se por
   lançamento.
5. Deixe a caixa **Conta activa** marcada. A descrição do campo explica o resto:
   «Inactiva impede novos movimentos, sem perder o histórico.».
6. Carregue em **Criar conta**.

### A lista

No topo, três cartões de resumo — **Bancos**, **Caixas** e **Tesouraria total** —
aparecem quando já existem contas. Os filtros são a pesquisa (**Código, designação ou
IBAN**), o tipo (`Todos`, ou filtrado por Banco ou Caixa) e a caixa **Só activas**, que
vem marcada.

As colunas são **Conta**, **Tipo**, **IBAN / SWIFT**, **Saldo inicial**, **Saldo
actual** e **Ações**. O tipo aparece como etiqueta `Caixa` ou `Banco`, e as contas
desativadas levam a etiqueta `Inactiva`. Em cada linha pode **Editar conta** — onde o
código fica fixo e o saldo inicial passa a leitura — e **Desactivar** ou **Reactivar**.

## Lançamentos

Um lançamento é uma entrada, uma saída ou uma transferência entre contas. O formulário
avisa que o caminho normal é deixar o documento originador criá-lo sozinho; o
lançamento manual serve para o que não tem documento, como uma conferência de fundo ou
um recebimento avulso.

1. Na aba **Lançamentos**, carregue em **Novo lançamento**.
2. Preencha a **Data**, escolha o **Tipo** (`Entrada`, `Saída`, `Transferência` ou
   `Ajuste`) e escreva o **Valor**.
3. Conforme o tipo, indique a **Conta de origem** («De onde sai o dinheiro»), a
   **Conta de destino** («Onde entra o dinheiro») ou ambas. Num **Ajuste**, os dois
   campos mudam de nome: **Conta a corrigir (retirar dinheiro)** e **Conta a corrigir
   (acrescentar dinheiro)**.
4. Se o dinheiro mexer numa caixa, escolha o **Meio de pagamento** (numerário,
   Multicaixa, cheque ou transferência). Numa caixa sem sessão aberta, o sistema avisa
   e pede que a abra em **Finanças › Contas**.
5. Preencha a **Descrição** — obrigatória nos ajustes, com o exemplo «recebimento de
   cliente sem documento; conferência de fundo». Pode ainda guardar a **Observação do
   extracto** do banco.
6. Carregue em **Registar lançamento**.

Regras por tipo: uma entrada exige conta de destino, uma saída exige conta de origem,
uma transferência exige duas contas diferentes e um ajuste exige descrição.

### Acompanhar e corrigir

No topo, três indicadores: **Entradas**, **Saídas** e **Resultado do período**, com
contagens por confirmar e por conciliar.

A lista filtra por pesquisa (**Número, descrição ou documento**), conta, tipo e
situação de conciliação (`Conciliados` ou `Por conciliar`). As colunas são **Nº**,
**Data**, **Tipo**, **Conta**, **Descrição**, **Valor**, **Estado** e **Ações**.

Os lançamentos nascem `pendente` e a vida de cada um passa por três passos:

1. **Confirmar** — o lançamento passa a `confirmado` e conta para os saldos.
2. **Conciliar com o extracto** — liga o lançamento ao movimento do banco. Aparece a
   etiqueta `Conciliado`. Se se enganar, **Voltar a pendente** desfaz a conciliação.
3. **Estornar** — para um erro que já foi confirmado. Pede o **Motivo do estorno**
   (pelo menos três caracteres) e cria o lançamento inverso; o original fica marcado
   `Estornado` e não se apaga.

Nada se elimina neste módulo. Corrige-se com estornos, e é assim que fica rasto do que
aconteceu.

## Reconciliação

A reconciliação é feita em lote, contra o extracto do banco.

1. Escolha a **Conta a conciliar**. Sem conta escolhida, o ecrã apenas pede que a
   escolha.
2. Ajuste a **Data da conciliação** (hoje por omissão) e, se precisar, pesquise por
   **Número, descrição ou documento**.
3. Veja os indicadores: **Saldo do ERP**, **Conciliados** (quantos de quantos),
   **Por conciliar** e **Total dos por conciliar**.
4. Marque as linhas que batem certo com o extracto, linha a linha ou com **Selecionar
   todos**. O cabeçalho da lista mostra quantos selecionou e que valor representam.
5. Carregue em **Conciliar selecionados**.

O ecrã só mostra movimentos do tipo confirmado que ainda não estejam conciliados. Se
se enganou numa linha, o botão **Desfazer conciliação** devolve-a à lista. Quando a
lista fica vazia, o ecrã diz o que isso significa: «Nada por conciliar nesta conta. O
extracto bate certo com o ERP.».

## Abertura e fecho de caixa

Não estão aqui. A sessão de caixa abre-se e fecha-se no módulo **Comercial**, na aba
**Abertura de Caixa** — ver o capítulo 7. Só depois de haver sessão aberta é que as
faturas-recibo, os recibos e os lançamentos que passam por caixa podem ser registados.
