# Guia para Agentes — Evolução do ERP Existente

## Regra principal

Este é um **projecto existente**.

O agente deve modificar e evoluir o código existente.

### NÃO fazer

- Não criar um novo projecto.
- Não criar outro `package.json`.
- Não recriar a aplicação.
- Não substituir ElectronJS.
- Não substituir ReactJS.
- Não substituir Tailwind.
- Não substituir Zod.
- Não substituir Zustand.
- Não substituir Prisma.
- Não apagar tabelas existentes sem migração.
- Não criar uma arquitectura paralela sem necessidade.

## Antes de alterar

O agente deve:

1. Inspeccionar a estrutura do projecto.
2. Ler o `schema.prisma`.
3. Identificar entidades existentes.
4. Procurar funcionalidades equivalentes.
5. Reutilizar componentes existentes.
6. Reutilizar services/repositories existentes.
7. Reutilizar validators Zod.
8. Reutilizar stores Zustand.
9. Identificar relações afectadas.

## Regra de migração

Toda alteração de BD deve:

```text
Schema actual
     ↓
Análise de impacto
     ↓
Alteração Prisma
     ↓
Migration
     ↓
Testes
```

Nunca assumir que a base de dados está vazia.

## Regra de domínio

Stock nunca deve ser alterado directamente pela UI.

Fluxo:

```text
UI
 ↓
IPC
 ↓
Zod
 ↓
Service
 ↓
Repository
 ↓
Prisma
```

## Regra de transacção

Operações que alterem stock devem ser transaccionais.

Exemplo de transferência:

```text
BEGIN
 ↓
Validar stock origem
 ↓
Diminuir origem
 ↓
Aumentar destino
 ↓
Criar movimento
 ↓
COMMIT
```

Em caso de erro:

```text
ROLLBACK
```

## Regra de UI

A UI deve consumir APIs/IPC existentes ou novos handlers seguindo o padrão já utilizado.

Não colocar lógica de negócio complexa em componentes React.

## Regra de validação

Zod deve validar:

- Formulários.
- Payloads IPC.
- Dados externos ao domínio.

As regras críticas também devem ser verificadas no service.

## Definition of Done

Uma alteração só é considerada concluída quando:

- Código implementado.
- Migration criada, quando necessária.
- Validação implementada.
- Service testado.
- Repository testado.
- IPC testado.
- UI integrada.
- Erros tratados.
- Regressão verificada.
- Não existem alterações destrutivas não justificadas.
