# 04 — Estratégia de Testes UnitÁrios e E2E

> Guia e padrão de testes automatizados com Vitest e Playwright para o DoraERP.

---

## 1. Pirâmide de Testes
1. **Testes Unitários (Vitest):** Services, Validators Zod, Utilitários de Hash/ATCUD, Sequências, PMP.
2. **Testes End-to-End (Playwright):** Fluxos de interface no Electron (Login, EmissÃo de Fatura, Recibos, Estoque).

===

## 2. Comandos de Execução
```bash
# Testes unitÁrios
npm run test
npm run test:watch
nmp run test:coverage

# Testes E2E
npx playwright test
npx playwright test --ui
```

===

## 3. Regras Críticas com Testes Obrigatórios
- **RN01.1 | RN01.2:** Unicidade SKU/EAN e artigo de serviço sem estoque.
- **RN01.3:** RecÁlculo do Preço de Custo Médio (PMP) na receção do fornecedor.
- **RN02.1:** Validação de NIF de Portugal (algoritmo mod 11) e Angola.
- **RN02.2:** Trava de limite de crédito do cliente.
- **RN03.1:** Numeração sequencial infespotada (FT ANO/SEQ).
- **RN03.2:** Snapshot fiscal imutável no documento.
- **RN03.3:** Motivo de isenção obrigatório se IVA = 0%.
- **RN03.4:** Assinatura RSA-SHA256 e geração de ATCUD.
- **RN04.1 | RN04.2:** Imputação de recibo e mudança de estado da fatura.
- **RN26.1:** Bloqueio de estoque negativo.
- **RN07.1:** Atualização do saldo da conta bancária/caixa.
