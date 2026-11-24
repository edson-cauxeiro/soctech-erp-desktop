# Associar conta contabilística em contas bancárias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir criar e editar contas bancárias/caixas com uma conta contabilística opcional da mesma empresa.

**Architecture:** Endpoint dedicado de Tesouraria fornece contas contabilísticas elegíveis e ainda não usadas; o formulário usa esse endpoint num `SearchSelect`, e o serviço de escrita valida empresa, estado, elegibilidade e unicidade antes de gravar `contaContabilId`.

**Tech Stack:** TypeScript, Electron IPC, React + react-hook-form + zod, Prisma, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-associar-conta-contabilistica-contas-bancarias-design.md`

## Global Constraints

- Não alterar `prisma/schema.prisma`, migrações ou seeds; `ContaBancaria.contaContabilId` já existe e é opcional.
- A associação é opcional: `null`/string vazia limpa a ligação.
- O selector mostra apenas contas com `empresaId` da sessão, `activa = true` e `aceitaMovimento = true`.
- Contas já ligadas a outra conta bancária ficam ocultas; na edição, a conta actualmente ligada à conta em edição continua visível.
- Erros de escrita usam `NotFoundError`, `BusinessRuleError` ou `ConflictError` conforme o caso, e são mostrados no diálogo sem o fechar.
- O directório actual não é repositório Git; não executar passos de commit até existir repositório.

## Review Focus

- Conta contabilística de outra empresa — deve ser rejeitada com `Conta contabilística não encontrada.` — teste em Task 2, Step 4.
- Conta contabilística inactiva ou sem movimento — deve ser rejeitada com `A conta contabilística não aceita movimentos.` — teste em Task 2, Step 4.
- Conta contabilística já ligada a outra conta bancária — deve ser rejeitada com `Esta conta contabilística já está associada a outra conta bancária.` — teste em Task 2, Step 4.
- Conta ligada à conta em edição — deve continuar visível nas opções — teste em Task 2, Step 2.
- Limpeza da associação — `contaContabilId: null` na edição deve gravar `null` — teste em Task 2, Step 6.

---

### Task 1: Contratos de validação e tipos IPC

**Files:**
- Modify: `src/main/validators/tesouraria.validator.ts`
- Create: `src/main/validators/tesouraria.validator.test.ts`
- Modify: `src/renderer/src/@types/electron.d.ts`

**Interfaces:**
- Consumes: `idObrigatorio`, `idOpcional` de `tesouraria.validator.ts`.
- Produces:
  - `contasContabeisDisponiveisSchema`, tipo `ContasContabeisDisponiveisInput`.
  - `ContaBancariaCriarInput.contaContabilId?: string | null`.
  - `ContaBancariaDto.contaContabilId?: string | null`.
  - `ContaContabilDisponivelDto` com `{ id: string; codigo: string; designacao: string; natureza: 'devedora' | 'credora' }`.

- [ ] **Step 1: Escrever teste quebra-galho para `idOpcional` e para o novo campo**

Em `src/main/validators/tesouraria.validator.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  criarContaBancariaSchema,
  atualizarContaBancariaSchema,
  contasContabeisDisponiveisSchema,
} from './tesouraria.validator';

const base = {
  empresaId: 'emp-1',
  codigo: 'BANC-01',
  designacao: 'Banco Principal',
  tipo: 'banco' as const,
  iban: 'AO06 0000 0000 0000 0000 0000 0',
};

describe('associação contabilística de contas bancárias', () => {
  it('aceita contaContabilId na criação e na edição', () => {
    expect(criarContaBancariaSchema.parse({ ...base, contaContabilId: 'cc-1' }).contaContabilId).toBe('cc-1');
    expect(
      atualizarContaBancariaSchema.parse({ empresaId: 'emp-1', contaContabilId: null }).contaContabilId
    ).toBeNull();
  });

  it('transforma string vazia em null', () => {
    expect(criarContaBancariaSchema.parse({ ...base, contaContabilId: '' }).contaContabilId).toBeNull();
  });

  it('exige empresa no endpoint de opções', () => {
    expect(() => contasContabeisDisponiveisSchema.parse({})).toThrow();
    expect(
      contasContabeisDisponiveisSchema.parse({ empresaId: 'emp-1', contaBancariaId: 'cb-1' })
    ).toEqual({ empresaId: 'emp-1', contaBancariaId: 'cb-1' });
  });
});
```

- [ ] **Step 2: Executar o teste e confirmar falha**

Run: `npx vitest run src/main/validators/tesouraria.validator.test.ts`
Expected: FAIL — `contasContabeisDisponiveisSchema` não existe e `contaContabilId` não é aceite.

- [ ] **Step 3: Implementar os schemas**

Em `src/main/validators/tesouraria.validator.ts`:
- alterar `idOpcional` para `z.string().trim().nullish().transform((v) => (v ? v : null))`, preservando os consumidores existentes;
- adicionar `contaContabilId: idOpcional` a `criarContaBancariaSchema` e `atualizarContaBancariaSchema`;
- adicionar `contasContabeisDisponiveisSchema = z.object({ empresaId: idObrigatorio('A empresa'), contaBancariaId: z.string().trim().min(1).optional() })`;
- exportar `type ContasContabeisDisponiveisInput = z.infer<typeof contasContabeisDisponiveisSchema>`.

- [ ] **Step 4: Atualizar tipos do renderer**

Em `src/renderer/src/@types/electron.d.ts`:
- adicionar `contaContabilId?: string | null` a `ContaBancariaDto` e `ContaBancariaCriarInput`;
- criar `export interface ContaContabilDisponivelDto { id: string; codigo: string; designacao: string; natureza: 'devedora' | 'credora'; }`;
- adicionar `listarContasContabeisDisponiveis: (empresaId: string, contaBancariaId?: string) => Promise<IpcResponse<ContaContabilDisponivelDto[]>>;` em `window.api.tesouraria`.

- [ ] **Step 5: Executar o teste e confirmar sucesso**

Run: `npx vitest run src/main/validators/tesouraria.validator.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit — não executar neste ambiente**

O directório não é repositório Git.

---

### Task 2: Serviço de Tesouraria — opções e escrita validada

**Files:**
- Modify: `src/main/services/contas-bancarias.service.ts`
- Modify: `src/main/services/contas-bancarias.service.test.ts`

**Interfaces:**
- Consumes: `ContasContabeisDisponiveisInput`, `CriarContaBancariaInput`, `AtualizarContaBancariaInput`.
- Produces:
  - `listarContasContabeisDisponiveis(rawInput: unknown): Promise<Array<{ id: string; codigo: string; designacao: string; natureza: NaturezaConta }>>`;
  - `criar(rawInput)` e `atualizar(id, rawInput)` passam a gravar `contaContabilId`.

- [ ] **Step 1: Escrever testes falhantes de listagem**

Em `src/main/services/contas-bancarias.service.test.ts`, dentro de `describe('contas contabilísticas disponíveis')`:

```ts
it('devolve só contas activas, com movimento, da empresa e não usadas', async () => {
  mockPrisma.contaContabil.findMany.mockResolvedValue([
    { id: 'cc-1', codigo: '101', designacao: 'Banco', activa: true, aceitaMovimento: true, natureza: 'devedora' },
    { id: 'cc-2', codigo: '102', designacao: 'Caixa', activa: true, aceitaMovimento: true, natureza: 'devedora' },
    { id: 'cc-3', codigo: '103', designacao: 'Agrupamento', activa: true, aceitaMovimento: false, natureza: 'devedora' },
    { id: 'cc-4', codigo: '104', designacao: 'Inactiva', activa: false, aceitaMovimento: true, natureza: 'devedora' },
  ]);
  mockPrisma.contaBancaria.findMany.mockResolvedValue([
    { id: 'cb-1', contaContabilId: 'cc-2' },
  ]);

  const opcoes = await service.listarContasContabeisDisponiveis({ empresaId: 'emp-1' });

  expect(opcoes.map((o) => o.id)).toEqual(['cc-1']);
});

it('inclui a conta actualmente ligada quando se edita essa conta bancária', async () => {
  mockPrisma.contaContabil.findMany.mockResolvedValue([
    { id: 'cc-1', codigo: '101', designacao: 'Banco', activa: true, aceitaMovimento: true, natureza: 'devedora' },
  ]);
  mockPrisma.contaBancaria.findMany.mockResolvedValue([
    { id: 'cb-1', contaContabilId: 'cc-1' },
  ]);

  const opcoes = await service.listarContasContabeisDisponiveis({ empresaId: 'emp-1', contaBancariaId: 'cb-1' });

  expect(opcoes.map((o) => o.id)).toEqual(['cc-1']);
});
```

- [ ] **Step 2: Executar testes e confirmar falha**

Run: `npx vitest run src/main/services/contas-bancarias.service.test.ts`
Expected: FAIL — `listarContasContabeisDisponiveis` não existe.

- [ ] **Step 3: Implementar listagem**

Em `src/main/services/contas-bancarias.service.ts`:
- importar `NaturezaConta` do `@prisma/client` e `contasContabeisDisponiveisSchema`/`ContasContabeisDisponiveisInput`;
- implementar `listarContasContabeisDisponiveis(rawInput: unknown)` com `findMany` em `contaContabil` usando `where: { empresaId, activa: true, aceitaMovimento: true }`, `select: { id, codigo, designacao, natureza }`, `orderBy: { codigo: 'asc' }`;
- consultar `contaBancaria.findMany` com `where: { empresaId, contaContabilId: { not: null } }`, `select: { id, contaContabilId }`;
- montar `usadas` com os `contaContabilId` cujo `id !== contaBancariaId`;
- devolver apenas contas cujo `id` não esteja em `usadas`.

- [ ] **Step 4: Escrever testes falhantes de validação na escrita**

Definir no topo do ficheiro de teste de serviço:

```ts
const base = {
  empresaId: 'emp-1',
  codigo: 'BANC-01',
  designacao: 'Banco Principal',
  tipo: 'banco' as const,
  iban: 'AO06 0000 0000 0000 0000 0000 0',
};
```

Depois adicionar:

```ts
it('grava contaContabilId na criação', async () => {
  mockPrisma.contaContabil.findFirst.mockResolvedValue({
    id: 'cc-1', empresaId: 'emp-1', activa: true, aceitaMovimento: true,
  });
  mockPrisma.contaBancaria.findFirst.mockResolvedValue(null);

  const conta = await service.criar({
    ...base, contaContabilId: 'cc-1',
  });

  expect(conta.contaContabilId).toBe('cc-1');
});

it('rejeita conta de outra empresa, inactiva, sem movimento e duplicada', async () => {
  const baseValid = { empresaId: 'emp-1', contaContabilId: 'cc-1' };

  mockPrisma.contaContabil.findFirst.mockResolvedValue(null);
  await expect(service.criar({ ...base, contaContabilId: 'cc-1' })).rejects.toThrow('Conta contabilística não encontrada.');

  mockPrisma.contaContabil.findFirst.mockResolvedValue({ ...baseValid, activa: false, aceitaMovimento: true });
  await expect(service.criar({ ...base, contaContabilId: 'cc-1' })).rejects.toThrow('A conta contabilística não aceita movimentos.');

  mockPrisma.contaContabil.findFirst.mockResolvedValue({ ...baseValid, activa: true, aceitaMovimento: false });
  await expect(service.criar({ ...base, contaContabilId: 'cc-1' })).rejects.toThrow('A conta contabilística não aceita movimentos.');

  mockPrisma.contaContabil.findFirst.mockResolvedValue({ ...baseValid, activa: true, aceitaMovimento: true });
  mockPrisma.contaBancaria.findFirst
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ id: 'cb-2', contaContabilId: 'cc-1' });
  await expect(service.criar({ ...base, contaContabilId: 'cc-1' })).rejects.toThrow(
    'Esta conta contabilística já está associada a outra conta bancária.'
  );
});
```

- [ ] **Step 5: Implementar validação na escrita**

Em `criar()` e `atualizar()` de `src/main/services/contas-bancarias.service.ts`:
- se `contaContabilId` for não nulo, chamar helper privado `validarContaContabil(empresaId, contaContabilId, contaBancariaId?)`;
- o helper usa `contaContabil.findFirst` com `{ id, empresaId }` e lança `NotFoundError('Conta contabilística não encontrada.')` quando ausente;
- lança `BusinessRuleError('A conta contabilística não aceita movimentos.')` quando `activa !== true` ou `aceitaMovimento !== true`;
- usa `contaBancaria.findFirst` com `where: { contaContabilId }` na criação ou `where: { contaContabilId, id: { not: contaBancariaId } }` na edição, e lança `ConflictError('Esta conta contabilística já está associada a outra conta bancária.')`;
- em `criar()`, incluir `contaContabilId: data.contaContabilId ?? null` em `data`;
- em `atualizar()`, incluir `contaContabilId` em `data` apenas quando a chave existir em `rawInput`.

- [ ] **Step 6: Escrever e verificar teste de limpeza da associação**

```ts
it('limpa contaContabilId na edição quando recebe null', async () => {
  mockPrisma.contaBancaria.findUnique.mockResolvedValue({
    id: 'c1', codigo: 'C1', designacao: 'Conta', tipo: 'banco', iban: 'AO06', empresaId: 'emp-1',
  });

  await service.atualizar('c1', { empresaId: 'emp-1', contaContabilId: null });

  expect(mockPrisma.contaBancaria.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ contaContabilId: null }) })
  );
});
```

Run: `npx vitest run src/main/services/contas-bancarias.service.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit — não executar neste ambiente**

O directório não é repositório Git.

---

### Task 3: Ligação IPC completa

**Files:**
- Modify: `src/main/controllers/tesouraria.controller.ts`
- Modify: `src/main/routers/tesouraria.router.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/api/tesouraria.api.ts`

**Interfaces:**
- Consumes: `ContasBancariasService.listarContasContabeisDisponiveis(rawInput)`.
- Produces: `tesourariaApi.listarContasContabeisDisponiveis(empresaId: string, contaBancariaId?: string)`.

- [ ] **Step 1: Adicionar controller**

Em `src/main/controllers/tesouraria.controller.ts`, adicionar:

```ts
async listarContasContabeisDisponiveis(
  empresaId: string,
  contaBancariaId?: string
): Promise<IpcResponse<unknown>> {
  return this.com('read', 'listar contas contabilísticas disponíveis', () =>
    this.contas.listarContasContabeisDisponiveis({ empresaId, contaBancariaId })
  );
}
```

- [ ] **Step 2: Registar handler IPC**

Em `src/main/routers/tesouraria.router.ts`:

```ts
ipcMain.handle('tesouraria:contas:contasContabeisDisponiveis', async (_, empresaId: string, contaBancariaId?: string) => {
  return tesourariaController.listarContasContabeisDisponiveis(empresaId, contaBancariaId);
});
```

- [ ] **Step 3: Expor no preload**

Em `src/preload/index.ts`, dentro de `tesouraria`:

```ts
listarContasContabeisDisponiveis: (empresaId: string, contaBancariaId?: string) =>
  ipcRenderer.invoke('tesouraria:contas:contasContabeisDisponiveis', empresaId, contaBancariaId),
```

- [ ] **Step 4: Adicionar cliente no renderer**

Em `src/renderer/src/api/tesouraria.api.ts`:

```ts
async listarContasContabeisDisponiveis(
  empresaId: string,
  contaBancariaId?: string
): Promise<IpcResponse<ContaContabilDisponivelDto[]>> {
  const a = api();
  if (typeof a?.tesouraria?.listarContasContabeisDisponiveis === 'function') {
    return a.tesouraria.listarContasContabeisDisponiveis(empresaId, contaBancariaId);
  }
  return semApi();
}
```

Importar `ContaContabilDisponivelDto` e seguir o padrão `api()`/`semApi()` do ficheiro.

- [ ] **Step 5: Verificar contratos**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit — não executar neste ambiente**

O directório não é repositório Git.

---

### Task 4: Formulário de conta bancária

**Files:**
- Modify: `src/renderer/src/components/erp/ContasBancariasManager.tsx`

**Interfaces:**
- Consumes: `tesourariaApi.listarContasContabeisDisponiveis(empresaId, conta?.id)`, `ContaBancariaComSaldoDto.contaContabilId`.
- Produces: formulário envia `contaContabilId: string | null` no create e no update.

- [ ] **Step 1: Adicionar estado e carregamento das opções**

Em `ContaForm`:
- importar `ContaContabilDisponivelDto` e usar `useEffect` (já importado no ficheiro);
- adicionar `const [contasContabeis, setContasContabeis] = useState<ContaContabilDisponivelDto[]>([])`;
- adicionar `const [aCarregarContasContabeis, setACarregarContasContabeis] = useState(true)`;
- adicionar efeito que chama `tesourariaApi.listarContasContabeisDisponiveis(empresaId, conta?.id)` e preenche o estado; em erro, mantém lista vazia e mostra `toast.error(res.error.message)`; `finally` desactiva o carregamento.

- [ ] **Step 2: Adicionar campo ao schema e aos valores iniciais**

- `contaSchema`: `contaContabilId: z.string().optional().or(z.literal(""))`.
- `defaultValues`: `contaContabilId: conta?.contaContabilId ?? ""`.

- [ ] **Step 3: Enviar o campo no submit**

- Em `atualizarConta`, incluir `contaContabilId: v.contaContabilId || null`.
- Em `criarConta`, incluir `contaContabilId: v.contaContabilId || null`.

- [ ] **Step 4: Renderizar o `SearchSelect`**

Junto do campo “Tipo”, na grelha do formulário:

```tsx
<div>
  <label className="text-xs font-medium text-foreground block mb-1">Conta contabilística</label>
  <SearchSelect
    value={watch("contaContabilId") ?? ""}
    onChange={(v) => methods.setValue("contaContabilId", v, { shouldDirty: true })}
    options={[
      { value: "", label: "Sem associação" },
      ...contasContabeis.map((c) => ({
        value: c.id,
        label: `${c.codigo} — ${c.designacao}`,
      })),
    ]}
    placeholder="Sem associação"
    disabled={aCarregarContasContabeis}
  />
  {contasContabeis.length === 0 && !aCarregarContasContabeis && (
    <p className="text-[11px] text-muted-foreground mt-1">
      Configure o plano de contas para associar esta conta.
    </p>
  )}
</div>
```

- [ ] **Step 5: Verificar formulário no browser**

Run: `npm run dev`
Expected:
- ao criar, o selector mostra “Sem associação” e contas elegíveis;
- ao editar conta já ligada, a conta actual aparece;
- ao guardar, o diálogo fecha e a lista recarrega;
- ao escolher conta duplicada via API, o erro aparece sem fechar o diálogo.

- [ ] **Step 6: Validação final**

Run: `npm run typecheck && npm test && npx prisma validate`
Expected: PASS.

- [ ] **Step 7: Commit — não executar neste ambiente**

O directório não é repositório Git.
