/**
 * Testes unitários para regras de elegibilidade (RH-313)
 */
import { describe, expect, it } from 'vitest';
import { avaliarElegibilidade } from '../../../main/services/rh/calculo/regras/elegibilidade';

const FILTRO = { ano: 2026, mes: 1, tipoProcessamento: 'VENCIMENTO', incluirFimContrato: false };

describe('Elegibilidade para processamento', () => {
  it('marca funcionário apto quando cumpre todos os requisitos', () => {
    const res = avaliarElegibilidade(
      [{ id: 'f1', ativo: true, temContratoAtivo: true, temIban: true }],
      FILTRO,
    );
    expect(res.elegiveis).toEqual(['f1']);
    expect(res.restricoes).toHaveLength(0);
    expect(res.detalhes[0].podeProcessar).toBe(true);
  });

  it('assinala funcionário sem contrato activo', () => {
    const res = avaliarElegibilidade(
      [{ id: 'f1', ativo: true, temContratoAtivo: false, temIban: true }],
      FILTRO,
    );
    expect(res.elegiveis).toHaveLength(0);
    expect(res.restricoes[0].motivo).toBe('SEM_CONTRATO_ATIVO');
  });

  it('assinala IBAN em falta', () => {
    const res = avaliarElegibilidade(
      [{ id: 'f1', ativo: true, temContratoAtivo: true, temIban: false }],
      FILTRO,
    );
    expect(res.restricoes.some((r) => r.motivo === 'IBAN_EM_FALTA')).toBe(true);
  });

  it('acumula múltiplas restrições no mesmo funcionário', () => {
    const res = avaliarElegibilidade(
      [{ id: 'f1', ativo: true, suspenso: true, temContratoAtivo: true, temIban: false, jaProcessado: true }],
      FILTRO,
    );
    expect(res.elegiveis).toHaveLength(0);
    expect(res.detalhes[0].restricoes.length).toBeGreaterThanOrEqual(3);
  });

  it('fim de contrato exige data de cessação', () => {
    const res = avaliarElegibilidade(
      [{ id: 'f1', ativo: true, temContratoAtivo: true, temIban: true }],
      { ...FILTRO, tipoProcessamento: 'FIM_CONTRATO', incluirFimContrato: true },
    );
    expect(res.restricoes.some((r) => r.motivo === 'FIM_CONTRATO_SEM_FLAG')).toBe(true);
  });

  it('separa elegíveis de restritos em lote', () => {
    const res = avaliarElegibilidade(
      [
        { id: 'ok', ativo: true, temContratoAtivo: true, temIban: true },
        { id: 'sem-iban', ativo: true, temContratoAtivo: true, temIban: false },
      ],
      FILTRO,
    );
    expect(res.elegiveis).toEqual(['ok']);
    expect(res.detalhes).toHaveLength(2);
  });
});
