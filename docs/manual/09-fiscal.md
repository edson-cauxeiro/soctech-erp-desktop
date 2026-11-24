# 10. Fiscal

O módulo chama-se **Fiscal — Conformidade e Auditoria** e tem três abas: **Gerar /
validar** (grupo SAF-T), **Conformidade** (grupo AGT) e **Registo** (grupo Auditoria).

## SAF-T

O SAF-T é o ficheiro normalizado com que se entrega a informação fiscal à
administração tributária. Este ecrã prepara-o e verifica-o antes de sair daqui.

### Escolher o que vai no ficheiro

- **Ano fiscal** — por omissão o ano corrente.
- **Período** — `Ano inteiro` ou um mês concreto; por omissão, o mês corrente.
- **Anulados** — a caixa **Incluir no ficheiro** decide se os documentos anulados
  entram ou não.

### Validar antes de gerar

O botão **Validar** lê os dados e verifica a estrutura do ficheiro sem gravar nada. É
o passo prudente: gasta dez segundos e evita entregar um ficheiro com erros.

O resultado aparece em quatro indicadores — **Documentos**, **Clientes**, **Artigos**
e **Total líquido** — e num aviso que diz sem rodeios se passou: «…: passou a validação
estrutural.» a verde, ou «…: N erro(s) impedem a exportação.» a vermelho. Há ainda um
aviso a explicar o âmbito do que foi validado, para não se confundir a verificação
estrutural com a validação da AGT.

Se houver problemas, abre-se a lista **Problemas encontrados**, com **Código**,
**Severidade**, **Mensagem**, **Onde** e **Acção**. Cada linha pode ser apagada
individualmente com **Apagar**, ou todas de uma vez com **Limpar todos**. Os erros
impedem a exportação; os avisos não.

### Gerar

O botão **Gerar** faz o mesmo trabalho e escreve o ficheiro em disco. No fim mostra o
caminho — «Ficheiro gravado em …» — mais os indicadores de documentos, total líquido,
avisos e o **Hash SHA-256**, que é a impressão digital do ficheiro e serve para provar
que o que se entregou é o que se gerou.

## Conformidade AGT

Esta aba verifica se os documentos cumprem os requisitos de assinatura exigidos em
Angola e calcula as assinaturas. Não submete nada à AGT: a submissão é feita pelo
software certificado do operador.

1. Escolha o **Ano** e o **Período**.
2. No bloco **Identificação do software que assina**, confirme ou corrija o **Nome**
   (`SOC TECHNO`), a **Versão** (`1.0.0`), a **Chave de segurança** e o **Certificado**
   — estes dois últimos são emitidos pela AGT.
3. Carregue em **Verificar conformidade**.

O resultado traz quatro indicadores — **Ficheiro** (com a versão), **Documentos**
(quantos conformes de quantos), **Erros** e **Avisos** — e um aviso que resume: as
assinaturas foram calculadas, ou há erros que impedem a submissão e, nesse caso, os
documentos não conformes não são assinados.

Por baixo, a lista **Problemas de conformidade**, com **Código**, **Severidade**
(`Erro`, `Aviso` ou `Info`), **Mensagem** e **Campo**, e o painel **Estado por
documento**, com o **Documento**, a **Conformidade** e a **Assinatura (ATC-UD)**. Um
documento sem assinatura aparece como «não assinado».

O painel **Rastreio de ficheiros** guarda os vinte ficheiros mais recentes, com o
**Ficheiro**, o **Período**, o **Estado**, a **Conformidade**, o **Hash** e a data de
**Geração**. Os estados possíveis são `Rascunho`, `Assinado`, `Submetido`, `Aceite` e
`Rejeitado`.

## Auditoria fiscal

Esta é a auditoria do módulo Fiscal, distinta do registo de auditoria geral que vive
em **Configurações › Auditoria** e da linha temporal de RH. Aqui a leitura é mais
direcionada para a conformidade fiscal.

No topo, os indicadores **Registos** (no registo da empresa), **Carregados** (nesta
página) e **Integridade**, que mostra `Íntegro`, `Adulterado` ou um traço, conforme o
resultado da última verificação. O botão **Verificar integridade** compara cada linha
com a impressão digital gravada e responde com a contagem de registos verificados e,
se for o caso, quantos não batem certo — «A linha foi alterada depois de gravada.» é a
mensagem para o segundo caso.

O **Registo de auditoria** lista **Quando**, **Utilizador**, **Acção**, **Entidade**,
**Descrição**, **Severidade** e **Ações**, cinquenta registos por página, com o botão
**Carregar mais** para continuar. As ações aparecem por extenso — *Criou*, *Actualizou*,
*Eliminou*, *Exportou*, *Validou*, *Imprimiu*, *Entrou*, *Saiu*, *Anulou*, *Submeteu* —
e a severidade como `Crítico`, `Aviso` ou `Info`.

Em cada linha pode **Ver detalhes do registo**, que abre uma ficha com cinco secções:
identificação (data e hora, empresa, utilizador, IP e agente), evento (módulo,
entidade, ação, severidade e descrição), alterações (dados anteriores e dados novos,
em JSON), integridade (o hash SHA-256) e metadados (se está arquivado). Também pode
**Arquivar registo**, uma operação reversível que esconde a linha das listagens
normais sem a apagar.
