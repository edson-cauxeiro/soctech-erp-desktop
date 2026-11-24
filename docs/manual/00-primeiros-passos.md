# 1. Primeiros passos

## Arrancar e entrar

Abra o SOC TECHNO pelo atalho habitual do sistema operativo. A janela abre no ecrã
de entrada, com o monograma «ST» e o pedido de credenciais.

Para entrar:

1. Em **Utilizador**, escreva o seu nome de utilizador. Não é o nome completo nem o
   email: é o *login* que o administrador lhe atribuiu.
2. Em **Senha**, escreva a palavra-passe. O botão com o ícone do olho, dentro do
   campo, mostra ou esconde o que escreveu.
3. Carregue em **Entrar no Sistema**. Enquanto o sistema verifica as credenciais, o
   botão passa a **A autenticar...** e o formulário fica bloqueado.

Se os dados estiverem corretos, aparece a mensagem «Autenticação efetuada com
sucesso!» com o seu nome, e entra na página Início. Se estiverem errados, aparece
«Erro na autenticação» com o motivo devolvido pelo sistema; o mais comum é «Utilizador
ou senha incorretos».

O formulário valida o que escreve antes de tentar entrar: o utilizador precisa de
pelo menos 3 caracteres e a senha de pelo menos 6. As mensagens aparecem por baixo
do campo, a vermelho.

A caixa **Manter a sessão iniciada** existe no formulário, mas ainda não tem efeito:
a sessão é sempre pedida de novo quando o sistema arranca. O mesmo se aplica ao link
**Esqueceu-se da senha?**, que apenas avisa que a reposição é feita pelo
administrador.

## A página Início

Depois de entrar, o sistema abre o **Painel Geral**. Tem dois elementos úteis:

- Grelha **Módulos Disponíveis**, com um cartão por módulo para que tenha acesso.
  Clicar num cartão abre o módulo. Os módulos a que não tem permissão simplesmente
  não aparecem.
- Aviso **Configuração da Empresa Pendente**, em amarelo, quando ainda não existe
  nenhuma empresa configurada. O aviso explica o que falta e, para administradores,
  inclui o botão **Configurar Empresa** que abre as Configurações.

## A moldura do ecrã

Todos os módulos partilham a mesma estrutura. Vale a pena conhecê-la uma vez, porque
o resto do manual refere-se a ela constantemente.

**Barra superior** (fundo escuro):

- À esquerda, o logótipo **SOC TECHNO**, que volta sempre ao Início.
- Ao lado, o nome da empresa da sessão e o ano.
- No centro, um campo «Pesquisar documentos, clientes, artigos…» com a indicação
  `⌘K`. O campo é apenas visual e a tecla não está associada a nada: a pesquisa
  faz-se dentro de cada ecrã, no campo próprio.
- À direita, os botões de interrogação (ajuda), sino (notificações) e a roda
  dentada das Configurações.
- No extremo direito, o menu do utilizador, com as iniciais, o nome e o perfil.

**Barra de módulos**, logo abaixo: **Início** seguido dos módulos a que tem acesso.

**Faixa (ribbon)**: por baixo da barra de módulos, dividida em grupos com nome
próprio («Documentos», «Registo», «Operações»…). Cada botão da faixa abre uma aba
dentro do módulo. O botão da aba ativa fica realçado. Módulos como Início,
Configurações e Relatórios não têm faixa.

**Cabeçalho de página**: o caminho de navegação (por exemplo «Vendas / Fatura») e o
título do ecrã.

**Barra de estado**: no fundo, indica «Ligado · Base de Dados PostgreSQL», o
utilizador da sessão, a versão e o ano.

## Mudar de módulo e de aba

Clique no nome do módulo na barra de topo. Dentro do módulo, use os botões da faixa
para trocar de aba; o nome da aba ativa aparece no cabeçalho, à direita do nome do
módulo. Também pode entrar diretamente num módulo pela grelha da página Início.

## Terminar a sessão

Abra o menu do utilizador (as iniciais, à direita) e escolha **Terminar Sessão**. O
sistema confirma com «Sessão terminada.» e volta ao ecrã de entrada. Se o seu perfil
for Administrador, o mesmo menu tem ainda **Configurações do Sistema**.

## Atalhos de teclado

Não há atalhos globais. O único ecrã com atalhos próprios é o de processamento
salarial, descrito no capítulo de Recursos Humanos:

| Tecla | Efeito |
|---|---|
| `Alt+A` | Actualizar a grelha de funcionários elegíveis |
| `Alt+P` | Processar, ou simular na aba Simulação |
| `F1` | Abrir a ajuda do ecrã de processamento |
| `Esc` | Cancelar e repor os parâmetros do processamento |

## Se algo não estiver onde espera

Duas causas explicam quase todos os ecrãs estranhos:

1. **Falta de permissão.** Os módulos, as abas e muitos botões só aparecem se o seu
   perfil os tiver. Se um colega vê um botão que não vê, não é avaria: é o perfil.
   Confirme com o administrador em Configurações › Permissões.
2. **Empresa por configurar.** Sem empresa, exercício e séries registados, os
   módulos recusam criar documentos. O aviso do Painel Geral e os banners amarelos
   dentro de cada módulo apontam para esta situação.
