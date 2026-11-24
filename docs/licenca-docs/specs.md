# SPECS.md --- Sistema de Licenciamento Modular do ERP Desktop

**Estado:** Especificação inicial para implementação\
**Âmbito:** Evolução do ERP desktop existente\
**Plataforma:** ElectronJS + ReactJS + TypeScript + Tailwind CSS + Zod +
Zustand + Prisma + PostgreSQL local

------------------------------------------------------------------------

## 1. Objectivo

Implementar no ERP existente um sistema de licenciamento **local,
modular e offline-first**, integrado na área actual de Administração de
Configurações.

O sistema deve permitir ao fornecedor vender e autorizar módulos
individualmente, importar uma licença assinada, consultar o estado dos
direitos adquiridos e controlar o acesso às funcionalidades
correspondentes.

Esta implementação é uma evolução do produto existente. Não é permitida
a criação de um segundo ERP, de um serviço de licenciamento remoto, de
uma API de licenciamento, de um servidor central ou de um dashboard
externo.

## 2. Restrições obrigatórias

1.  O produto é exclusivamente Desktop.
2.  Manter ElectronJS, ReactJS, TypeScript, Tailwind CSS, Zod, Zustand,
    Prisma e PostgreSQL local.
3.  Não introduzir backend remoto, API externa, servidor central, SaaS
    de licenciamento ou sincronização obrigatória.
4.  Não introduzir Docker na distribuição desktop.
5.  Integrar a interface na página/área existente de Administração de
    Configurações.
6.  Vender licenças por módulo. Não assumir que o cliente compra
    obrigatoriamente um pacote fechado.
7.  Não recriar tabelas, autenticação, configurações ou componentes que
    já existam sem primeiro inspeccionar o projecto.
8.  Não substituir nem reestruturar o schema Prisma completo para
    acomodar o licenciamento.
9.  Não quebrar os dados, fluxos, permissões ou funcionalidades
    existentes.
10. A aplicação deve continuar utilizável sem ligação à Internet depois
    de instalada e licenciada.

## 3. Contexto conhecido do projecto

O contexto recuperado das decisões anteriores indica:

  Área                Informação conhecida
  ------------------- ---------------------------------------------------
  Plataforma          Desktop
  Runtime             ElectronJS
  UI                  ReactJS
  Linguagem           TypeScript
  CSS                 Tailwind CSS
  Validação           Zod
  Estado              Zustand
  ORM                 Prisma
  BD                  PostgreSQL local
  Estado do produto   ERP existente; tabelas já criadas
  Configurações       Existe uma área de Administração de Configurações

**Informação ainda não inspeccionada:** nomes e relações dos modelos
reais do Prisma, estrutura exacta de pastas, convenções IPC, sistema
actual de permissões, modelo de utilizadores, menu de configurações,
serviço de base de dados e estratégia de migrations. Os agentes devem
descobrir estes elementos no repositório antes de alterar código.

## 4. Princípios do modelo de licenciamento

### 4.1 Licença por módulos

Cada módulo comercializável deve ter uma chave estável, por exemplo:

-   `SALES`
-   `PURCHASES`
-   `INVENTORY`
-   `WAREHOUSE`
-   `FINANCE`
-   `TREASURY`
-   `ACCOUNTING`
-   `HUMAN_RESOURCES`
-   `REPORTS`

Esta lista é ilustrativa. Os agentes devem obter a lista verdadeira a
partir dos módulos e funcionalidades que já existem no ERP. Não criar
módulos fictícios nem duplicar módulos existentes.

A licença contém uma lista explícita de módulos autorizados. Um módulo
não presente na licença é considerado não licenciado.

### 4.2 Modelo comercial

O sistema deve suportar a venda de módulos individuais e a combinação de
vários módulos numa mesma licença.

Exemplo conceptual:

-   Cliente A compra `SALES` e `INVENTORY`.
-   Cliente B compra `SALES`, `PURCHASES`, `INVENTORY` e `FINANCE`.
-   Cliente C compra todos os módulos disponíveis.

Os exemplos não definem preços nem pacotes comerciais obrigatórios.

A estrutura deve permitir, sem alteração do mecanismo criptográfico,
licenças: - Sem data de expiração (perpétuas), se essa modalidade for
comercialmente adoptada. - Com data de expiração, se for vendida uma
licença temporária. - Com limites opcionais, caso o produto venha a
comercializar limites de utilizadores ou dispositivos.

Não implementar subscrições, pagamentos recorrentes, gestão de clientes
online ou renovação automática nesta fase.

### 4.3 Emissão e instalação

O fornecedor emite um ficheiro de licença assinado digitalmente, fora da
instalação do cliente. A aplicação desktop não gera nem conhece a chave
privada.

O administrador do ERP: 1. Abre Administração de Configurações. 2. Entra
em Gestão de Licenças. 3. Selecciona Importar Licença. 4. Escolhe o
ficheiro de licença. 5. A aplicação valida estrutura, assinatura,
produto, versão/esquema, validade e identificador da instalação, quando
aplicável. 6. A aplicação apresenta os módulos incluídos e pede
confirmação. 7. A licença validada é guardada localmente. 8. O estado
dos módulos é actualizado sem reiniciar a aplicação sempre que
tecnicamente seguro.

A extensão recomendada é `.erplic` ou `.license.json`. Escolher uma
única extensão e documentá-la.

## 5. Arquitectura interna

A implementação deve seguir as convenções arquitecturais que já existem
no projecto.

Separação lógica recomendada:

-   **Renderer (React):** apresentação, formulários, estado visual e
    feedback.
-   **Preload:** exposição mínima e tipada das operações autorizadas.
-   **Electron Main:** validação efectiva, acesso à base de dados,
    leitura de ficheiros e verificação criptográfica.
-   **Prisma:** persistência na base de dados local existente.
-   **Licensing Domain/Service:** regras de licenciamento independentes
    da UI.
-   **Licensing Repository:** persistência e consulta dos dados de
    licença.

O Renderer não deve: - Aceder directamente ao PostgreSQL. - Ler ou
escrever livremente ficheiros internos da aplicação. - Verificar a
licença como única barreira de segurança. - Receber a chave privada de
assinatura. - Poder alterar directamente o estado de licença para
`ACTIVE`.

O Electron Main deve validar os pedidos recebidos por IPC, validar os
dados com Zod e aplicar as regras de autorização.

## 6. Assinatura e formato da licença

### 6.1 Algoritmo

Usar assinatura digital Ed25519 através das APIs criptográficas
suportadas pela versão de Node.js/Electron usada pelo projecto.

-   Chave privada: mantida pelo fornecedor fora da aplicação
    distribuída.
-   Chave pública: incorporada na aplicação para verificação.
-   Nunca incluir a chave privada em `src`, `resources`, `.env`,
    ficheiros de configuração distribuídos ou bundle do Renderer.
-   Nunca aceitar uma licença apenas porque o JSON é válido.

A chave pública deve ter identificador de versão (`keyId`) para permitir
rotação futura. A aplicação pode confiar em mais do que uma chave
pública durante uma transição, sem distribuir a chave privada.

### 6.2 Payload conceptual

O conteúdo assinado deve ser serializado de forma determinística. A
assinatura deve cobrir todos os campos que afectam os direitos de
utilização.

Exemplo ilustrativo:

``` json
{
  "schemaVersion": 1,
  "licenseId": "LIC-2026-000001",
  "productId": "ERP_DESKTOP",
  "customer": {
    "name": "Empresa Exemplo, Lda.",
    "taxNumber": "000000000"
  },
  "issuedAt": "2026-11-23T10:00:00.000Z",
  "notBefore": "2026-11-23T10:00:00.000Z",
  "expiresAt": null,
  "modules": [
    { "key": "SALES", "enabled": true },
    { "key": "INVENTORY", "enabled": true }
  ],
  "limits": {
    "maxUsers": null,
    "maxDevices": 1
  },
  "installation": {
    "bindingMode": "installation",
    "installationId": "installation-id-issued-or-registered"
  },
  "keyId": "vendor-ed25519-2026-01",
  "signature": "BASE64_SIGNATURE"
}
```

O exemplo é ilustrativo. A implementação deve definir um envelope
inequívoco, por exemplo `{ payload, signature }`, e assinar bytes
canónicos do payload. Não assinar JSON reconstruído com ordem de
propriedades indefinida.

### 6.3 Regras de validação

Validar pelo menos:

-   Estrutura e `schemaVersion` suportados.
-   `productId` correspondente ao ERP.
-   `licenseId` e campos obrigatórios.
-   Assinatura Ed25519.
-   `keyId` reconhecido.
-   Datas válidas e coerentes.
-   `notBefore` não posterior à data actual, respeitando tolerância
    definida.
-   `expiresAt` nulo ou posterior à data actual.
-   Módulos conhecidos e sem duplicados.
-   `enabled` booleano.
-   Limites válidos.
-   Identificador da instalação, quando a licença estiver vinculada a
    uma instalação.
-   Ausência de campos críticos desconhecidos quando isso puder causar
    interpretação ambígua.

Se qualquer validação criptográfica ou estrutural falhar, rejeitar a
licença e não alterar a licença actualmente instalada.

### 6.4 Limites da segurança offline

Uma aplicação desktop totalmente local não consegue garantir revogação
remota imediata nem impedir de forma absoluta que um utilizador com
controlo administrativo modifique o executável, a base de dados, o
relógio ou o ambiente.

A assinatura digital protege contra criação ou alteração simples de
ficheiros de licença, mas não transforma o cliente desktop num ambiente
inviolável.

Não afirmar que a licença é impossível de piratear. Documentar os riscos
e reduzir a superfície de ataque através de validação no processo Main,
assinatura digital, permissões, logs e testes.

## 7. Identidade da instalação

Antes de decidir o vínculo da licença a um dispositivo, inspeccionar se
o ERP já possui um identificador estável da instalação.

Se não existir, introduzir um `installationId` aleatório, gerado uma
única vez e guardado em armazenamento local protegido contra alterações
acidentais. Não utilizar endereço MAC como identificador principal.

O modo de vinculação deve ser explícito: - `none`: licença não vinculada
a uma instalação. - `installation`: licença válida para uma instalação
específica.

A primeira versão pode adoptar `installation` se a política comercial
exigir controlo por computador. Deve existir um procedimento
administrativo de reemissão quando o cliente trocar de computador ou
perder a instalação.

Não implementar activação online nem validação remota.

## 8. Persistência local e integração Prisma

Os agentes devem inspeccionar o `schema.prisma` actual antes de propor
migrations.

Adicionar apenas os modelos/campos necessários, respeitando nomes,
enums, relações, timestamps, soft delete e convenções já usadas.

Estrutura lógica sugerida, a adaptar ao schema real:

### 8.1 `License`

-   `id`
-   `licenseId` (identificador externo único)
-   `productId`
-   `customerName`
-   `customerTaxNumber` opcional
-   `status`
-   `issuedAt`
-   `notBefore`
-   `expiresAt` opcional
-   `installedAt`
-   `lastValidatedAt`
-   `payload` ou referência ao documento assinado
-   `signature`
-   `keyId`
-   `installationId` opcional
-   `createdAt`
-   `updatedAt`

### 8.2 `LicensedModule`

-   `id`
-   `licenseId`
-   `moduleKey`
-   `enabled`
-   relação com `License`
-   unicidade composta adequada para impedir módulo duplicado por
    licença.

### 8.3 `LicenseEvent`

-   `id`
-   `licenseId` opcional
-   `eventType`
-   `description` sem segredos
-   `occurredAt`
-   `metadata` JSON opcional, sem dados sensíveis desnecessários.

O histórico de eventos deve registar importação, rejeição, substituição,
validação, expiração detectada e remoção/desinstalação.

### 8.4 Persistência segura

-   Não guardar chave privada.
-   Não guardar segredos de assinatura.
-   Guardar o payload original assinado ou os bytes necessários para
    revalidar a assinatura.
-   Não permitir que alterações na tabela local transformem uma licença
    inválida em válida.
-   Ao iniciar a aplicação, revalidar a assinatura do documento
    persistido.
-   Fazer a substituição da licença numa transacção: validar primeiro,
    persistir depois.
-   Preservar a licença anterior se a nova licença falhar.

Não duplicar informação que já esteja representada por modelos
existentes. Se já houver tabelas de configurações, empresas,
utilizadores ou auditoria, reutilizá-las quando apropriado.

## 9. Regras de autorização dos módulos

### 9.1 Fonte única de decisão

Criar um serviço de domínio central para responder se um módulo está
autorizado. Não espalhar comparações de strings ou verificações
independentes por componentes React.

Interface conceptual:

``` ts
type ModuleKey = string;

type ModuleAccessResult = {
  allowed: boolean;
  reason:
    | "LICENSE_ACTIVE"
    | "MODULE_NOT_LICENSED"
    | "LICENSE_MISSING"
    | "LICENSE_INVALID"
    | "LICENSE_NOT_YET_VALID"
    | "LICENSE_EXPIRED"
    | "INSTALLATION_MISMATCH";
};

interface LicensingService {
  getLicenseStatus(): Promise<LicenseStatusResult>;
  getLicensedModules(): Promise<string[]>;
  checkModuleAccess(moduleKey: ModuleKey): Promise<ModuleAccessResult>;
  importLicense(filePath: string): Promise<ImportLicenseResult>;
  removeLicense(): Promise<void>;
  revalidateStoredLicense(): Promise<LicenseStatusResult>;
}
```

Os tipos finais devem seguir os padrões existentes do projecto.

### 9.2 Pontos de controlo

Verificar a autorização: - Na construção do menu e navegação. - Ao abrir
páginas e funcionalidades. - Nos serviços de negócio que executam
operações do módulo. - Nos handlers IPC que permitem operações
relacionadas com módulos.

Ocultar um menu não é controlo de segurança suficiente. A operação deve
ser bloqueada no Main/service mesmo que seja invocada directamente.

Não bloquear funções transversais essenciais, como iniciar sessão,
consultar a licença, configurar a base de dados, efectuar cópias de
segurança ou exportar dados, apenas por não existir licença de um módulo
comercial.

### 9.3 Dependências entre módulos

Inspeccionar dependências funcionais reais. Se um módulo depender de
outro, declarar essas dependências num catálogo central e validar a
coerência da licença.

Não activar automaticamente módulos não licenciados. Se a licença
contiver um módulo dependente sem o requisito necessário, apresentar
erro claro e rejeitar a combinação ou aplicar a regra de dependência
definida.

## 10. Estados da licença

Estados internos recomendados:

-   `MISSING`: nenhuma licença instalada.
-   `VALID`: assinatura e direitos válidos.
-   `NOT_YET_VALID`: data de início futura.
-   `EXPIRED`: passou a data de expiração.
-   `INVALID_SIGNATURE`: assinatura inválida.
-   `INVALID_FORMAT`: formato ou schema inválido.
-   `PRODUCT_MISMATCH`: licença de outro produto.
-   `INSTALLATION_MISMATCH`: licença vinculada a outra instalação.
-   `UNKNOWN_KEY`: chave pública não reconhecida.

Não persistir um estado `VALID` como verdade permanente. O estado deve
ser derivado da revalidação do documento assinado e das condições
actuais.

### 10.1 Licença sem expiração

`expiresAt = null` significa que não existe expiração temporal, mas não
significa que a licença possa ser alterada livremente. Assinatura,
produto, módulos e vínculo continuam a ser verificados.

### 10.2 Expiração

Quando expirar: - Bloquear novas operações comerciais dos módulos
expirados, de acordo com a política definida. - Preservar os dados do
cliente. - Permitir consulta de informação necessária e exportação dos
dados, conforme permissões e política do produto. - Não apagar dados,
documentos ou movimentos. - Apresentar instruções para contactar o
fornecedor e obter uma licença válida.

Não implementar bloqueio destrutivo nem apagar dados.

## 11. Interface de utilizador

### 11.1 Localização

Adicionar a página **Administração de Configurações \> Licenciamento** à
navegação existente. Respeitar layout, breadcrumbs, permissões,
componentes, ícones e padrões visuais do ERP.

Não criar uma nova área administrativa paralela.

### 11.2 Ecrã principal --- Gestão de Licenças

Apresentar: - Estado geral da licença. - Identificador da licença. -
Nome e NIF da empresa licenciada, se fornecidos. - Data de emissão. -
Data de início. - Data de expiração ou indicação "Sem expiração". -
Identificador da instalação, se aplicável. - Quantidade de módulos
licenciados. - Lista de módulos e estado individual. - Última validação
local. - Acções permitidas.

Acções: - Importar licença. - Ver detalhes. - Exportar diagnóstico não
sensível, se útil. - Remover licença, apenas com confirmação e permissão
administrativa.

### 11.3 Importação

-   Usar diálogo de selecção de ficheiro nativo do Electron Main.
-   Validar extensão e tamanho máximo.
-   Não confiar na extensão; validar conteúdo.
-   Apresentar pré-visualização dos dados e módulos antes de confirmar.
-   Nunca mostrar stack traces ao utilizador.
-   Mensagens de erro claras e traduzíveis.
-   Não substituir licença válida até a nova licença estar totalmente
    validada.

### 11.4 Catálogo de módulos

A página pode apresentar todos os módulos registados no ERP: -
Licenciado. - Não licenciado. - Indisponível por dependência. -
Desactivado por configuração, quando aplicável.

A lista de módulos deve vir do catálogo real do ERP, não de uma lista
hardcoded duplicada na UI.

### 11.5 Bloqueio de funcionalidade

Quando o utilizador tentar abrir um módulo não licenciado: - Mostrar
aviso com o nome do módulo. - Explicar que o módulo não está incluído na
licença actual. - Mostrar o identificador da licença e instrução de
contacto comercial. - Não mostrar preços inventados nem permitir compra
dentro da aplicação nesta fase.

## 12. Permissões e auditoria

-   Apenas perfil autorizado (por exemplo, administrador) pode importar
    ou remover licenças.
-   Reutilizar RBAC/permissões existente.
-   Não criar novo sistema de autenticação.
-   Registar eventos de licenciamento.
-   Não registar o conteúdo integral de ficheiros privados, chaves ou
    dados desnecessários.
-   Validar permissões no Main, não apenas na UI.

## 13. IPC e contratos internos

Criar canais IPC específicos e tipados, seguindo convenções existentes.

Operações lógicas: - `licensing:get-status` - `licensing:get-modules` -
`licensing:check-module` - `licensing:select-and-import` -
`licensing:remove` - `licensing:get-events`

Requisitos: - Validar inputs e outputs com Zod, se esse for o padrão do
projecto. - Não expor `ipcRenderer` genericamente. - Não aceitar caminho
de ficheiro arbitrário do Renderer quando o Main puder abrir o diálogo
nativo e controlar a selecção. - Não expor funções de escrita directa na
tabela de licenças. - Tratar erros de forma tipada e previsível.

Os nomes são sugestões; adaptar aos nomes e padrões reais existentes.

## 14. Gestão da chave de assinatura

A emissão é uma actividade do fornecedor e não faz parte do ERP
distribuído.

Requisitos: - Gerar a chave privada uma única vez em ambiente
controlado. - Guardar a chave privada fora do repositório e fora do
instalador. - Manter cópia de segurança segura e acesso restrito. - Usar
`keyId` para identificar a chave usada. - Ter processo documentado para
rotação de chave pública. - Nunca incluir uma ferramenta de assinatura
ou chave privada na instalação do cliente. - A emissão pode ser feita
manualmente pelo fornecedor, sem serviço remoto.

A ferramenta interna de emissão, caso venha a ser criada, deve ser uma
utilidade de desenvolvimento/fornecedor não distribuída com o ERP e não
um servidor ou API em execução no cliente.

## 15. Compatibilidade e migrações

-   Inspeccionar versões de Prisma e PostgreSQL já usadas.
-   Criar migration incremental.
-   Não apagar nem renomear tabelas existentes.
-   Não alterar dados antigos sem necessidade.
-   Testar instalação e actualização em base de dados com dados reais
    anonimizados.
-   Garantir que uma base de dados sem licença migra sem perder dados.
-   Definir comportamento em caso de migration falhada.
-   Não assumir que a versão de Prisma é 7+ sem verificar o
    `package.json` e configuração actual.

## 16. Requisitos não funcionais

### Segurança

-   Assinatura Ed25519 validada no Main.
-   Chave privada ausente do cliente.
-   Context isolation e node integration desactivada, conforme
    arquitectura actual.
-   IPC mínimo e validado.
-   Autorização aplicada nos serviços de negócio.
-   Não confiar em flags enviadas pelo Renderer.

### Disponibilidade

-   Funcionamento sem Internet.
-   Nenhuma chamada remota necessária para validar licença.
-   Revalidação local no arranque e antes de operações protegidas quando
    necessário.

### Performance

-   Verificação de assinatura rápida e sem bloquear a UI.
-   Cache em memória apenas como optimização; documento assinado
    continua a ser a fonte verificável.
-   Não efectuar consultas repetidas desnecessárias.

### Manutenção

-   Catálogo central de módulos.
-   Tipos partilhados.
-   Serviços testáveis.
-   Logs sem segredos.
-   Erros tipados.

## 17. Critérios de aceitação

1.  O ERP inicia sem licença e apresenta estado "Licença não instalada",
    sem perder acesso a configurações essenciais.
2.  Um ficheiro correctamente assinado e compatível pode ser importado.
3.  Um ficheiro alterado após assinatura é rejeitado.
4.  Uma licença assinada por chave desconhecida é rejeitada.
5.  Uma licença destinada a outro produto é rejeitada.
6.  Uma licença com datas inválidas ou expirada não autoriza módulos.
7.  Só os módulos listados como activos na licença ficam disponíveis.
8.  A tentativa de executar directamente uma operação de módulo não
    licenciado é bloqueada no Main/service.
9.  A importação inválida não substitui a licença válida já instalada.
10. A aplicação funciona offline sem contactar servidor.
11. A licença é revalidada após reiniciar a aplicação.
12. Um utilizador sem permissão administrativa não consegue importar nem
    remover licenças.
13. Remover a licença não apaga dados de negócio.
14. A migration preserva os dados existentes.
15. A interface segue o padrão da área de Administração de Configurações
    actual.

## 18. Testes obrigatórios

### Unitários

-   Assinatura válida.
-   Assinatura inválida.
-   Payload adulterado.
-   Chave desconhecida.
-   Produto diferente.
-   Data futura.
-   Data expirada.
-   Licença perpétua.
-   Módulo ausente.
-   Módulo desactivado.
-   Dependência de módulo não satisfeita.
-   Identificador de instalação divergente.

### Integração

-   Importação e persistência.
-   Rollback em erro.
-   Revalidação após restart.
-   Consulta do estado via IPC.
-   Bloqueio de serviço de negócio.
-   Permissões administrativas.

### UI

-   Estado sem licença.
-   Estado válido.
-   Estado expirado.
-   Importação bem-sucedida.
-   Importação inválida.
-   Confirmação de remoção.
-   Módulo não licenciado.

## 19. Fora do âmbito desta versão

-   API ou servidor central de licenciamento.
-   Dashboard externo.
-   Activação online.
-   Revogação remota.
-   Pagamentos e facturação automática.
-   Subscrições geridas automaticamente.
-   Portal de cliente.
-   Sincronização cloud.
-   Gestão remota de dispositivos.
-   Licenciamento SaaS/Web.
-   Reescrita da arquitectura do ERP.
-   Alteração não relacionada dos módulos existentes.

## 20. Regra de execução para os agentes

Antes de escrever código:

1.  Ler `package.json`, estrutura de pastas, `schema.prisma`, migrations
    e configuração do Electron.
2.  Identificar como funcionam actualmente Main, Preload, IPC e
    Renderer.
3.  Identificar a página e navegação de Administração de Configurações.
4.  Identificar o catálogo real de módulos e os pontos de entrada dos
    respectivos serviços.
5.  Identificar o RBAC/permissões e a auditoria existentes.
6.  Apresentar um resumo da arquitectura encontrada e um plano de
    alterações sem modificar ficheiros.
7.  Só depois implementar, por fases, preservando convenções existentes.

Se qualquer pressuposto deste documento divergir do código real, não
criar uma segunda arquitectura. Documentar a divergência e adaptar a
implementação ao padrão existente, mantendo as restrições obrigatórias.
