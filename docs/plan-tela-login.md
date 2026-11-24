# Plano: redesign da tela de login

## 1. Objetivo

Redesenhar somente a tela pública de login do ERP, tomando o ficheiro visual fornecido como referência principal.

- Arquivo principal: `src/renderer/src/pages/login.tsx`
- Referência visual: `docs/1 - Tela.png` (1298×620)
- Fonte dos módulos: `src/renderer/src/pages/inicio.tsx` (painel “Módulos Disponíveis”)
- Nome do produto: `SOC TECHNO`, identidade já usada no breadcrumb do ERP e no rodapé da aplicação
- Modo do ecrã: operação/autenticação
- Resultado esperado: uma tela de entrada corporativa, dividida em painel informativo e painel de login, em Português de Angola
- Nenhum ficheiro de autenticação, rota ou regra de acesso deve ser alterado apenas para efeitos visuais

## 2. Direção visual aprovada

Manter a linguagem do ERP existente, mas aplicar a composição da referência:

- Layout desktop em duas metades proporcionais
- Painel esquerdo com identidade do produto, proposta de valor e cartões de módulos
- Painel direito escuro e focado no formulário de acesso
- Azul turquesa/ciano como cor de ação
- Azul escuro como fundo principal
- Tipografia limpa, legível e com hierarquia forte
- Bordas discretas, superfícies translúcidas e profundidade controlada
- Sem gradientes excessivos, efeitos decorativos aleatórios ou imagens externas

Verificação da imagem de referência (amostragem de pixels):

- Painel esquerdo: turquesa dominante `#088392`
- Painel direito: escuro `#0B101F`
- Acento de ação: ciano/turquesa
- A referência usa “Hospitality OS”, mas a implementação deve usar a identidade real do ERP (`SOC TECHNO`)

Decisão de cor aprovada: manter o painel esquerdo com o azul profundo da marca existente e tornar o painel direito **um pouco mais claro**, usando o fundo escuro do sistema (`--background` do bloco `.dark`, aproximadamente `#0f172a`) em vez de `#020617`. O objetivo é acompanhar o sistema sem criar um tema paralelo nem alterar as outras páginas.

Usar os componentes, tokens, utilidades Tailwind e variáveis já existentes no projeto. Não criar um sistema visual paralelo para esta tela.

## 3. Composição desktop

### Painel esquerdo

O painel ocupa aproximadamente metade da largura em ecrãs amplos.

Estrutura:

1. Cabeçalho com ícone quadrado “ST”, nome “SOC TECHNO” e etiqueta “ERP · Angola”
2. Título principal em destaque:
   - “A plataforma operacional”
   - “para o seu negócio em Angola.”
3. Texto introdutório sobre vendas, stock, compras, finanças, fiscal e relatórios
4. Grade de sete cartões de módulos, com nomes e descrições retirados de `inicio.tsx`:
   - Vendas & Faturação — emissão de faturas, recibos, notas de crédito e consulta de documentos fiscais
   - Compras & Fornecedores — encomendas, receção de mercadorias e catálogo de fornecedores
   - Stock & Armazéns — inventário permanente, movimentações de stock e lotes/artigos
   - Finanças & Tesouraria — contas bancárias, extratos, reconciliação e pagamentos
   - Comercial & Clientes — fichas de clientes, crédito comercial e condições de pagamento
   - Fiscal & SAF-T (PT/AO) — exportação SAF-T, fecho de períodos e conformidade tributária
   - Relatórios & Análise — mapas de vendas, balancetes de stock, rentabilidade e exportações
5. Rodapé com copyright e direitos reservados

Cada cartão deve conter:

- Ícone lucide relacionado ao módulo
- Título
- Descrição curta
- Etiqueta “MVP”
- Estados visual de hover discretos

Não representar os módulos como ações funcionais. Os cartões são elementos informativos e não devem navegar para outra página.

### Painel direito

O painel ocupa a outra metade e centraliza o formulário.

Estrutura:

1. Indicador pequeno “Servidor Luanda” no topo direito
2. Cabeçalho:
   - “Bem-vindo de volta”
   - “Introduza as suas credenciais para aceder ao sistema.”
3. Campo Utilizador
4. Campo Senha
5. Alternância “Lembrar-me” ou manter a redação existente “Manter a sessão iniciada”
6. Ação “Esqueceu-se da senha?”
7. Botão principal “Entrar no Sistema”
8. Rodapé com versão, estado sincronizado e informação de segurança

O layout visual deve manter o fluxo atual de autenticação: o utilizador continua a ser identificado pelo campo `utilizador`, não por email. A imagem de referência mostra a etiqueta `EMAIL`, mas essa etiqueta não deve ser copiada: alterá-la quebraria o contrato do `useAuth().login({ utilizador, senha })`.

## 4. Estados obrigatórios

A implementação deve cobrir os seguintes estados sem alterar o contrato atual da API:

- Estado inicial vazio
- Utilizador focado
- Senha visível e oculta
- Estado de carregamento durante o login
- Erro de validação do formulário
- Erro de autenticação retornado pelo hook
- Sucesso e navegação para `/inicio`
- Estado de senha esquecida com feedback existente via toast

Usar `aria-live` ou o padrão já adotado pelo projeto para mensagens de erro onde aplicável.

## 5. Comportamento existente a preservar

Não modificar estas partes do fluxo:

- `useAuth().login({ utilizador, senha })`
- Validação Zod atual
- Mensagens de erro existentes
- Toast de sucesso com o nome do utilizador
- Toast de erro com a mensagem retornada pela autenticação
- Navegação para `/inicio` após autenticação bem-sucedida
- HashRouter, Electron e carregamento do ficheiro `login.tsx`

O checkbox de manter a sessão existe visualmente, mas não está ligado ao backend. Não inventar persistência, cookie ou armazenamento local neste redesign. O agente deve manter o comportamento atual até haver uma decisão funcional separada.

## 6. Responsividade e adaptação

### Desktop amplo

- Layout lado a lado, entre 50/50 e 46/54 conforme o tamanho da janela
- Altura mínima igual à viewport
- Cabeçalho, conteúdo central e rodapé distribuídos sem overflow

### Janelas estreitas

- Remover ou compactar o painel informativo quando o espaço não permitir uma leitura clara
- Priorizar o formulário
- Preservar margens laterais adequadas
- Desativar ou reduzir elementos decorativos
- Manter tamanho mínimo útil para os campos e botões

### Eletron / tamanho de ecrã variável

- Evitar valores fixos que possam cortar os blocos em janelas pequenas
- Usar flex/grid responsivo, clamp apenas onde necessário e scroll quando absolutamente necessário
- Testar pelo menos 1280×720, 1024×768 e uma janela estreita

Não exigir um modo mobile separado se o mesmo componente puder adaptar-se corretamente dentro dos limites da aplicação desktop.

## 7. Acessibilidade

- Toda a ação deve ser operável por teclado
- Inputs com labels associados por `htmlFor`
- Placeholder não substitui label
- Botão de mostrar senha deve ter `aria-label` dinâmico
- Checkbox deve continuar clicável pelo texto do label
- Estados de loading devem indicar que o botão está ocupado
- Ícones decorativos devem ser omitidos da árvore acessível
- Contraste mínimo adequado para texto secundário sobre superfícies escuras
- Foco visível consistente com os tokens existentes
- Não usar apenas cor para mostrar erro ou estado

## 8. Implementação em fases

### Fase 1 — Estrutura visual

1. Substituir o card único atual por uma estrutura de duas áreas
2. Criar o painel de marca e conteúdo do ERP
3. Criar a grade de cartões dos módulos
4. Reorganizar o formulário dentro da área escura
5. Preservar todos os bindings existentes do React Hook Form

### Fase 2 — Estilo

1. Reutilizar as variáveis semânticas de `src/renderer/src/styles.css`
2. Usar Inter, já definida no projeto
3. Aplicar os ícones Lucide já instalados
4. Evitar adicionar arquivos de imagem ou assets externos
5. Não alterar os tokens globais se a tela puder usar as classes existentes

### Fase 3 — Estados e detalhes

1. Ajustar os estados de validação
2. Melhorar a hierarquia dos rótulos e feedback
3. Preservar loading, toasts e navegação
4. Adicionar animações apenas em entradas e transições leves
5. Reduzir ou remover animações em `prefers-reduced-motion`

### Fase 4 — Verificação

1. Executar typecheck web
2. Executar lint
3. Executar testes unitários relacionados à autenticação
4. Executar build da aplicação
5. Abrir a tela no Electron em diferentes dimensões
6. Comparar visualmente com a referência fornecida

## 9. Reutilização permitida

Pode reutilizar:

- `Button`
- `Input`
- `Label`
- Toaster Sonner
- Hook `useAuth`
- React Hook Form
- Zod
- Lucide
- Variáveis de `styles.css`
- Utilidades Tailwind existentes

Evitar criar componentes isolados desnecessários. A alteração pode ficar concentrada em `login.tsx`, a menos que surja uma necessidade real de extração.

## 10. Arquivos esperados

### Alteração provável

- `src/renderer/src/pages/login.tsx`

### Possível alteração apenas se necessário

- `src/renderer/src/styles.css`, somente para classes ou tokens verdadeiramente reutilizáveis
- `src/renderer/index.html`, apenas para o atributo `lang="pt-AO"`, já aplicado na verificação de acessibilidade

### Arquivos que não devem mudar

- `src/renderer/src/hooks/useAuth.ts`
- `src/renderer/src/api/auth.api.ts`
- `src/main/services/auth.service.ts`
- `src/main/validators/auth.validator.ts`
- `src/renderer/src/App.tsx`

## 11. Critérios de conclusão

A tela está concluída quando:

- A composição em duas áreas corresponde à referência em desktop
- A hierarquia visual concentra atenção no formulário sem perder o contexto do produto
- A tela continua autenticando exatamente pelo fluxo atual
- Todos os estados de sucesso e erro continuam funcionais
- Não existe overflow em larguras usadas pela aplicação
- Campos, labels, foco e botões são acessíveis por teclado
- A versão e o copyright são legíveis
- Não há erro de TypeScript
- Não há novas regressões nos testes
- A tela mantém o visual escuro da referência sem quebrar o tema global de outras páginas

## 12. Limites

Não implementar nesta tarefa:

- Recuperação real de senha
- Persistência do checkbox “manter sessão”
- Novo backend ou novo endpoint de login
- Configuração de servidor Luanda em tempo real
- Mudança de marca global
- Novos assets comerciais
- Rotas adicionais
- Alterações no ERP principal fora da tela de login
