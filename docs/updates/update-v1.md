# Plano: retificação e atualização

## 1. Objetivo

Alterar alguns comportamentos e redesign de telas do nosso sistema.

## 1.1 Modulo de Vendas
 - Os formularios do modulo de venda devem ter o mesmo design (tamanho) que os formularios do modulo de finanças, para o melhor enquadramento dos campos.
 - Os campos selectsearch e selects as suas listas de opções devem ser flutuantes.

### Fatura
- O campo select de estado de pagamento deve ser retirado, esta a fazer sentido uma vez que o cliente já estas opções no seu cadastro.
- Deve ser torcado o simbolo de euro que esta na pagina de fatura (subtotal, iva e total a pagar) pelo kz (kwanza).

### Proforma
- No documento de proforma deve ter uma observação escrita alertando que "Os Preços dos Artigos Poderá Sofrer Alterações Conforme o Cambio do Dia.!".

### Recibo
- O campo de retenção deve ser retirado da pagina de recibo.

### Encomendas
- A pagina de encomenda fica unitilisavel para nós, uma vez que já temos paginas de preforma e guias que farão o trabalho identico, explica para mim a necessidade dela antes de eu decidir remover por completo.


## 1.2 Modulo de Compras
- Os formularios do modulo de compras devem ter o mesmo design (tamanho) que os formularios do modulo de finanças, para o melhor enquadramento dos campos.
- Os campos selectsearch e selects as suas listas de opções devem ser flutuantes.

### Fornecedor
- Deve ser removido o campo "retenção na fonte" do formulario de Novo fornecedor, pós não faz sentido telo ai.


## 1.3 Modulo de Finanças

### Relatorios
- A pagina de relatorios apresenta um erro de "Falha de comunicação com o processo principal" verifique o porquê e corrija.

### Demonstração Financeira
- A pagina de demostração financeira não apresenta nenhuma informação, verifique o porquê e corrija.

### Lançamento Contabilistico
- A o formulario de novo lançamento contabilistico esta funcional como deveria, ao adicionar linha o searchselect não me deixar escolher nunhuma opção, pode também remover as duas linhas já existente quando abrimos o formulario.



## 1.4 Modulo de Stock

### Transferencia
- A pagina de transferencia apresenta um erro de Errro de "invalid prisma query" ao finalizarmos uma transferencia de artigo, verifique a causa e corrija.

### Estado de Stock
- Na pagina de estado de stock os cards não apresentação a informação correta do estado dos produtos/artigos, certifique que estes cards recebam informação correta.



## 1.5 Modulo Comercial

### Abertura de Caixa
- A pagina de abertura de caixa quando clicamos numa das sessões de caixa card de Arqueação da sessão fica em loop infinito e não apresenta nenhuma informação, o que também não nos permite fazer o fecho da sessão, verifique a causa e corrija.

