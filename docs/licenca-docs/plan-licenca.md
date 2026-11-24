# PLAN.md --- Plano de Implementação do Licenciamento Modular

**Projecto:** ERP Desktop existente\
**Objectivo:** implementar licenciamento local por módulos, sem API,
servidor central ou sistema paralelo.\
**Documento complementar:** `SPECS.md`

------------------------------------------------------------------------

## 1. Estratégia de execução

Implementar incrementalmente dentro do ERP actual. Cada fase deve
terminar com código funcional, testes e revisão antes de avançar.

**Regra principal:** não iniciar pela criação de tabelas ou páginas.
Começar pela leitura do repositório para descobrir os padrões reais do
ERP.

### Restrições que não podem ser violadas

-   Desktop exclusivamente.
-   ElectronJS + ReactJS + TypeScript + Tailwind + Zod + Zustand +
    Prisma + PostgreSQL local.
-   Sem API ou servidor de licenciamento.
-   Sem dashboard ou aplicação administrativa paralela.
-   Página de licenças dentro da Administração de Configurações
    existente.
-   Venda e autorização por módulos.
-   Não recriar nem substituir o schema actual.
-   Não apagar nem bloquear dados de negócio por expiração.

## 2. Fase 0 --- Auditoria do ERP existente

**Objectivo:** compreender o projecto antes de alterar código.

### Tarefas

-   [ ] Ler `package.json` e identificar versões de Electron, React,
    TypeScript, Prisma, Zod e Zustand.
-   [ ] Inspeccionar a estrutura de pastas.
-   [ ] Inspeccionar `schema.prisma` e migrations existentes.
-   [ ] Identificar inicialização do Electron Main.
-   [ ] Identificar o Preload e a política de `contextIsolation` /
    `nodeIntegration`.
-   [ ] Identificar convenções de IPC e validação.
-   [ ] Identificar a estrutura de serviços, repositories e validators.
-   [ ] Localizar a página, layout, rotas e menu de Administração de
    Configurações.
-   [ ] Identificar o sistema de autenticação, perfis e permissões.
-   [ ] Identificar o catálogo real de módulos e funcionalidades.
-   [ ] Identificar pontos de entrada dos serviços de negócio que terão
    de validar a licença.
-   [ ] Identificar mecanismo de auditoria/logs existente.
-   [ ] Identificar onde ficam configurações e ficheiros locais da
    aplicação.

### Entregável

Criar um relatório interno `LICENSING_DISCOVERY.md` com: - Arquitectura
encontrada. - Modelos Prisma reutilizáveis. - Convenções IPC. - Local
exacto da página de configurações. - Lista real de módulos. - Pontos de
controlo de acesso. - Ficheiros que serão alterados. - Riscos e
divergências face ao `SPECS.md`.

**Gate:** não avançar se não estiver claro onde integrar o módulo sem
duplicar arquitectura.

## 3. Fase 1 --- Desenho do domínio e catálogo de módulos

**Objectivo:** definir uma fonte única de verdade para os módulos
comercializáveis.

### Tarefas

-   [ ] Mapear módulos existentes no ERP.
-   [ ] Distinguir módulo comercial, submódulo e funcionalidade interna.
-   [ ] Definir chaves estáveis e únicas para módulos.
-   [ ] Definir dependências entre módulos, quando existirem.
-   [ ] Definir quais as funcionalidades essenciais que nunca devem ser
    bloqueadas pelo licenciamento.
-   [ ] Criar tipos TypeScript partilhados para `ModuleKey`, estados e
    resultados de autorização.
-   [ ] Criar catálogo central de módulos seguindo convenções
    existentes.

### Critérios de conclusão

-   Cada módulo comercial tem uma chave estável.
-   Não existem chaves duplicadas.
-   A UI e os serviços usam o mesmo catálogo.
-   As dependências estão documentadas.
-   Nenhum módulo é inventado para preencher lacunas.

## 4. Fase 2 --- Formato de licença e criptografia

**Objectivo:** estabelecer um formato de licença verificável offline.

### Tarefas

-   [ ] Definir envelope da licença e `schemaVersion`.
-   [ ] Definir payload assinado e serialização determinística.
-   [ ] Definir campos do cliente, produto, módulos, datas, limites
    opcionais e instalação.
-   [ ] Implementar verificação Ed25519 no processo Electron Main.
-   [ ] Incorporar apenas a chave pública no cliente.
-   [ ] Definir `keyId` e estratégia de rotação de chaves públicas.
-   [ ] Criar schemas Zod para payload e envelope.
-   [ ] Implementar validação de datas, produto, módulos, limites e
    instalação.
-   [ ] Definir mensagens de erro tipadas.
-   [ ] Criar fixtures de licenças válidas e inválidas para testes.

### Segurança

-   [ ] Confirmar que nenhuma chave privada aparece no repositório ou
    instalador.
-   [ ] Confirmar que o Renderer não executa a verificação como controlo
    de segurança único.
-   [ ] Confirmar que a assinatura cobre todos os campos que concedem
    direitos.
-   [ ] Confirmar que a serialização é determinística.

### Critérios de conclusão

-   Payload válido é aceite.
-   Alteração de qualquer campo assinado invalida a assinatura.
-   Chave desconhecida, produto errado e datas inválidas são rejeitados.

## 5. Fase 3 --- Persistência local e Prisma

**Objectivo:** guardar a licença no PostgreSQL já utilizado pelo ERP.

### Tarefas

-   [ ] Comparar o modelo proposto em `SPECS.md` com o schema actual.
-   [ ] Reutilizar modelos existentes quando apropriado.
-   [ ] Criar apenas os modelos/campos indispensáveis.
-   [ ] Criar migration incremental.
-   [ ] Persistir payload assinado, assinatura e `keyId`.
-   [ ] Persistir módulos autorizados.
-   [ ] Persistir eventos de licenciamento.
-   [ ] Implementar repository com operações tipadas.
-   [ ] Garantir transacção na substituição da licença.
-   [ ] Garantir rollback quando a importação falhar.
-   [ ] Revalidar assinatura ao carregar a licença persistida.

### Critérios de conclusão

-   Migration executa sem perda de dados.
-   Licença válida persiste e é recuperada.
-   Licença inválida não substitui a actual.
-   Alteração manual dos registos não produz uma licença válida sem
    assinatura correspondente.

## 6. Fase 4 --- Licensing Service no Electron Main

**Objectivo:** concentrar regras de negócio e autorização no Main.

### Tarefas

-   [ ] Implementar serviço de domínio de licenciamento.
-   [ ] Implementar importação de licença através do diálogo nativo de
    ficheiros.
-   [ ] Validar extensão, tamanho e conteúdo real do ficheiro.
-   [ ] Validar assinatura e payload antes de persistir.
-   [ ] Implementar consulta do estado da licença.
-   [ ] Implementar consulta dos módulos licenciados.
-   [ ] Implementar `checkModuleAccess`.
-   [ ] Implementar remoção controlada da licença.
-   [ ] Implementar revalidação no arranque.
-   [ ] Implementar logs/eventos de licenciamento.
-   [ ] Garantir que a operação não bloqueia o arranque sem necessidade.
-   [ ] Garantir que não existe qualquer chamada de rede para validar a
    licença.

### Critérios de conclusão

-   Main é a fonte efectiva da decisão de autorização.
-   A aplicação funciona sem Internet.
-   O serviço devolve estados e erros consistentes.
-   Operações administrativas exigem permissão adequada.

## 7. Fase 5 --- Integração IPC e Preload

**Objectivo:** disponibilizar ao React apenas operações estritamente
necessárias.

### Tarefas

-   [ ] Definir contratos IPC tipados.
-   [ ] Criar handlers no Main.
-   [ ] Validar inputs com Zod.
-   [ ] Validar permissões no Main.
-   [ ] Expor métodos específicos no Preload.
-   [ ] Não expor `ipcRenderer` genérico.
-   [ ] Não permitir que o Renderer altere directamente tabelas ou
    estados de licença.
-   [ ] Tratar erros com resultados previsíveis para a UI.

### Operações previstas

-   Obter estado da licença.
-   Obter módulos licenciados.
-   Consultar acesso a um módulo.
-   Seleccionar e importar licença.
-   Remover licença.
-   Consultar histórico de eventos.

### Critérios de conclusão

-   Renderer não acede à BD.
-   IPC não permite elevar privilégios.
-   Os contratos estão tipados e validados.

## 8. Fase 6 --- Página Gestão de Licenças

**Objectivo:** integrar a experiência na Administração de Configurações
existente.

### Tarefas

-   [ ] Adicionar item "Licenciamento" à navegação de configurações.
-   [ ] Respeitar layout e componentes actuais.
-   [ ] Criar resumo do estado da licença.
-   [ ] Apresentar dados do titular e datas.
-   [ ] Apresentar módulos licenciados e não licenciados.
-   [ ] Criar fluxo de importação e pré-visualização.
-   [ ] Apresentar resultado da validação.
-   [ ] Criar confirmação de substituição de licença.
-   [ ] Criar confirmação de remoção.
-   [ ] Apresentar mensagens de licença expirada ou inválida.
-   [ ] Aplicar permissões de UI sem depender delas como segurança
    única.
-   [ ] Garantir acessibilidade, estados de carregamento e feedback.

### Estados visuais

-   Sem licença instalada.
-   Licença válida.
-   Licença ainda não válida.
-   Licença expirada.
-   Assinatura inválida.
-   Produto incompatível.
-   Instalação incompatível.

### Critérios de conclusão

-   A página está dentro das configurações existentes.
-   Não existe dashboard paralelo.
-   O utilizador consegue importar e consultar uma licença.
-   Mensagens são claras e não expõem detalhes internos.

## 9. Fase 7 --- Aplicação das regras nos módulos do ERP

**Objectivo:** fazer com que os direitos da licença sejam respeitados
nas funcionalidades reais.

### Tarefas

-   [ ] Mapear páginas, rotas e menus de cada módulo.
-   [ ] Ocultar/desactivar entradas de módulos não licenciados.
-   [ ] Adicionar guardas de navegação seguindo o router existente.
-   [ ] Adicionar verificação nos serviços de negócio.
-   [ ] Adicionar verificação nos handlers IPC que executam operações
    protegidas.
-   [ ] Garantir que operações directas não contornam a UI.
-   [ ] Garantir que operações essenciais de administração, backup e
    exportação não são bloqueadas indevidamente.
-   [ ] Tratar dependências entre módulos.
-   [ ] Garantir que permissões de utilizador e licenciamento são
    verificações distintas.

**Regra:** acesso permitido exige simultaneamente que o módulo esteja
licenciado e que o utilizador tenha a permissão funcional necessária.

### Critérios de conclusão

-   Módulo licenciado e utilizador autorizado: operação permitida.
-   Módulo não licenciado: operação bloqueada.
-   Módulo licenciado mas utilizador sem permissão: operação bloqueada.
-   Invocação directa de IPC não contorna o licenciamento.

## 10. Fase 8 --- Testes e hardening

### Unitários

-   [ ] Assinatura correcta/incorreta.
-   [ ] Payload adulterado.
-   [ ] Chave pública desconhecida.
-   [ ] Produto incompatível.
-   [ ] Licença sem expiração.
-   [ ] Licença expirada.
-   [ ] Licença ainda não válida.
-   [ ] Módulo autorizado/não autorizado.
-   [ ] Dependência em falta.
-   [ ] Instalação incompatível.

### Integração

-   [ ] Importar licença válida.
-   [ ] Rejeitar licença inválida.
-   [ ] Preservar licença anterior em erro.
-   [ ] Reiniciar aplicação e revalidar.
-   [ ] Testar migration com base de dados preenchida.
-   [ ] Testar permissões no Main.
-   [ ] Testar acesso a serviços protegidos.

### Interface

-   [ ] Estado sem licença.
-   [ ] Importação válida.
-   [ ] Importação inválida.
-   [ ] Pré-visualização dos módulos.
-   [ ] Remoção com confirmação.
-   [ ] Aviso de expiração.
-   [ ] Bloqueio de módulo não licenciado.

### Hardening

-   [ ] Inspeccionar artefactos de build para garantir ausência de chave
    privada.
-   [ ] Verificar que o Renderer não tem acesso directo a Node/BD.
-   [ ] Verificar permissões de ficheiros locais.
-   [ ] Garantir logs sem segredos.
-   [ ] Documentar limites do modelo offline.

## 11. Fase 9 --- Processo do fornecedor para emissão de licenças

**Objectivo:** permitir vender módulos sem criar um servidor ou serviço
paralelo.

### Processo operacional

1.  Receber o pedido comercial do cliente.
2.  Identificar os módulos adquiridos.
3.  Definir validade e limites aplicáveis.
4.  Preparar o payload da licença.
5.  Assinar o payload com a chave privada do fornecedor num ambiente
    controlado.
6.  Entregar o ficheiro de licença ao cliente.
7.  O cliente importa o ficheiro na página Gestão de Licenças do ERP.

A assinatura é feita pelo fornecedor fora da aplicação instalada no
cliente. Não incluir a chave privada nem a ferramenta interna de
assinatura no instalador.

### Critérios de conclusão

-   Existe procedimento documentado de emissão.
-   Ficheiros emitidos são aceites pelo ERP.
-   Não é necessária ligação à Internet.
-   A chave privada não é distribuída.

## 12. Ordem sugerida de implementação

    Ordem Fase                             Dependência
  ------- -------------------------------- -----------------------------
        1 Auditoria do ERP                 Nenhuma
        2 Domínio e catálogo de módulos    Auditoria
        3 Formato e criptografia           Domínio
        4 Persistência e migration         Auditoria + domínio
        5 Licensing Service                Criptografia + persistência
        6 IPC e Preload                    Serviço
        7 Página de licenciamento          IPC
        8 Guardas e serviços dos módulos   Serviço + catálogo
        9 Testes e hardening               Todas
       10 Processo de emissão              Formato e criptografia

## 13. Definição de concluído (Definition of Done)

A funcionalidade só pode ser considerada concluída quando:

-   [ ] Está integrada na arquitectura actual.
-   [ ] Não foi criado servidor, API ou dashboard externo.
-   [ ] A licença é vendida e validada por módulos.
-   [ ] A assinatura Ed25519 é verificada no Electron Main.
-   [ ] A chave privada não está no cliente.
-   [ ] A licença pode ser importada offline.
-   [ ] A licença é persistida e revalidada após reinício.
-   [ ] Módulos não licenciados não executam operações protegidas.
-   [ ] RBAC existente continua a funcionar.
-   [ ] Dados do cliente não são apagados por expiração ou remoção da
    licença.
-   [ ] Migrations preservam os dados existentes.
-   [ ] Testes unitários, integração e UI passam.
-   [ ] Documentação de emissão e recuperação está concluída.

## 14. Instrução final para o agente de desenvolvimento

Executa primeiro apenas a Fase 0. Não alteres ficheiros nem cries
migrations durante a auditoria.

Depois apresenta: 1. A arquitectura real encontrada. 2. O catálogo real
de módulos. 3. Os modelos Prisma que podem ser reutilizados. 4. Os
pontos exactos de integração. 5. A lista de ficheiros que propões
criar/alterar. 6. As diferenças entre o repositório e esta
especificação.

Aguarda validação do plano de alterações antes de implementar as fases
seguintes. Em todas as fases, trabalhar sobre o ERP existente, preservar
convenções e evitar refactorizações não relacionadas.
