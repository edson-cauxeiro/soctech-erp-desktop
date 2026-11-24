# Manual de utilização — SOC TECHNO

Este manual explica como se trabalha no dia a dia com o SOC TECHNO. Está escrito
para quem usa o sistema e não para quem o programa: descreve o que se faz em cada
ecrã, que campos se preenchem e o que acontece depois de se carregar em Guardar.

A versão de referência é a 1.0.0. Se a etiqueta de um botão no seu computador não
coincidir com a deste manual, a aplicação mudou e o manual ainda não acompanhou —
nesse caso vale o que está no ecrã.

## O que é o sistema

O SOC TECHNO é uma aplicação de secretária (Electron) que corre no seu computador
e guarda os dados numa base de dados PostgreSQL acessível pela rede da empresa.
Cada empresa registada tem o seu identificador, as suas moedas, os seus módulos
contratados e a sua numeração de documentos. Um utilizador pertence sempre a uma
empresa, e é essa ligação que determina os dados que vê.

## Os módulos

A barra escura no topo do ecrã tem um separador por módulo. Só aparecem os módulos
para os quais o seu perfil tenha permissão de consulta.

| Módulo | Para que serve |
|---|---|
| Início | Página de entrada com atalhos para todos os módulos |
| Vendas | Clientes, artigos, encomendas, proformas, faturas, guias de entrega e recibos |
| Compras | Fornecedores, encomendas a fornecedor, receção de mercadorias e faturas de compra |
| Stock | Armazéns, estrutura física, movimentos, transferências, inventário, lotes e alertas |
| Finanças | Contas bancárias e caixas, lançamentos de tesouraria e reconciliação |
| Comercial | Leads, oportunidades, atividades e abertura e fecho de caixa |
| Recursos Humanos | Fichas de funcionários, contratos, ausências, férias, processamento salarial, recibos e pagamentos |
| Relatórios | Painel analítico com vendas, tesouraria, stock, IVA e indicadores de RH |
| Fiscal | Geração e validação do SAF-T, conformidade AGT e registo de auditoria |
| Configurações | Empresas, exercícios, séries, utilizadores, perfis e auditoria. Apenas administradores |

A entrada para Configurações não está na barra de módulos. É o ícone de roda
dentada, à direita, e o item «Configurações do Sistema» no menu do utilizador.
Ambos só funcionam para o perfil Administrador; qualquer outro perfil recebe um
aviso e fica onde estava.

## Como este manual está organizado

Cada capítulo corresponde a um módulo e está dividido em duas partes:

- **Tarefas** — o que se faz, passo a passo, com os nomes que aparecem no ecrã.
- **Referência do ecrã** — o que faz cada botão, campo e estado, para consulta rápida.

Os capítulos `00-primeiros-passos.md` e `01-configuracoes.md` devem ser lidos
primeiro: descrevem o arranque, a sessão de trabalho e a configuração sem a qual os
restantes módulos não conseguem emitir documentos.

## Convenções

- **Negrito** marca nomes de botões, separadores e campos, exatamente como
  aparecem na aplicação.
- *Itálico* marca valores que o sistema preenche sozinho ou que são explicados na
  própria frase.
- «Kz» é o kwanza, a moeda base por omissão. Alguns ecrãs mostram o sufixo «(€)» em
  colunas de valores por razões históricas; o valor introduzido é sempre na moeda
  base da empresa.
- Quando uma funcionalidade ainda não existe, este manual di-lo em vez de a
  descrever. Procure a menção «ainda não implementado» ou «sem efeito».

## Índice

1. [Primeiros passos](00-primeiros-passos.md) — arranque, entrada, sessão, navegação
2. [Configurações](01-configuracoes.md) — empresas, exercícios, séries, utilizadores, perfis, auditoria
3. [Vendas](02-vendas.md)
4. [Compras](03-compras.md)
5. [Stock](04-stock.md)
6. [Finanças](05-financas.md)
7. [Comercial](06-comercial.md)
8. [Recursos Humanos](07-rh.md)
9. [Relatórios](08-relatorios.md)
10. [Fiscal](09-fiscal.md)
11. [Glossário e problemas frequentes](99-glossario.md)

## Documentação técnica

Este manual não descreve a arquitetura, o modelo de dados nem os contratos entre
processos. Para isso existem, na pasta `docs/`:

- `especificacao_tecnica_erp.md` — especificação geral do ERP
- `04-modelo-de-dados.md` e `prisma/schema.prisma` — modelo de dados
- `rh-docs/01-especificacao-tecnica.md` e `rh-docs/04-modelo-de-dados.md` — módulo de Recursos Humanos
- `armazens-docs/` — gestão de armazéns
- `implementation_plan.md` e `rh-docs/03-tasks.md` — planos de implementação

## Ajuda

O botão de interrogação, no canto superior direito, ainda não abre uma página de
ajuda: mostra apenas uma notificação. O sino avisa que não há notificações
recentes. Para repor uma palavra-passe é preciso falar com o administrador do
sistema — o link «Esqueceu-se da senha?» no ecrã de entrada limita-se a dizer
isso mesmo.
