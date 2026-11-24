import { describe, it, expect } from 'vitest';
import { RhProcessamentoManualService } from './rh-processamento-manual.service';

const service = new RhProcessamentoManualService();

describe('RhProcessamentoManualService (RH-408)', () => {
  it('normaliza ajustes válidos para a forma do motor', () => {
    const out = service.normalizar([{ descricao: 'Prémio anual', tipo: 'REMUNERACAO', valor: 5000 }]);

    expect(out).toEqual([
      {
        descricao: 'Prémio anual',
        tipo: 'REMUNERACAO',
        valor: 5000,
      },
    ]);
  });

  it('preserva rubricaId, código, quantidade e incidências', () => {
    const out = service.normalizar([
      {
        rubricaId: 'rub-1',
        codigo: 'PREMIO',
        descricao: 'Prémio',
        tipo: 'REMUNERACAO',
        valor: 1000,
        quantidade: 2,
        incideIRT: false,
        incideINSS: true,
      },
    ]);

    expect(out?.[0]).toMatchObject({
      rubricaId: 'rub-1',
      codigo: 'PREMIO',
      quantidade: 2,
      incideIRT: false,
      incideINSS: true,
    });
  });

  it('descarta ajustes com valor não positivo', () => {
    const out = service.normalizar([
      { descricao: 'Zero', tipo: 'DESCONTO', valor: 0 },
      { descricao: 'Negativo', tipo: 'DESCONTO', valor: -10 },
      { descricao: 'Válido', tipo: 'DESCONTO', valor: 100 },
    ]);

    expect(out).toHaveLength(1);
    expect(out?.[0].descricao).toBe('Válido');
  });

  it('devolve undefined quando não há ajustes aplicáveis', () => {
    expect(service.normalizar()).toBeUndefined();
    expect(service.normalizar([])).toBeUndefined();
    expect(service.normalizar([{ descricao: 'Zero', tipo: 'DESCONTO', valor: 0 }])).toBeUndefined();
  });

  it('houveAjustes reflecte a existência de ajustes válidos', () => {
    expect(service.houveAjustes([{ descricao: 'P', tipo: 'REMUNERACAO', valor: 1 }])).toBe(true);
    expect(service.houveAjustes([{ descricao: 'P', tipo: 'REMUNERACAO', valor: 0 }])).toBe(false);
    expect(service.houveAjustes()).toBe(false);
  });
});
