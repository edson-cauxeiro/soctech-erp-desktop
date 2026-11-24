# 11. Glossário e problemas frequentes

## Palavras que o sistema usa

**Armazém** — o local físico onde o stock está. Uma empresa pode ter vários, com
papéis diferentes: um para compras, um para vendas, outros secundários.

**Artigo / SKU** — o produto ou serviço que se vende e compra. O *SKU* é o código que
o identifica. Um artigo do tipo *Serviço* não tem stock.

**Auditoria** — o registo de tudo o que se fez no sistema. Cada linha tem uma
impressão digital (*hash*) que prova que não foi alterada depois de gravada.

**Caixa** — uma conta de tesouraria do tipo dinheiro. Para receber ou pagar em
numerário é preciso ter uma sessão de caixa aberta.

**Diário / Rubrica** — no recibo, a rubrica é uma linha de vencimento ou desconto
(salário base, subsídio de alimentação, INSS, IRT, faltas). O conjunto das rubricas
configura-se em RH › Configuração.

**Documento emitido / anulado** — um documento nunca se apaga. Emitido é um documento
válido; anulado é um documento que continua no sistema, marcado como sem efeito, para
que a numeração não tenha buracos.

**Exercício** — o ano fiscal da empresa. Sem um exercício criado e aberto, não se
emitem documentos.

**Fatura-recibo (FR)** — documento que serve de fatura e de recibo ao mesmo tempo:
dá baixa de stock e regista a entrada do dinheiro.

**Guia de entrega** — documento logístico que acompanha a mercadoria, sem valores
fiscais. Dá baixa de stock quando é confirmada e depois pode ser faturada.

**Hash / impressão digital** — uma sequência alfanumérica calculada a partir do
conteúdo de um ficheiro ou registo. Se o conteúdo mudar, o hash muda. Serve para
provar integridade.

**Intimação / penhora** — desconto obrigatório no salário, por decisão judicial. No
RH registra-se como um processo de dívida do tipo *Penhora*.

**Kwanza (Kz)** — a moeda base por omissão. Alguns ecrãs mostram o sufixo «(€)» por
razões históricas; o valor é sempre na moeda base da empresa.

**Lote** — o conjunto de um mesmo artigo produzido ou recebido na mesma altura, com a
sua validade. Só os artigos marcados com controlo de lote o exigem.

**PMP (preço médio ponderado)** — a forma como o sistema valoriza o stock: sempre que
entra mercadoria com um custo, o custo médio do artigo é recalculado.

**Perfil** — o conjunto de permissões de um utilizador, ou seja, que módulos pode ver
e que ações pode fazer. Configura-se em Configurações › Permissões.

**Período** — o mês de processamento salarial, de P01 a P12. Um período fechado já
não aceita processamentos.

**Proforma (FP)** — documento não fiscal, de proposta ou reserva. Não movimenta stock.

**SAF-T** — o ficheiro normalizado com que se entrega a informação fiscal à
administração tributária.

**Série** — a regra de numeração de um tipo de documento (FT, FR, NC, ND, FP, GR, RC).
Cada tipo tem a sua série e a sua sequência.

**Simulação** — um processamento salarial que corre os cálculos todos mas não grava
nada. Serve para conferir antes de comprometer.

**Sessão de caixa** — o turno de uma caixa, entre a abertura e o fecho. Tem fundo
inicial e arqueação final.

**Soft-delete / arquivar** — desativar ou arquivar em vez de apagar. O registo sai das
listagens normais mas mantém-se no sistema. É o comportamento por omissão em quase
todo o lado.

**Stock disponível** — a quantidade existente menos a reservada. É este número, e não
a quantidade total, que limita saídas e transferências.

**Tipo de ausência** — não é uma lista fixa: é um cadastro. Cada tipo diz se é
justificado, se desconta salário e se desconta subsídio de alimentação.

**Vencimento (processamento)** — o processamento salarial normal do mês.

## Problemas frequentes

| O que vê | O que se passa | O que fazer |
|---|---|---|
| «Não é possível emitir… série ativa … não encontrada» | Não existe série do tipo certo para a empresa | Configurações › Séries: registar uma série do tipo do documento |
| «Sem exercício criado e aberto» ou valores a zero nos documentos | Falta o exercício fiscal do ano | Configurações › Exercício: criar o ano e abrir |
| Um botão não aparece, ou um módulo não está na barra | O seu perfil não tem a permissão | Falar com o administrador; ver Configurações › Permissões |
| Os valores salariais aparecem ocultos | Falta a permissão `rh.salarios.ver` | É intencional; pedir a permissão ao administrador |
| «Stock insuficiente no armazém…» | O saldo não chega para a operação | Rececionar mercadoria ou escolher outro armazém |
| Não deixa receber dinheiro em caixa | Não há sessão de caixa aberta | Comercial › Abertura de Caixa |
| «Todas as caixas têm sessão aberta» | Todas as caixas estão ocupadas | Fechar uma sessão em Comercial |
| O processamento salarial recusa o período | O período está fechado ou já processado | RH › Configuração › Períodos: reabrir o período |
| Nenhuma linha na grelha de processamento | O contexto está incompleto ou a data-limite exclui tudo | Verificar ano, período e as datas de faltas e horas extra; usar `Alt+A` |
| O ficheiro SAF-T não é gerado | Há erros de validação | Fiscal › Gerar / validar: ler a lista de problemas e corrigir |
| «Utilizador ou senha incorretos» | Credenciais erradas | Confirmar maiúsculas; a reposição é feita pelo administrador |
| Não consigo anular uma fatura | Tem recibos imputados | Anular primeiro o recibo, e depois a fatura |

## Quando nada disto resolve

Antes de reportar, reúna três coisas: o ecrã onde estava, o que fez passo a passo e a
mensagem exata que apareceu (pode copiá-la; as notificações também ficam no registo de
auditoria). Com isso, a mensagem certa resolve quase tudo à primeira.

Para apoio técnico, contacte o suporte SOC TECHNO. Para problemas de permissões ou de
contas, fale com o administrador do sistema dentro da sua empresa.
