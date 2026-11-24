# Documentação — Evolução do ERP: Armazéns e Stock

Este conjunto de documentos descreve a evolução incremental do ERP existente.

## Documentos

1. `01-ESPECIFICACAO-TECNICA-ARMAZENS.md`
   - Modelo funcional e técnico alvo.
2. `02-PLANO-DE-IMPLEMENTACAO.md`
   - Fases de implementação.
3. `03-TASKS.md`
   - Backlog detalhado para execução.
4. `04-GUIA-PARA-AGENTES.md`
   - Regras para agentes que irão modificar o projecto.
5. `05-MODELO-DE-DADOS-ALVO.md`
   - Modelo lógico e relações da nova estrutura.

## Ordem recomendada

```text
01 Especificação
      ↓
05 Modelo de Dados
      ↓
00 Auditoria do projecto actual
      ↓
02 Plano
      ↓
03 Tasks
      ↓
04 Guia dos agentes
```

## Regra fundamental

Não criar um novo projecto. A implementação deve ser uma evolução controlada do código, schema, UI e arquitectura existentes.
