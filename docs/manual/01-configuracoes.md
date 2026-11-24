# 2. Configurações

Chega-se às Configurações pelo ícone de roda dentada, na barra superior, ou pelo
item **Configurações do Sistema** no menu do utilizador. Entra quem tiver a
permissão `configuracoes:admin` (o perfil Administrador tem essa permissão);
qualquer outro perfil vê o ecrã «Acesso Restrito ao Administrador», com
explicação e um botão **Voltar ao Início**.

O ecrã chama-se **Configurações — Sistema & Empresa** e tem sete abas, em dois
grupos da faixa:

- **Estrutura & Fiscalidade** — **Empresas**, **Exercício**, **Séries**
- **Utilizadores & Segurança** — **Utilizadores**, **Permissões**, **Auditoria**,
  **Licenciamento**

## Ordem de trabalho numa instalação nova

Esta ordem não é uma sugestão, é uma imposição do sistema:

1. Criar a empresa, com os dados fiscais e os módulos contratados.
2. Registar o exercício fiscal e abri-lo.
3. Registar as séries de numeração de que a empresa vai precisar.
4. Criar os perfis e as permissões.
5. Criar os utilizadores, ligando cada um a um perfil e à empresa.

Sem os passos 2 e 3, o sistema recusa emitir faturas, recibos ou lançamentos. O
próprio ecrã de Empresas avisa disso no banner do topo.

## Empresas

### Criar uma empresa

1. Em **Empresas**, carregue em **Nova Empresa**. Abre um assistente de três passos,
   com o indicador «Identificação & Módulos → Dados da Empresa → Regime IVA &
   Exercício».
2. **Passo 1 — Identificação & Módulos.** Preencha o **Identificador da Empresa**
   (código curto, em maiúsculas, por exemplo `DORA-AO`) e escolha o **País de
   Exercício**: determina o enquadramento fiscal e a moeda base sugerida. Marque, na
   grelha **Selecionar os Módulos Pagos pela Empresa**, os módulos que a empresa
   contratou — pelo menos um. O contador à direita mostra quantos marcou.
3. Carregue em **Seguinte**.
4. **Passo 2 — Dados da Empresa.** Preencha o **Nome da Empresa / Razão Social**, o
   **NIF** e, opcionalmente, **Endereço Principal**, **Telefone** e **Email**. Estes
   três últimos, quando preenchidos, aparecem no cabeçalho dos documentos impressos.
   Carregue o **Logótipo** (JPG ou PNG, até 2 MB) se quiser — é impresso no canto
   superior esquerdo da folha. Escolha a **Moeda Base** (obrigatória) e, se
   precisar de operações em duas divisas, a **Moeda Alternativa**.
5. Carregue em **Seguinte**.
6. **Passo 3 — Regime IVA & Exercício.** Escolha entre **Regime Normal — mensal**,
   **Regime Normal — trimestral** e **Isento de IVA**. Se marcar a isenção, o campo
   **Razão / Motivo da Isenção** passa a ser obrigatório (por exemplo «Artigo 9.º do
   CIVA»). Defina ainda o **Mês Inicial** e o **Mês Final** do ano fiscal e a
   **Antecedência do alerta de caducidade (dias)** — quantos dias antes da validade
   de um lote o Estado de Stock começa a assinalá-lo como «a caducar»; por omissão,
   90 dias.
7. Carregue em **Criar Empresa**. Pode andar para trás em qualquer momento com
   **Anterior**, ou desistir com **Cancelar**.

Uma nota sobre **Dados Bancários**, no passo 2: não há campos para os escrever aqui.
As contas bancárias e as caixas são geridas em **Finanças › Contas**, e é de lá que
os documentos impressos tiram os dados de pagamento.

### A lista de empresas

A tabela mostra **Identificador**, **Nome da Empresa** (com o endereço por baixo),
**NIF**, **País**, **Moeda Base** (e a alternativa, quando existe), o **Regime IVA**
(numa etiqueta colorida) e os **Módulos Pagos** — até três etiquetas, seguidas de
`+N` quando há mais.

Em **Ações** tem **Editar**, que reabre o assistente no mesmo ponto, e o ícone do
caixote, que elimina a empresa depois de uma confirmação explícita. Eliminar uma
empresa afeta tudo o que esteja ligado a ela; pense duas vezes antes de o fazer.

Validações que o assistente impõe: identificador, nome e NIF obrigatórios, pelo menos
um módulo marcado e, em regime isento, o motivo da isenção.

## Exercício

O exercício é o ano fiscal da empresa. Este é o ecrã que liberta a emissão de
documentos, e o banner do topo diz isso mesmo.

### Criar um exercício

No formulário **Criar Ano de Exercício**, à esquerda:

1. **Selecionar a Empresa**.
2. **Ano** (quatro dígitos, por exemplo `2026`); as datas **Data Início** e **Data
   Fim** são preenchidas a partir do ano e ajustáveis.
3. Marque, em **Selecionar os Módulos do Exercício**, os módulos que vão operar nesse
   ano. O contador mostra quantos ficaram ativos.
4. Carregue em **Criar Ano de Exercício**. A confirmação é «Exercício fiscal 2026
   criado com sucesso!».

### A lista de exercícios

À direita, os exercícios aparecem agrupados por ano, com o ano corrente aberto e os
restantes recolhidos (clique no ano para abrir ou fechar). Cada linha mostra a
**Empresa** e o NIF, o **Período** (data de início → data de fim), os **Módulos**
(etiquetas) e o **Estado**, que é `Aberto`, `Fechado` ou `Encerrado`, com as cores
correspondentes. Em **Ações** existe o ícone de eliminar exercício.

## Séries

As séries definem a numeração legal dos documentos. Sem uma série ativa do tipo certo,
o sistema não emite nada — a mensagem do serviço é «Série ativa '…' para FT não
encontrada».

### Registar uma série

O formulário tem duas abas: **Criação de Série** e **Atributos da Série**.

1. Em **Criação de Série**, escolha a **Empresa** e marque, em **Módulos que vão usar
   a série criada**, os módulos que vão emitir com ela.
2. Carregue em **Continuar para Atributos da Série →**.
3. Em **Atributos da Série**, preencha:
   - **Série** — identificador alfanumérico em maiúsculas (por exemplo `2026` ou `FT2026`).
   - **Lançamento** — começa em zero e não é editável. É o sistema que o incrementa,
     de forma atómica, a cada documento emitido.
   - **Descrição da Série** — texto livre.
   - **Tipo de Documento** — `FT Fatura`, `FR Fatura-Recibo`, `NC Nota de Crédito`,
     `ND Nota de Débito`, `FP Fatura Proforma`, `GR Guia de Entrega` ou `RC Recibo`.
     Cada documento só aceita séries do seu próprio tipo, e a numeração é independente
     por tipo.
   - **Data de Início** e **Data Final** de vigência da série.
4. Carregue em **Registar Série**.

A numeração sai no formato `PREFIXO SÉRIE/NÚMERO`, com quatro dígitos — por exemplo
`FT FT2026/0001`.

### A lista de séries

Agrupada por ano, mostra **Série**, **Descrição**, **Empresa**, **Período**,
**Lançamento**, **Módulos** e as **Ações** (eliminar).

## Utilizadores

### A lista

Filtros: **Pesquisar por login, nome ou email...**, **Todos os Estados** e o botão de
atualizar lista. A tabela mostra **Utilizador**, **Nome Completo**, **Email**,
**Perfil**, **Empresa**, **Último Acesso**, **Estado** e **Ações**.

Por linha pode **Editar**, **Alterar senha**, **Desactivar** ou **Activar** e
**Eliminar**. Desativar e ativar confirmam-se com «Utilizador desactivado com
sucesso!» ou «Utilizador activado com sucesso!».

### Criar ou editar um utilizador

O formulário **Novo Utilizador** tem duas abas.

**Dados & Organização**:

- **Nome completo** (obrigatório)
- **Email** (obrigatório; tem de ser um endereço válido)
- **Telefone**
- **Estado da conta** — `Activo` ou `Inactivo`
- **Armazém por defeito** — o armazém que o sistema sugere nas operações deste
  utilizador

**Credenciais & Perfil**:

- **Nome de utilizador / login** (obrigatório; é o que se escreve no ecrã de entrada)
- **Palavra-passe** (obrigatória na criação; quando edita um utilizador existente o
  campo passa a **Nova senha (opcional)** e pode ficar vazio)
- **Perfil / papel** (obrigatório)
- **Empresa (obrigatória)** — sem esta ligação o utilizador não tem contexto de
  trabalho

Carregue em **Guardar Utilizador**. O sistema confirma com «Utilizador criado com
sucesso!» ou «Utilizador actualizado com sucesso!».

### Alterar ou repor senhas

O botão **Alterar senha**, em cada linha, abre um diálogo com dois modos. No modo
normal pede a **Senha actual** do utilizador e a **Nova senha**; no modo de reposição
administradora, salta a senha atual — útil quando alguém a perdeu. Qualquer dos modos
confirma com «Senha alterada com sucesso!» ou «Senha reposta com sucesso!».

## Permissões

Um perfil é um conjunto de permissões, ou seja, a combinação de módulo e ação. As
ações são cinco: **Consultar**, **Criar / Editar**, **Eliminar**, **Aprovar** e
**Administrar**. Os módulos são os nove do sistema, mais Configurações.

### Criar ou editar um perfil

1. Carregue em **Novo Perfil**.
2. Em **Identificação**, dê um **Nome do perfil** (por exemplo «Vendas Sénior») e uma
   **Descrição** opcional.
3. Na **Matriz de Permissões**, marque as casas que correspondem ao que o perfil pode
   fazer. Cada linha é um módulo e cada coluna uma ação; o rodapé da matriz conta
   quantos módulos ficaram com permissões ativas.
4. Carregue em **Guardar Perfil**.

Na lista pode ainda **Duplicar** um perfil — a forma mais prática de criar variações
de um perfil existente. Perfis marcados como de sistema não podem ser editados nem
eliminados: a matriz aparece bloqueada com a indicação «acesso total a todos os
módulos». O perfil Administrador é deste tipo.

## Auditoria

O registo de auditoria mostra quem fez o quê. Filtra por **Acção** (tem sugestões
enquanto escreve), **Severidade** (`Informação`, `Aviso`, `Crítico`), **Desde** e
**Até**, e inclui ou não os registos arquivados com a caixa **Incluir arquivados**.

O botão **Verificar integridade** confirma que nenhum registo foi alterado depois de
gravado: cada linha guarda uma impressão digital (hash), e o sistema compara-a com o
conteúdo atual. Responde «N registo(s) íntegros.» ou «N registo(s) adulterado(s).».

A tabela mostra a data e hora, o utilizador, a ação, o módulo, a descrição, a
severidade e a impressão digital. Em cada linha pode **Ver detalhes do registo** —
que abre os dados anteriores e os dados novos, em JSON, para comparação — e
**Arquivar registo**, um arquivo lógico que não apaga nada. Os registos carregam-se
por páginas, com o botão **Recarregar** para atualizar.

## Licenciamento

Esta aba gere a licença local da instalação. Não há conta online, servidor de
licenças nem envio de dados para fora do computador: o ficheiro `.erplic` é
lido e a assinatura Ed25519 é verificada no processo principal do Electron.

### Consultar o estado

O painel **Estado da licença** mostra um dos estados `MISSING`, `VALID`,
`NOT_YET_VALID`, `EXPIRED`, `INVALID_SIGNATURE`, `INVALID_FORMAT`,
`PRODUCT_MISMATCH`, `INSTALLATION_MISMATCH` ou `UNKNOWN_KEY`, com uma mensagem
clara e sem detalhes criptográficos. Os cartões resumem a situação, o número de
módulos licenciados, a validade e a última validação local. O identificador da
instalação aparece quando existe.

A tabela **Módulos da licença** lista os nove módulos reais do ERP. Cada um
aparece como *Licenciado*, *Não licenciado* ou *Sempre disponível* — é o caso de
Configurações, que não pode ser bloqueada porque é aqui que a licença se
importa. **Configurações** continua a exigir a permissão RBAC mesmo sem licença.

**Dados do titular** apresenta o identificador da licença, o cliente, o NIF, o
produto, as datas de emissão e validade, a chave de assinatura, a vinculação à
instalação e os limites contratuais. **Histórico de licenciamento** mostra as
operações registadas no log de auditoria (importação, rejeição, revalidação e
remoção).

### Importar uma licença

1. Carregue em **Importar licença**. O sistema abre o diálogo nativo, filtrado
   por ficheiros `.erplic`.
2. O ficheiro é lido e validado antes de qualquer alteração. A janela
   **Confirmar importação de licença** mostra o estado, os dados do titular e
   os módulos incluídos.
3. Se já existir uma licença instalada, a janela avisa que ela será
   substituída. Carregue em **Confirmar importação** apenas depois de conferir
   os módulos.
4. Se a validação falhar, a importação é recusada e a licença anterior
   permanece intacta.

A licença é gravada localmente no PostgreSQL já usado pelo ERP. A assinatura é
revalidada a cada arranque e a cada consulta: alterar a base de dados à mão não
produz uma licença válida.

### Remover uma licença

**Remover** pede confirmação explícita. Só a licença é apagada: nenhum dado de
negócio é eliminado ou bloqueado. Depois da remoção, os módulos comerciais
deixam de aparecer no menu e as operações protegidas são recusadas no Main;
o início, o login, as configurações e a própria consulta de licenciamento
continuam disponíveis.

O processo de emissão pelo fornecedor está descrito em
`docs/licenca-docs/EMISSAO-LICENCAS.md`.
