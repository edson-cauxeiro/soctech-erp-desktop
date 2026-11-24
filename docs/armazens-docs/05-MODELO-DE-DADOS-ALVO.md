# Modelo de Dados Alvo — Armazéns

> Este documento descreve o modelo lógico alvo. Antes de implementar, deve ser comparado com o schema Prisma existente.

## Diagrama

```text
                         COMPANY
                            │
                  ┌─────────┴─────────┐
                  │                   │
              WAREHOUSE             PRODUCT
                  │                   │
                  │              STORAGE_CLASS
                  │                   │
                  ▼                   │
            WAREHOUSE_AREA            │
                  │                   │
                  ▼                   │
            WAREHOUSE_ZONE ◄──────────┘
                  │
                  ▼
          WAREHOUSE_LOCATION
                  │
                  ▼
              INVENTORY
              /       \
            LOT      SERIAL


STORAGE_CLASS
      │
      ├── PUTAWAY_RULE
      │
      └── PICKING_RULE


STOCK_MOVEMENT
      │
      └── STOCK_MOVEMENT_LINE
              │
       ┌──────┴──────┐
       ▼             ▼
FROM_LOCATION    TO_LOCATION
```

## Entidades

| Entidade | Responsabilidade |
|---|---|
| Warehouse | Unidade de armazenamento |
| WarehouseArea | Área operacional |
| WarehouseZone | Zona lógica/operacional |
| WarehouseLocation | Endereço físico |
| StorageClass | Características de armazenamento |
| Inventory | Quantidade de stock localizada |
| Lot | Rastreabilidade por lote |
| Serial | Rastreabilidade unitária |
| PutawayRule | Regra para entrada |
| PickingRule | Regra para saída |
| StockMovement | Cabeçalho do movimento |
| StockMovementLine | Alteração física do stock |

## Regras essenciais

### Localização

`WarehouseLocation.parentId` permite uma árvore.

### Stock

Stock deve possuir uma localização quando o armazém exigir localização.

### Mistura

`allowMixedProducts=false` impede que uma localização receba produtos diferentes.

`allowMixedLots=false` impede mistura de lotes.

### Capacidade

Uma localização pode controlar:

- quantidade;
- peso;
- volume.

### Estado

Uma localização pode estar:

- activa;
- bloqueada;
- disponível para picking;
- disponível para putaway.

## Índices

Priorizar índices para:

```text
Warehouse.companyId
WarehouseArea.warehouseId
WarehouseZone.areaId
WarehouseLocation.zoneId
WarehouseLocation.parentId
Inventory.productId
Inventory.warehouseId
Inventory.locationId
Inventory.lotId
StockMovement.warehouseId
StockMovementLine.productId
```

## Constraints

Exemplos:

```text
UNIQUE warehouse + code
UNIQUE area + code
UNIQUE zone + code
UNIQUE zone + location code
```

Os nomes exactos dependem do schema existente.

## Estratégia de evolução

Este modelo é um **alvo lógico**, não uma instrução para apagar o schema actual.

O agente deve primeiro mapear:

```text
MODELO ACTUAL → MODELO ALVO
```

e escolher entre:

- reutilizar tabela;
- alterar tabela;
- renomear através de migration;
- criar nova tabela;
- migrar dados;
- manter compatibilidade temporária.
