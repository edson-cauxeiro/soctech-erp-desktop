# 7. Comercial

O módulo chama-se **Comercial — CRM** e tem três grupos na faixa:

- **Pipeline** — **Oportunidade**, **Lead**
- **Atividades** — **Chamada**, **Reunião**, **Email** (os três abrem o mesmo
  formulário de atividade)
- **Caixa** — **Abertura de Caixa**

Uma advertência importante antes de mais: os formulários de **Lead**, **Oportunidade**
e **Atividade** existem e validam o que escreve, mas ainda não gravam nada na base de
dados. Preenchê-los não deixa registo. Sirva-se deles só quando a gravação for
implementada; até lá, use-os no máximo como rascunho de conversa. A única parte deste
módulo que funciona a sério, neste momento, é a **Abertura de Caixa**.

## Leads, oportunidades e atividades

### Lead

O formulário abre no separador **Dados do Lead**, com os campos de qualificação:
**Nome do contacto**, **Empresa**, **Email**, **Telefone**, **Fonte** (Website,
Referência, Campanha, Outbound ou Outro), **Estado** (`Novo`, `Contactado`,
`Qualificado`, `Descartado`) e **Responsável**. O separador **Notas & Observações**
guarda o histórico escrito do contacto.

### Oportunidade

No separador **Detalhes do Negócio** preenche-se o **Título da oportunidade**, o
**Cliente / Conta**, o **Valor estimado**, a **Probabilidade (%)**, a **Fase do
Pipeline** (`Qualificação`, `Proposta`, `Negociação`, `Fechada — Ganha`, `Fechada —
Perdida`), a **Data fecho prevista** e o **Vendedor responsável**. Em **Observações**
fica a estratégia e as notas internas.

### Atividade

O formulário **Registo de Atividade** cobre chamadas, reuniões, emails e tarefas, e
tem o **Tipo**, a **Data / Hora**, o **Estado** (`Agendada`, `Concluída`,
`Cancelada`), o **Cliente**, o **Responsável** e a **Descrição / Resumo**.

Como se verá, os três ecrãs partilham a mesma estrutura de duas colunas: à esquerda o
formulário, à direita o que já existir.

## Abertura de caixa

Aqui é que a caixa vive. Sem sessão aberta, não se registam faturas-recibo, recibos
nem lançamentos que passem por caixa.

### Abrir

1. No topo, três indicadores dizem-lhe onde está: **Caixas registadas**, **Sessões
   abertas** e **Caixas disponíveis**.
2. Em **Abrir Sessão de Caixa**, escolha a **Caixa a abrir**. Uma caixa que já tenha
   sessão aberta não aparece na lista; se todas estiverem ocupadas, o seletor diz
   «Todas as caixas têm sessão aberta».
3. Indique o **Fundo inicial** em kwanzas — o dinheiro que está na gaveta antes de
   qualquer movimento.
4. Carregue em **Abrir sessão**.

Se ainda não existir nenhuma caixa, o aviso é «Nenhuma conta do tipo caixa
registada.». Crie-a primeiro em **Finanças › Contas**, com o tipo Caixa.

### Acompanhar

O bloco **Sessões abertas agora** lista as sessões em curso, com o número, a
designação, a hora de abertura e a etiqueta `Aberta`. Clicar numa linha seleciona-a e
abre o painel **Arqueação**, que apura o movimento do turno:

- **Fundo inicial**
- **Entradas**
- **Saídas**
- **Saldo em caixa**

O botão **Actualizar** recalcula o apuramento.

### Fechar

1. No painel de arqueação, carregue em **Fechar caixa**.
2. No diálogo **Fechar sessão**, confirme o **Saldo esperado em caixa** e escreva o que
   contou: **Numerário contado (notas e moedas)**, **Multicaixa**, **Transferências /
   talões**. O **Total contado** e a **Diferença** atualizam-se enquanto escreve; a
   diferença aparece a verde quando é praticamente nula e a vermelho quando há desvio.
3. Use **Observações** para justificar o que se desviou.
4. Carregue em **Fechar sessão**. O botão só ativa depois de haver algum valor contado.

O fecho encerra a sessão e grava o apuramento final para auditoria.

### Histórico

A tabela **Histórico de sessões** mostra as trinta sessões mais recentes, com **Nº
Sessão**, **Caixa**, **Abertura**, **Fundo** e **Estado**. O estado de uma sessão
fechada depende do acerto: `Fechada` quando bate certo, `Dif. <valor>` quando há
diferença.
