# Plano de Implementação — Evolução do ERP Existente

## 1. Princípio

Este plano é para **actualização do projecto existente**.

Não criar um novo ERP, não iniciar outro repositório e não substituir a stack actual.

## 2. Fases

### Fase 0 — Discovery e auditoria

Objectivo: conhecer o estado real antes de alterar.

Tarefas:

- Inspeccionar `prisma/schema.prisma`.
- Identificar tabelas de produto, stock, armazém e movimentos existentes.
- Mapear relações.
- Identificar componentes React existentes.
- Identificar stores Zustand.
- Identificar services/repositories.
- Identificar IPC/preload.
- Identificar validators Zod.
- Levantar duplicações e inconsistências.
- Produzir mapa `actual → alvo`.

Entregável:

```text
docs/warehouse/00-current-state.md
```

### Fase 1 — Evolução do modelo de dados

Objectivo: adaptar o schema actual.

Tarefas:

- Adicionar/alterar Warehouse.
- Adicionar WarehouseArea.
- Adicionar WarehouseZone.
- Adicionar WarehouseLocation.
- Adicionar StorageClass.
- Adequar Inventory.
- Adequar Lot/Batch.
- Adequar StockMovement.
- Criar PutawayRule.
- Criar PickingRule.
- Adicionar índices.
- Adicionar constraints.
- Criar migration Prisma.

Critério de conclusão:

- `prisma migrate` executa sem erro.
- Dados existentes permanecem íntegros.
- Relações novas são válidas.

### Fase 2 — Domínio e backend local

Objectivo: implementar regras sem acoplamento à interface.

Criar/adequar:

```text
warehouse/
  warehouse.service
  warehouse.repository
  warehouse.validator
  warehouse.types

inventory/
  inventory.service
  inventory.repository
  inventory.validator

stock/
  stock-movement.service
  stock-movement.repository
  stock-movement.validator

putaway/
  putaway.service
  putaway.repository
  putaway.validator

picking/
  picking.service
  picking.repository
  picking.validator
```

Manter as convenções reais já usadas no projecto.

### Fase 3 — IPC / Electron

Expor operações através do preload existente.

Exemplos:

```text
warehouse.create
warehouse.update
warehouse.list

area.create
zone.create

location.create
location.update
location.tree

inventory.list
inventory.transfer

stockMovement.create

putaway.suggest
picking.suggest
```

Aplicar validação Zod antes da entrada no domínio.

### Fase 4 — UI de configuração

Criar/actualizar:

1. Lista de armazéns.
2. Formulário de armazém.
3. Gestão de áreas.
4. Gestão de zonas.
5. Árvore de localizações.
6. Formulário de localização.
7. Gestão de classes de armazenamento.
8. Gestão de regras.

Utilizar Tailwind e os componentes visuais já existentes.

### Fase 5 — Operações de stock

Implementar:

- Entrada.
- Transferência.
- Saída.
- Ajuste.
- Devolução.
- Quarentena.
- Libertação de stock.

Todas as operações devem gerar `StockMovement`.

### Fase 6 — Putaway e Picking

Implementar primeiro regras determinísticas e simples.

Putaway:

```text
StorageClass
 → Zone
 → Location
 → Capacity
 → Priority
```

Picking:

```text
Product
 → Eligible inventory
 → FIFO/FEFO
 → Location
```

### Fase 7 — Testes e migração

Testar:

- CRUD.
- Relações.
- Integridade.
- Stock.
- Transferências.
- Lotes.
- Capacidade.
- Putaway.
- Picking.
- Dados antigos.

### Fase 8 — Hardening

- Logs.
- Tratamento de erros.
- Permissões.
- Auditoria.
- Transacções Prisma.
- Optimização de queries.
- Índices.
- Testes de concorrência em operações de stock.

## 3. Estratégia de rollout

Nunca activar todas as funcionalidades de uma vez.

Ordem:

```text
Schema
 ↓
Repositories
 ↓
Services
 ↓
IPC
 ↓
UI de configuração
 ↓
Stock
 ↓
Putaway/Picking
 ↓
Testes
 ↓
Activação
```
