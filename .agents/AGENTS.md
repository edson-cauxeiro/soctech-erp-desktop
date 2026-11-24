# AGENTS.md — Guia para Agentes (Módulo de Recursos Humanos)

> Leia este ficheiro **por inteiro** antes de escrever qualquer código.
> Depois leia, por esta ordem, os documentos em `docs/rh/`:
> 1. `01-especificacao-tecnica.md` — o quê e porquê
> 2. `04-modelo-de-dados.md` — entidades, enums, schema Prisma
> 3. `02-plano-implementacao.md` — fases e ordem
> 4. `03-tasks.md` — tarefas atómicas com critérios de aceitação

---

## 1. Contexto do projecto

Temos um **ERP desktop** que já possui os módulos **Vendas, Finanças, Compras, Stock e Comercial**.
Estamos a **acrescentar apenas o módulo de Recursos Humanos (RH)**, com foco em **Salários e Honorários**
(processamento salarial, recibos, pagamentos, subsídios, férias, ausências, dívidas/penhoras e independentes).

**Importante:**
- **Não crie um novo projecto.** Trabalhe dentro do repositório existente.
- **Não reescreva módulos existentes.** Integre-se com eles (ver §7).
- O mercado-alvo é **Angola**: moeda **Kwanza (AOA)**, **IRT**, **INSS**, Lei Geral do Trabalho. Textos de UI em **português (pt-AO)**.

## 2. Stack (obrigatória)

| Camada | Tecnologia |
|---|---|
| Desktop shell | **Electron.js** (processo `main` + `preload` + `renderer`) |
| UI | **React.js** + **Tailwind CSS** + **shadcn/ui** |
| Estado (cliente) | **Zustand** |
| Validação | **Zod** (schemas partilhados entre `main` e `renderer`) |
| Acesso a dados | **Prisma** (apenas no processo `main`) |

Não introduza novas bibliotecas de estado, UI, ORM ou validação sem justificação escrita.
Bibliotecas auxiliares permitidas **se ainda não existirem**: `decimal.js` (aritmética monetária), `date-fns`, `@tanstack/react-table`, `react-hook-form` + `@hookform/resolvers/zod`.
Antes de adicionar qualquer uma, verifique o `package.json`.

## 3. Regra zero: descobrir antes de criar

Eu (o autor deste guia) **não vi a estrutura real do repositório**. A estrutura abaixo é a **proposta de destino**.
Antes da primeira alteração, o agente **deve**:

1. Listar a árvore de pastas (2–3 níveis) e identificar onde vivem: módulos existentes (ex.: vendas), IPC, schemas Zod, stores Zustand, componentes partilhados, `schema.prisma`, migrations.
2. Escolher **um módulo existente como referência** (ex.: `compras`) e **copiar as suas convenções** (nomes, camadas, tratamento de erros, formato de resposta IPC, permissões, auditoria, tradução).
3. Se a estrutura real divergir da proposta, **a estrutura real ganha**. Registar a decisão em `docs/rh/DECISOES.md` (ADR curto: contexto, decisão, consequência).
4. Descobrir: tipo de BD (SQLite/Postgres/…), estratégia de IDs (`cuid`/`uuid`/`autoincrement`), como é feita a autenticação/permissões, como se gera PDF/impressão, como é o log de auditoria, como se acede a contas bancárias e lançamentos em Finanças.

## 4. Estrutura de pastas (proposta — adaptar à real)

```
.
├── AGENTS.md
├── docs/rh/
│   ├── 01-especificacao-tecnica.md
│   ├── 02-plano-implementacao.md
│   ├── 03-tasks.md
│   ├── 04-modelo-de-dados.md
│   └── DECISOES.md                  # ADRs (criar quando necessário)
├── prisma/
│   ├── schema.prisma                # acrescentar modelos Rh* (não criar 2º schema)
│   └── seeds/rh/                    # rubricas, tabelas IRT/INSS, tipos de ausência
└── src/
    ├── main/                        # processo Electron main
    │   ├── ipc/rh/                  # handlers IPC (finos: validam e delegam)
    │   ├── modules/rh/
    │   │   ├── funcionarios/        # service + repository
    │   │   ├── contratos/
    │   │   ├── rubricas/
    │   │   ├── alteracoes-mensais/
    │   │   ├── processamento/
    │   │   │   ├── engine/          # motor de cálculo (PURO, sem Prisma)
    │   │   │   ├── calculators/     # vencimento, sub-ferias, sub-natal, extraordinario, fim-contrato
    │   │   │   ├── processamento.service.ts
    │   │   │   └── lote.service.ts
    │   │   ├── recibos/
    │   │   ├── pagamentos/
    │   │   ├── assiduidade/         # ferias, ausencias, horas extra, afetacoes
    │   │   ├── dividas/             # processos de dívida, penhoras, adiantamentos
    │   │   ├── retroativos/
    │   │   ├── independentes/       # honorários
    │   │   └── parametros-fiscais/  # IRT, INSS
    │   └── ...
    ├── preload/                     # expor API tipada: window.api.rh.*
    ├── shared/
    │   └── rh/
    │       ├── schemas/             # Zod (fonte única de verdade dos DTOs)
    │       ├── types/               # tipos inferidos (z.infer)
    │       ├── enums.ts
    │       └── constants.ts
    └── renderer/
        ├── features/rh/
        │   ├── funcionarios/        # pages/, components/, hooks/, store.ts
        │   ├── processamento/
        │   ├── recibos/
        │   ├── pagamentos/
        │   ├── assiduidade/
        │   ├── dividas/
        │   ├── independentes/
        │   └── configuracao/
        ├── components/ui/           # shadcn (já existente — NÃO duplicar)
        └── routes/rh.tsx            # rotas do módulo (lazy)
```

## 5. Arquitectura e regras de código

### 5.1 Camadas (de fora para dentro)
`renderer (React/Zustand)` → `preload (window.api.rh)` → `ipc handler (valida com Zod)` → `service (regras de negócio, transacções)` → `repository (Prisma)`; o **motor de cálculo** é uma biblioteca **pura** chamada pelo service.

- **Prisma só no `main`.** O `renderer` **nunca** importa `@prisma/client`.
- **Todo o IPC**: input validado com Zod no handler; output no formato padrão do projecto (ex.: `{ ok: true, data } | { ok: false, error: { code, message, details? } }`). Se o projecto já tem um formato, **use-o**.
- **Schemas Zod em `src/shared/rh/schemas`**; tipos TS via `z.infer`. Proibido duplicar tipos à mão.
- **Handlers finos**, services com a lógica, repositories só com queries.
- **Transacções**: processar/anular/lote/pagamento usam `prisma.$transaction`. Lote: uma transacção **por funcionário** (falha de um não anula os outros) + registo do resultado por funcionário.
- **Dinheiro**: nunca `number` para cálculo. Usar `Decimal` (Prisma `Decimal` + `decimal.js`), arredondar a **2 casas** (half-up) **apenas** no fim de cada rubrica e documentar. Valores nos DTOs viajam como **string decimal**.
- **Datas**: guardar em UTC; "data de processamento"/vencimentos como `DateTime` normalizada ao dia. Períodos mensais: `ano` + `mes`.
- **Soft-delete / anulação** em vez de `DELETE` para tudo o que tem efeito financeiro (processamentos, recibos, pagamentos). Nunca apagar histórico.
- **Auditoria**: toda a escrita relevante regista utilizador, acção, entidade, antes/depois (use o mecanismo existente).
- **Permissões**: cada acção protegida por permissão `rh.<recurso>.<acção>` (ver spec §9). Dados salariais são **sensíveis**.
- **Idempotência**: processar o mesmo (funcionário, período, tipo) duas vezes **não** pode duplicar; devolve erro de negócio claro.

### 5.2 Motor de cálculo (crítico)
- Vive em `modules/rh/processamento/engine` e **não importa Prisma, Electron nem React**.
- Assinatura: `calcular(input: EntradaCalculo): ResultadoCalculo` (função determinística).
- Cada tipo de processamento tem um *calculator* próprio, composto pelo engine.
- **Testes unitários obrigatórios** (ver §8) com casos de IRT por escalão, INSS, faltas, horas extra, proporcionais e fim de contrato.
- Parâmetros fiscais (escalões IRT, taxas INSS, %) **vêm da BD com data de vigência** — **nunca hard-coded**.

### 5.3 Frontend
- Uma *feature* por pasta; cada feature tem `pages/`, `components/`, `hooks/`, `store.ts`.
- **Zustand**: um store por feature, só para estado de UI/sessão da feature (filtros, selecção, rascunhos). **Dados do servidor** são pedidos via IPC por hooks (`useXxx`) e guardados no store apenas se necessário a várias vistas.
- **Formulários**: `react-hook-form` + `zodResolver` com os schemas de `shared/rh/schemas`.
- **Tabelas**: shadcn `Table` + TanStack Table (ordenar, filtrar, selecção por linha com checkbox, virtualização se > 500 linhas).
- **Idioma**: todas as strings em pt-AO, via o mecanismo i18n existente (ou constantes centralizadas se não houver).
- **Formatação**: moeda `Intl.NumberFormat('pt-AO', { style:'currency', currency:'AOA' })`; datas `dd/MM/yyyy`.
- **Acessibilidade e teclado**: o utilizador de RH trabalha muito com teclado — Tab order lógico, Enter submete, Esc cancela, atalhos nos botões da barra (Actualizar, Processar, Ajuda, Cancelar).

## 6. Design do sistema (UI)

O desenho base vem das capturas fornecidas pelo RH (sistema de referência com *ribbon*). Respeitar a **organização**, adaptando o visual ao tema/shadcn já usado pelo ERP.

### 6.1 Navegação do módulo (ribbon / menu)
Separadores principais: **Geral · Salários e Honorários · Capital Humano · Obrigações Declarativas**.

Separador **Salários e Honorários**, por grupos:

| Grupo | Itens |
|---|---|
| **Salários** | Funcionários · Alterações Mensais · Processamento · Pagamentos · Recibos · Simulação |
| **Assiduidade** | Marcação de Férias · Ausências · Afetações |
| **Processamento** | Gestão Contratual · Processos de Dívida · Retroativos · Outros |
| **Honorários** | Independentes · Atividades · Processamento · Pagamentos |
| **Exploração** | (relatórios/mapas — fase posterior) |
| **Recursos** | (documentos/ajuda/ficheiros — fase posterior) |

> Os separadores **Capital Humano** e **Obrigações Declarativas** ficam **fora do âmbito inicial**; criar apenas a rota/placeholder.
> Integrar no menu/sidebar existente do ERP como entrada "Recursos Humanos"; o *ribbon* pode ser implementado como barra de grupos com ícones (shadcn `Tabs` + botões) **dentro** da área do módulo.

### 6.2 Ecrã de Processamento (referência principal)
Estrutura vertical:

1. **Barra de acções**: `Actualizar` · `Processar` · `Contexto ▾` · `Ajuda` · `Cancelar`.
2. **Operação**: select (`Processar` | `Anular processamento`).
3. **Tipos** (checkboxes, combináveis): `Vencimento` · `Subsídio de Férias` · `Subsídio de Natal` · `Extraordinário` · `Fim de Contrato`; mais checkbox **"Processar funcionários com data de fim de contrato"**.
4. **Parâmetros**: `Ano` (spin) · `Período` (código, ex.: `P01`, + descrição "Mensal") · `Mês` (select) · `Dias proc.` (spin, ex.: 21) · `Data` (processamento) · `Faltas/H.Extra` (data limite de recolha de faltas e horas extra).
5. **Separadores inferiores**: `Processamentos` · `Restrições` · `Remunerações/Descontos/Taxas Cambiais`.
6. **Grelha** (separador Processamentos): coluna `P` (checkbox de selecção), `Funcionário` (código), `Nome`, `Tipo Processamento` (ex.: "Venc."). Selecção em massa; ordenar por código/nome.

Comportamento:
- `Actualizar` recarrega a lista de funcionários elegíveis para os parâmetros escolhidos.
- `Restrições` lista funcionários **excluídos/bloqueados** e o motivo (sem contrato activo, já processado, falta de dados, em suspensão…).
- `Remunerações/Descontos/Taxas Cambiais` mostra rubricas aplicáveis e a taxa de câmbio por moeda (para salários indexados a moeda estrangeira).
- `Processar` pede confirmação com resumo (nº de funcionários, tipos, total estimado) e depois corre em lote com **barra de progresso** e relatório final (sucessos/erros por funcionário).
- **Individual** vs **Em Lote**: ver spec §5. O ecrã serve os dois (1 seleccionado = individual).

### 6.3 Princípios visuais
- Densidade média/alta (é software de back-office): tabelas compactas, formulários em grelha de 2–4 colunas.
- Campos obrigatórios marcados; erros inline vindos do Zod.
- Estados vazios, *skeletons* e erros tratados em todas as listas.
- Acções destrutivas (anular, cessar contrato) com diálogo de confirmação e motivo obrigatório.
- Reutilizar componentes partilhados do ERP (DataTable, PageHeader, ConfirmDialog, DatePicker, CurrencyInput) antes de criar novos.

## 7. Integração com módulos existentes

| Módulo | Integração (ler primeiro como está feito hoje) |
|---|---|
| **Finanças** | Pagamentos de salários saem de **contas bancárias/caixa** existentes; processamento gera **lançamentos/provisões** (salários, INSS, IRT a pagar). Usar a API/serviço de Finanças; **não** escrever directamente nas suas tabelas. |
| **Utilizadores/Permissões** | Criar permissões `rh.*` e associá-las aos perfis existentes. |
| **Comercial/Vendas** | (Opcional, fase tardia) comissões de vendedores como rubrica variável. |
| **Centros de custo/Projectos** (se existirem) | Usar em `Afetações` (rateio de custo salarial). |
| **Empresa/Filial** | Se o ERP é multi-empresa, **todas** as tabelas Rh* carregam `empresaId` conforme a convenção existente. |

Onde o modelo de dados usa `// EXT:` há referência a entidade externa: **ligar à entidade real** após a descoberta (§3).

## 8. Qualidade e Definition of Done

Uma tarefa só está **concluída** quando:
- [ ] Cumpre os **critérios de aceitação** da task em `03-tasks.md`.
- [ ] TypeScript sem erros (`strict`), lint e *format* limpos.
- [ ] Zod no IPC e no formulário (mesmo schema).
- [ ] **Testes**: motor de cálculo e services com testes unitários; fluxos críticos (processar, anular, lote, pagamento) com teste de integração sobre BD de teste. Cobertura mínima do motor: **≥ 90%** de ramos.
- [ ] Migração Prisma criada, **reversível/segura**, com seed quando aplicável.
- [ ] Permissões e auditoria aplicadas.
- [ ] UI: estados loading/vazio/erro, teclado, strings pt-AO.
- [ ] Sem `any`, sem `console.log` esquecidos, sem segredos.
- [ ] Documentação actualizada (`docs/rh/*`, ADR se houve decisão).

## 9. Proibições

- ❌ Criar outro projecto/monorepo/pacote paralelo para RH.
- ❌ Importar Prisma no renderer; expor `ipcRenderer` cru ao renderer (use `contextBridge` com API tipada).
- ❌ Usar `number`/`float` para dinheiro.
- ❌ Hard-code de taxas IRT/INSS/percentagens legais.
- ❌ `DELETE` físico em dados com efeito financeiro.
- ❌ Alterar modelos/tabelas de outros módulos sem aprovação explícita.
- ❌ Inventar regras legais: se faltar informação, **registar como pergunta em aberto** (spec §13) e usar parâmetro configurável.
- ❌ Instalar dependências pesadas ou duplicar componentes shadcn.

## 10. Como trabalhar (fluxo recomendado)

1. Ler este guia + `docs/rh/*`.
2. Escolher a próxima task **não bloqueada** em `03-tasks.md` (respeitar dependências e fase).
3. Fazer *discovery* local (§3) se ainda não feito.
4. Implementar em *commits* pequenos: `feat(rh): …`, `fix(rh): …`, `test(rh): …`, `docs(rh): …`.
5. Marcar a task como feita no próprio `03-tasks.md` (`[x]`) com nota de decisões relevantes.
6. Em caso de ambiguidade de negócio: **parar, listar a dúvida** em `docs/rh/DECISOES.md` (secção "Em aberto") e avançar com a opção parametrizável mais segura.

## 11. Glossário rápido

| Termo | Significado |
|---|---|
| **Vencimento** | Salário mensal (base + subsídios fixos + variáveis − descontos) |
| **Subsídio de Férias / Natal** | Remunerações adicionais legais (percentagem do salário, parametrizável) |
| **Extraordinário** | Remuneração extraordinária pontual (prémios, bónus, etc.) |
| **Fim de Contrato** | Acerto final na cessação (dias trabalhados, férias não gozadas, proporcionais…) |
| **IRT** | Imposto sobre os Rendimentos do Trabalho (escalões progressivos) |
| **INSS** | Segurança Social (trabalhador + entidade patronal) |
| **Rubrica** | Linha de remuneração, desconto ou encargo num processamento |
| **Período** | Mês de processamento (ex.: `P01` Mensal) |
| **Lote** | Processamento de vários funcionários em simultâneo |
| **Anulação** | Reversão de um processamento (mantém histórico) |
| **Independente** | Prestador pago por **honorários** (sem vínculo laboral) |
| **Afetação** | Imputação do custo do funcionário a centro de custo/projecto |
| **Penhora** | Desconto judicial obrigatório no salário |
