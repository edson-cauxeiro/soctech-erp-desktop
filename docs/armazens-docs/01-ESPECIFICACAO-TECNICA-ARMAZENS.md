# Especificação Técnica — Evolução do Módulo de Armazéns e Stock

## 1. Objectivo

Este documento especifica a evolução do **ERP existente** para suportar uma gestão de armazéns mais estruturada, inspirada nos princípios de SAP EWM e Oracle WMS, sem criar um novo projecto.

### Regra fundamental

> Todas as alterações devem ser incrementais sobre a aplicação, arquitectura, tabelas, componentes e convenções já existentes.

Não recriar o projecto, não substituir a stack e não eliminar funcionalidades existentes sem uma decisão explícita de migração.

## 2. Stack existente

- ElectronJS
- ReactJS
- Tailwind CSS
- TypeScript
- Zod
- Zustand
- Prisma
- PostgreSQL

## 3. Objectivos funcionais

A evolução deverá permitir:

1. Criar e gerir armazéns.
2. Organizar cada armazém em áreas.
3. Dividir áreas em zonas.
4. Criar localizações hierárquicas.
5. Associar capacidade e características às localizações.
6. Associar produtos ao stock por localização.
7. Controlar lotes e, posteriormente, números de série.
8. Registar movimentos de stock.
9. Implementar regras de entrada (Putaway).
10. Implementar regras de saída (Picking).
11. Preparar FIFO/FEFO.
12. Preparar futura expansão para WMS avançado.

## 4. Modelo conceptual

```text
Company
  └── Warehouse
       └── WarehouseArea
            └── WarehouseZone
                 └── WarehouseLocation
                      └── Inventory
                           ├── Lot
                           └── Serial
```

Regras:

```text
Product / StorageClass
        ├── PutawayRule
        └── PickingRule
```

Movimentos:

```text
StockMovement
    └── StockMovementLine
          ├── fromLocation
          └── toLocation
```

## 5. Estrutura física

### Warehouse

Representa uma unidade de armazenamento.

Campos mínimos:

- `id`
- `companyId`
- `code`
- `name`
- `type`
- `description`
- `isActive`
- `createdAt`
- `updatedAt`

### WarehouseArea

Representa uma área operacional do armazém.

Exemplos:

- Recepção
- Armazenamento
- Quarentena
- Expedição

Campos:

- `id`
- `warehouseId`
- `code`
- `name`
- `type`
- `description`
- `isActive`
- timestamps

### WarehouseZone

Representa uma zona lógica/operacional.

Exemplos:

- Pesados
- Pequenos
- Alta rotação
- Baixa rotação
- Refrigerados
- Perigosos

Campos:

- `id`
- `areaId`
- `code`
- `name`
- `description`
- `isActive`
- timestamps

### WarehouseLocation

É a unidade física endereçável.

Deve suportar hierarquia através de `parentId`.

Exemplo:

```text
A01
 └── R02
      └── N03
           └── P04
```

Campos recomendados:

- `id`
- `zoneId`
- `parentId`
- `code`
- `name`
- `locationType`
- `aisle`
- `rack`
- `level`
- `position`
- `capacityQty`
- `capacityWeight`
- `capacityVolume`
- `allowMixedProducts`
- `allowMixedLots`
- `isPickable`
- `isPutaway`
- `isActive`
- timestamps

## 6. Classificação de armazenamento

Criar/adequar `StorageClass`.

Exemplos:

- NORMAL
- HEAVY
- FRAGILE
- REFRIGERATED
- HAZARDOUS
- FAST_MOVING

Campos recomendados:

- `id`
- `code`
- `name`
- `description`
- `requiresTemperatureControl`
- `requiresLot`
- `requiresSerial`
- `requiresExpiryDate`
- `maxStorageWeight`
- `maxStorageVolume`
- `isActive`

O produto deve referenciar uma classe de armazenamento quando o domínio existente suportar essa relação.

## 7. Inventário

O stock deve ser controlado por:

```text
Produto + Armazém + Localização
```

e, quando aplicável:

```text
Produto + Lote + Localização
Produto + Serial + Localização
```

Campos mínimos:

- `id`
- `productId`
- `warehouseId`
- `locationId`
- `quantity`
- `reservedQuantity`
- `availableQuantity`
- `unitCost`
- `status`
- timestamps

### Regra

`availableQuantity` deve ser consistente com a regra de negócio adoptada pelo projecto. Evitar duplicar valores calculados sem uma estratégia clara de actualização.

## 8. Lotes

Criar/adequar entidade para rastreabilidade de lote:

- `id`
- `productId`
- `lotNumber`
- `manufactureDate`
- `expiryDate`
- `supplierId`, caso já exista no domínio
- timestamps

Preparar suporte a FEFO.

## 9. Movimentos

Todo movimento que altere stock deve produzir histórico.

### StockMovement

- `id`
- `warehouseId`
- `type`
- `referenceType`
- `referenceId`
- `createdBy`
- `createdAt`

### StockMovementLine

- `id`
- `movementId`
- `productId`
- `lotId`, quando aplicável
- `fromLocationId`
- `toLocationId`
- `quantity`
- `unitCost`

Tipos iniciais sugeridos:

- RECEIPT
- TRANSFER
- ISSUE
- ADJUSTMENT
- RETURN
- QUARANTINE
- RELEASE

Os nomes devem ser adaptados aos enums/convenções já existentes.

## 10. Putaway

Putaway determina onde o stock recebido deve ser colocado.

Fluxo:

```text
Recepção
  ↓
Produto
  ↓
StorageClass
  ↓
PutawayRule
  ↓
Zona elegível
  ↓
Localizações elegíveis
  ↓
Validação de capacidade
  ↓
Localização sugerida
```

Campos:

- `id`
- `warehouseId`
- `storageClassId`
- `zoneId`
- `priority`
- `minCapacity`
- `maxCapacity`
- `allowMixedProducts`
- `allowMixedLots`
- `isActive`

## 11. Picking

Picking determina de onde o stock deve ser retirado.

Estratégias iniciais:

- FIFO
- FEFO
- NEAREST
- MANUAL

A implementação inicial deve permitir evolução sem acoplar a regra à UI.

## 12. Integridade e segurança

### Base de dados

- Foreign keys em todas as relações.
- Unique constraints para códigos dentro do respectivo contexto.
- Índices em `warehouseId`, `zoneId`, `locationId`, `productId`, `lotId`.
- `Decimal` para quantidades/pesos/valores quando aplicável.
- Migrations Prisma versionadas.
- Nunca alterar produção manualmente fora das migrations.

### Aplicação

Fluxo recomendado:

```text
React
 ↓
Preload / IPC
 ↓
Zod Validator
 ↓
Service
 ↓
Repository
 ↓
Prisma
 ↓
PostgreSQL
```

O renderer não deve aceder directamente ao Prisma.

## 13. Princípios de compatibilidade

Antes de alterar qualquer tabela:

1. Inspeccionar schema Prisma actual.
2. Mapear tabelas e relações existentes.
3. Identificar funcionalidades dependentes.
4. Criar migration incremental.
5. Migrar dados existentes quando necessário.
6. Validar integridade.
7. Só depois remover/depreciar estruturas antigas.

## 14. Fora do escopo inicial

Não implementar nesta fase:

- Mobile app.
- IA.
- WMS avançado completo.
- Optimização automática de rotas.
- RFID.
- Robótica.
- Wave picking complexo.

A arquitectura deve permitir estas extensões posteriormente.
