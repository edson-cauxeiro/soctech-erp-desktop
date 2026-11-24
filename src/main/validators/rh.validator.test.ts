import { describe, it, expect } from 'vitest';
import {
  processarSalariosSchema,
  anularProcessamentoSchema,
  filtroFuncionarioSchema,
  rhPeriodoCodigoSchema,
  rhDataSchema,
  criarRhContratoSchema,
  cessarRhContratoSchema,
  criarRhAlteracaoSalarialSchema,
  criarRhAusenciaSchema,
  criarRhMarcacaoFeriasSchema,
} from './rh.validator';

const base = {
  operacao: 'PROCESSAR' as const,
  modo: 'LOTE' as const,
  tipos: ['VENCIMENTO'] as const,
  incluirFimContrato: false,
  ano: 2026,
  periodoCodigo: 'P01',
  mes: 1,
  diasProcessados: 22,
  dataProcessamento: '2026-01-31',
  dataLimiteFaltasHE: '2026-01-25',
  funcionarioIds: ['func-1', 'func-2'],
};

describe('rh.validator', () => {
  describe('rhPeriodoCodigoSchema', () => {
    it('aceita P01..P12', () => {
      expect(rhPeriodoCodigoSchema.parse('P01')).toBe('P01');
      expect(rhPeriodoCodigoSchema.parse('P12')).toBe('P12');
    });

    it('rejeita formatos inválidos', () => {
      expect(rhPeriodoCodigoSchema.safeParse('P13').success).toBe(false);
      expect(rhPeriodoCodigoSchema.safeParse('1').success).toBe(false);
    });
  });

  describe('rhDataSchema', () => {
    it('converte ISO string em Date', () => {
      const resultado = rhDataSchema.parse('2026-01-31');
      expect(resultado).toBeInstanceOf(Date);
      expect(resultado.getUTCFullYear()).toBe(2026);
    });

    it('rejeita datas vazias', () => {
      expect(rhDataSchema.safeParse('').success).toBe(false);
    });
  });

  describe('processarSalariosSchema', () => {
    it('aceita um lote válido e aplica valores por defeito', () => {
      const resultado = processarSalariosSchema.parse(base);
      expect(resultado.incluirFimContrato).toBe(false);
      expect(resultado.funcionarioIds).toHaveLength(2);
    });

    it('exige pelo menos um funcionário', () => {
      const resultado = processarSalariosSchema.safeParse({ ...base, funcionarioIds: [] });
      expect(resultado.success).toBe(false);
    });

    it('exige exactamente um funcionário no modo individual', () => {
      const resultado = processarSalariosSchema.safeParse({
        ...base,
        modo: 'INDIVIDUAL',
      });
      expect(resultado.success).toBe(false);

      const valido = processarSalariosSchema.safeParse({
        ...base,
        modo: 'INDIVIDUAL',
        funcionarioIds: ['func-1'],
      });
      expect(valido.success).toBe(true);
    });

    it('exige incluirFimContrato quando o tipo FIM_CONTRATO está presente', () => {
      const resultado = processarSalariosSchema.safeParse({
        ...base,
        tipos: ['FIM_CONTRATO'],
        incluirFimContrato: false,
      });
      expect(resultado.success).toBe(false);
    });
  });

  describe('anularProcessamentoSchema', () => {
    it('exige ids e motivo válido', () => {
      expect(
        anularProcessamentoSchema.safeParse({ processamentoIds: ['p1'], motivo: 'ok' }).success
      ).toBe(false);
      expect(
        anularProcessamentoSchema.safeParse({ processamentoIds: [], motivo: 'erro grave' }).success
      ).toBe(false);
      expect(
        anularProcessamentoSchema.safeParse({ processamentoIds: ['p1'], motivo: 'erro grave' })
          .success
      ).toBe(true);
    });
  });

  describe('filtroFuncionarioSchema', () => {
    it('aplica paginação por defeito', () => {
      const resultado = filtroFuncionarioSchema.parse({});
      expect(resultado.skip).toBe(0);
      expect(resultado.take).toBe(50);
    });

    it('rejeita um estado desconhecido', () => {
      expect(filtroFuncionarioSchema.safeParse({ estado: 'DESCONHECIDO' }).success).toBe(false);
    });
  });

  describe('criarRhContratoSchema (RH-204)', () => {
    const base = {
      tipo: 'PRAZO_INDETERMINADO' as const,
      salarioBase: 150000,
      dataInicio: '2026-01-01',
    };

    it('aceita um contrato válido e aplica defaults', () => {
      const resultado = criarRhContratoSchema.parse(base);
      expect(resultado.moeda).toBe('AOA');
      expect(resultado.cargaHorariaSemanal).toBe(44);
      expect(resultado.dataInicio).toBeInstanceOf(Date);
    });

    it('rejeita data de fim anterior ao início', () => {
      const resultado = criarRhContratoSchema.safeParse({
        ...base,
        dataFim: '2025-12-31',
      });
      expect(resultado.success).toBe(false);
    });

    it('rejeita salário não positivo', () => {
      expect(criarRhContratoSchema.safeParse({ ...base, salarioBase: 0 }).success).toBe(false);
    });
  });

  describe('cessarRhContratoSchema (RH-204)', () => {
    it('exige motivo válido e data', () => {
      expect(cessarRhContratoSchema.safeParse({ motivo: 'DEMISSAO' }).success).toBe(false);
      expect(
        cessarRhContratoSchema.safeParse({ motivo: 'INVALIDO', dataCessacao: '2026-01-01' }).success
      ).toBe(false);
      expect(
        cessarRhContratoSchema.safeParse({ motivo: 'DEMISSAO', dataCessacao: '2026-01-01' }).success
      ).toBe(true);
    });
  });

  describe('criarRhAlteracaoSalarialSchema (RH-204)', () => {
    it('exige contrato, data e salário positivo', () => {
      expect(
        criarRhAlteracaoSalarialSchema.safeParse({
          contratoId: 'c1',
          dataEfeito: '2026-01-01',
          salarioNovo: -10,
        }).success
      ).toBe(false);
      expect(
        criarRhAlteracaoSalarialSchema.safeParse({
          contratoId: 'c1',
          dataEfeito: '2026-01-01',
          salarioNovo: 2000,
        }).success
      ).toBe(true);
    });
  });

  describe('IDs de referência (RH-805)', () => {
    const CUID_FUNCIONARIO = 'cmvfga6x40001xctqccsk9e7i';
    const CUID_TIPO = 'cmv5l66g2000wuwtqh06tic8f';

    it('aceita os cuid gerados pelo Prisma nas ausências', () => {
      const resultado = criarRhAusenciaSchema.safeParse({
        funcionarioId: CUID_FUNCIONARIO,
        tipoId: CUID_TIPO,
        dataInicio: '2026-11-09',
        dataFim: '2026-11-13',
        dias: 5,
      });

      expect(resultado.success).toBe(true);
    });

    it('aceita os cuid gerados pelo Prisma nas marcações de férias', () => {
      const resultado = criarRhMarcacaoFeriasSchema.safeParse({
        funcionarioId: CUID_FUNCIONARIO,
        ano: 2027,
        dataInicio: '2027-01-27',
        dataFim: '2027-01-31',
        dias: 5,
      });

      expect(resultado.success).toBe(true);
    });

    it('continua a rejeitar identificadores vazios', () => {
      const resultado = criarRhAusenciaSchema.safeParse({
        funcionarioId: '   ',
        tipoId: CUID_TIPO,
        dataInicio: '2026-11-09',
        dataFim: '2026-11-13',
        dias: 5,
      });

      expect(resultado.success).toBe(false);
    });
  });
});
