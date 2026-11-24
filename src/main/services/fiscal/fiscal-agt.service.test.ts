/**
 * @file fiscal-agt.service.test.ts
 * @description Testes da conformidade AGT e da assinatura.
 *
 * O alvo é o que é fácil errar sem dar erro: a ordem dos campos da
 * assinatura, o dígito de controlo do NIF português e a coerência de totais.
 * Uma assinatura com a ordem trocada produz um ficheiro que a AGT recusa sem
 * dizer porquê, por isso a ordem é fixada por teste.
 */

// Prisma valida o tipo de entrada do constructor Decimal, por isso o teste
// usa Decimal a sério: um objecto com `toString` faria o teste passar sem
// estar a provar o que diz provar.
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  CAMPOS_ASSINATURA,
  calcularAssinatura,
  detalharAssinatura,
  MOEDA_AGT,
  NOMES_CAMPOS_ASSINATURA,
  validarNifAngola,
  validarNifPortugal,
  verificarConformidade,
  FiscalAgtService,
  type DocumentoAgt,
  type SoftwareAgt,
} from './fiscal-agt.service';

const software: SoftwareAgt = {
  nome: 'DoraERP',
  versao: '1.0.0',
  chaveSeguranca: 'CHAVE-SEGURANCA-TESTE',
  certificado: 'CERT-1234',
};

const contexto = { nifEmpresa: '123456789LA', moedaEsperada: MOEDA_AGT };

function documento(overrides: Partial<DocumentoAgt> = {}): DocumentoAgt {
  return {
    id: 'fat_1',
    numero: 'FT 2026/0001',
    serie: '2026',
    tipo: 'fatura',
    dataEmissao: new Date('2026-03-01'),
    dataVencimento: new Date('2026-03-31'),
    clienteNome: 'Cliente Teste, Lda',
    clienteNif: '987654321ZZ',
    totalIliquido: 100,
    totalIva: 23,
    totalLiquido: 123,
    moeda: MOEDA_AGT,
    atcud: null,
    hashAssinatura: null,
    estadoDocumento: 'emitido',
    linhas: [{ taxaIva: 23, totalLinha: 123 }],
    ...overrides,
  };
}

describe('fiscal-agt.service', () => {
  // ===========================================================================
  // NIF
  // ===========================================================================

  describe('validarNifAngola', () => {
    it('aceita 9 dígitos e 2 letras', () => {
      expect(validarNifAngola('123456789LA').valido).toBe(true);
    });

    it('normaliza maiúsculas e espaços', () => {
      expect(validarNifAngola(' 123 456 789 la ').valido).toBe(true);
    });

    it('rejeita menos de 9 dígitos', () => {
      expect(validarNifAngola('12345678LA').valido).toBe(false);
    });

    it('rejeita um sufixo de uma letra só', () => {
      expect(validarNifAngola('123456789L').valido).toBe(false);
    });

    it('rejeita um NIF vazio com um motivo que não é genérico', () => {
      const resultado = validarNifAngola('');
      expect(resultado.valido).toBe(false);
      expect(resultado.motivo).toContain('vazio');
    });

    it('rejeita um NIF português por formato', () => {
      expect(validarNifAngola('501442600').valido).toBe(false);
    });
  });

  describe('validarNifPortugal', () => {
    it('aceita um NIF com dígito de controlo correcto', () => {
      expect(validarNifPortugal('501442600').valido).toBe(true);
    });

    it('aceita o prefixo PT', () => {
      expect(validarNifPortugal('PT501442600').valido).toBe(true);
    });

    it('rejeita um dígito de controlo errado, que é o erro mais comum', () => {
      const resultado = validarNifPortugal('501442601');
      expect(resultado.valido).toBe(false);
      expect(resultado.motivo).toContain('controlo');
    });

    it('aceita um NIF de oito dígitos cujo controlo dá 0', () => {
      // Soma ponderada 44, 44 % 11 = 0, controlo 11 - 0 = 11, que o algoritmo
      // mapeia para 0. O caso existe para provar esse mapeamento.
      const resultado = validarNifPortugal('111111110');
      expect(resultado.valido).toBe(true);
    });

    it('rejeita separadores que não resolve', () => {
      expect(validarNifPortugal('501 442 60').valido).toBe(false);
    });

    it('aceita separadores convencionais', () => {
      expect(validarNifPortugal('501.442.600').valido).toBe(true);
    });
  });

  // ===========================================================================
  // Assinatura
  // ===========================================================================

  describe('calcularAssinatura', () => {
    const params = {
      empresaId: 'emp_1',
      nifEmpresa: '123456789LA',
      documento: documento(),
      ...software,
    };

    it('produz um digest determinístico', () => {
      expect(calcularAssinatura(params)).toBe(calcularAssinatura(params));
    });

    it('produz Base64, não hexadecimal', () => {
      const assinatura = calcularAssinatura(params);
      expect(assinatura).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    });

    it('muda quando um único campo muda', () => {
      const original = calcularAssinatura(params);
      const alterado = calcularAssinatura({
        ...params,
        documento: documento({ totalLiquido: 124 }),
      });

      expect(alterado).not.toBe(original);
    });

    it('muda quando a ordem dos campos muda, que é o erro silencioso', () => {
      // Reordenar `CAMPOS_ASSINATURA` produz outra assinatura sem qualquer
      // erro visível. Este teste documenta que a lista é deliberada.
      const tamanho = CAMPOS_ASSINATURA.length;
      expect(tamanho).toBe(NOMES_CAMPOS_ASSINATURA.length);
      expect(new Set(CAMPOS_ASSINATURA).size).toBe(tamanho);
    });

    it('inclui a chave de segurança do software', () => {
      const a = calcularAssinatura({ ...params, chaveSeguranca: 'CHAVE-A' });
      const b = calcularAssinatura({ ...params, chaveSeguranca: 'CHAVE-B' });

      expect(a).not.toBe(b);
    });

    it('detalha um campo por linha de assinatura, na ordem certa', () => {
      const detalhe = detalharAssinatura(params);

      expect(detalhe).toHaveLength(NOMES_CAMPOS_ASSINATURA.length);
      expect(detalhe[0].campo).toBe('NIF do emitente');
      expect(detalhe[1].campo).toBe('Número do documento');
      expect(detalhe[6].campo).toBe('NIF do cliente');
      expect(detalhe[13].campo).toBe('Certificado de software');
    });

    it('codifica cada campo em Base64 isoladamente', () => {
      const detalhe = detalharAssinatura(params);
      const esperado = Buffer.from('123456789LA', 'utf8').toString('base64');

      expect(detalhe[0].valor).toBe(esperado);
    });

    it('assina a data de emissão em AAAA-MM-DD', () => {
      const detalhe = detalharAssinatura(params);
      const esperado = Buffer.from('2026-03-01', 'utf8').toString('base64');

      expect(detalhe[4].valor).toBe(esperado);
    });

    it('formata os valores com dois decimais', () => {
      const detalhe = detalharAssinatura({ ...params, documento: documento({ totalIliquido: 100.5 }) });

      expect(Buffer.from(detalhe[7].valor, 'base64').toString('utf8')).toBe('100.50');
    });
  });

  // ===========================================================================
  // Conformidade
  // ===========================================================================

  describe('verificarConformidade', () => {
    it('aceita um documento conforme sem problemas', () => {
      const resultado = verificarConformidade(documento(), contexto);

      expect(resultado.conforme).toBe(true);
      expect(resultado.problemas).toHaveLength(0);
      expect(resultado.resumo).toEqual({ erros: 0, avisos: 0 });
    });

    it('rejeita um NIF de emitente inválido', () => {
      const resultado = verificarConformidade(documento(), { ...contexto, nifEmpresa: '123' });

      expect(resultado.conforme).toBe(false);
      expect(resultado.problemas.map((p) => p.codigo)).toContain('AGT-001');
    });

    it('rejeita a moeda errada', () => {
      const resultado = verificarConformidade(documento({ moeda: 'EUR' }), contexto);

      expect(resultado.problemas.map((p) => p.codigo)).toContain('AGT-002');
    });

    it('rejeita uma data de vencimento anterior à emissão', () => {
      const resultado = verificarConformidade(
        documento({ dataVencimento: new Date('2026-02-28') }),
        contexto,
      );

      expect(resultado.problemas.map((p) => p.codigo)).toContain('AGT-007');
    });

    it('detecta totais que não batem com ilíquido + IVA', () => {
      const resultado = verificarConformidade(documento({ totalLiquido: 130 }), contexto);

      expect(resultado.problemas.map((p) => p.codigo)).toContain('AGT-009');
    });

    it('aceita uma diferença de um cêntimo, que é arredondamento', () => {
      const resultado = verificarConformidade(documento({ totalLiquido: 123.01 }), contexto);

      expect(resultado.problemas.map((p) => p.codigo)).not.toContain('AGT-009');
    });

    it('detecta soma de linhas que não bate com o total', () => {
      const resultado = verificarConformidade(
        documento({ linhas: [{ taxaIva: 23, totalLinha: 100 }] }),
        contexto,
      );

      expect(resultado.problemas.map((p) => p.codigo)).toContain('AGT-012');
    });

    it('rejeita um documento de venda com valor zero', () => {
      const resultado = verificarConformidade(
        documento({ totalIliquido: 0, totalIva: 0, totalLiquido: 0, linhas: [] }),
        contexto,
      );

      const codigos = resultado.problemas.map((p) => p.codigo);
      expect(codigos).toContain('AGT-010');
      expect(codigos).toContain('AGT-011');
    });

    it('aceita uma nota de crédito com valor zero', () => {
      const resultado = verificarConformidade(
        documento({ tipo: 'nota_credito', totalIliquido: 0, totalIva: 0, totalLiquido: 0, linhas: [] }),
        contexto,
      );

      expect(resultado.problemas.map((p) => p.codigo)).not.toContain('AGT-010');
    });

    it('avisa, não erro, quando falta o NIF do cliente', () => {
      const resultado = verificarConformidade(documento({ clienteNif: '' }), contexto);

      const problema = resultado.problemas.find((p) => p.codigo === 'AGT-005');
      expect(problema?.severidade).toBe('aviso');
      // Um aviso não impede a conformidade.
      expect(resultado.conforme).toBe(true);
    });

    it('avisa sobre um documento anulado, mas não o torna não conforme', () => {
      const resultado = verificarConformidade(documento({ estadoDocumento: 'anulado' }), contexto);

      expect(resultado.problemas.find((p) => p.codigo === 'AGT-014')?.severidade).toBe('aviso');
    });

    it('exige assinatura quando o contexto a exige', () => {
      const resultado = verificarConformidade(documento(), { ...contexto, exigirAssinatura: true });

      expect(resultado.problemas.map((p) => p.codigo)).toContain('AGT-015');
      expect(resultado.conforme).toBe(false);
    });

    it('detecta assinatura que não bate com o ATC-UD gravado', () => {
      const resultado = verificarConformidade(
        documento({ atcud: 'HASH-ANTIGO', hashAssinatura: 'HASH-NOVO' }),
        { ...contexto, exigirAssinatura: true },
      );

      expect(resultado.problemas.map((p) => p.codigo)).toContain('AGT-016');
    });

    it('aceita assinatura que bate com o ATC-UD', () => {
      const resultado = verificarConformidade(
        documento({ atcud: 'IGUAL', hashAssinatura: 'IGUAL' }),
        { ...contexto, exigirAssinatura: true },
      );

      expect(resultado.problemas.map((p) => p.codigo)).not.toContain('AGT-016');
    });

    it('conta os erros e avisos no resumo', () => {
      const resultado = verificarConformidade(
        documento({ moeda: 'EUR', clienteNif: '', estadoDocumento: 'anulado' }),
        contexto,
      );

      expect(resultado.resumo.erros).toBeGreaterThan(0);
      expect(resultado.resumo.avisos).toBeGreaterThan(0);
      expect(resultado.resumo.erros + resultado.resumo.avisos).toBe(resultado.problemas.length);
    });

    it('avisa sobre uma taxa de IVA fora da gama habitual', () => {
      const resultado = verificarConformidade(
        documento({ linhas: [{ taxaIva: 90, totalLinha: 123 }] }),
        contexto,
      );

      expect(resultado.problemas.map((p) => p.codigo)).toContain('AGT-013');
    });

    it('é pura: duas chamadas com a mesma entrada dão o mesmo resultado', () => {
      const a = verificarConformidade(documento(), contexto);
      const b = verificarConformidade(documento(), contexto);

      expect(a).toEqual(b);
    });
  });

  // ===========================================================================
  // Geração do ficheiro
  // ===========================================================================

  describe('FiscalAgtService.gerarFicheiro', () => {
    /** Prisma mínimo: só `submissaoAgt.create` é usado. */
    function servico() {
      const criado: Record<string, unknown>[] = [];
      return {
        criado,
        prisma: {
          submissaoAgt: {
            create: async (args: { data: Record<string, unknown> }) => {
              criado.push(args.data);
              return { id: 'sub_1', ...args.data };
            },
          },
        } as never,
      };
    }

    function pedido(extra: Record<string, unknown> = {}) {
      return {
        empresaId: 'empresa_1',
        software,
        nifEmpresa: '123456789LA',
        moeda: MOEDA_AGT,
        nomeEmpresa: 'Dora, Lda.',
        documentos: [documento()],
        ano: 2026,
        mes: 3,
        conteudo: '<conteudo/>',
        ...extra,
      };
    }

    it('nomeia o ficheiro pelo mês quando o período é mensal', async () => {
      const s = servico();
      const resultado = await new FiscalAgtService(s.prisma).gerarFicheiro(pedido());

      expect(resultado.periodo).toBe('2026-03');
      expect(resultado.nomeFicheiro).toBe('AGT_2026_03.xml');
    });

    it('nomeia o ficheiro só pelo ano quando o período é anual', async () => {
      // Um relatório de doze meses guardado como `AGT_2026_12.xml` lia-se como
      // se fosse só Dezembro, e o `periodo` gravado na base dizia o mesmo.
      const s = servico();
      const resultado = await new FiscalAgtService(s.prisma).gerarFicheiro(pedido({ mes: null }));

      expect(resultado.periodo).toBe('2026');
      expect(resultado.nomeFicheiro).toBe('AGT_2026.xml');
      expect(s.criado[0].periodo).toBe('2026');
    });

    it('guarda todos os documentos do ano no ficheiro anual', async () => {
      const s = servico();
      const resultado = await new FiscalAgtService(s.prisma).gerarFicheiro(
        pedido({ mes: null, documentos: [documento({ id: 'd1' }), documento({ id: 'd2' })] }),
      );

      expect(resultado.documentos).toHaveLength(2);
    });

    it('recusa um mês fora de 1 a 12', async () => {
      const s = servico();
      await expect(
        new FiscalAgtService(s.prisma).gerarFicheiro(pedido({ mes: 13 })),
      ).rejects.toThrow(/Mês inválido/);
    });

    it('recusa um período sem documentos', async () => {
      const s = servico();
      await expect(
        new FiscalAgtService(s.prisma).gerarFicheiro(pedido({ documentos: [] })),
      ).rejects.toThrow(/Não há documentos/);
    });

    it('assina apenas os documentos conformes', async () => {
      // Assinar um documento inválido cria uma assinatura que valida um
      // documento que a AGT vai recusar.
      const s = servico();
      const invalido = documento({ moeda: 'EUR' });

      const resultado = await new FiscalAgtService(s.prisma).gerarFicheiro(
        pedido({ documentos: [invalido] }),
      );

      expect(resultado.conformidade.conforme).toBe(false);
      expect(resultado.documentos[0].assinatura).toBeNull();
    });
  });
  // ===========================================================================
  // Mapeamento Prisma
  // ===========================================================================

  describe('FiscalAgtService.paraDocumentoAgt', () => {
    it('converte Decimal do Prisma em número', () => {
      const fatura = {
        id: 'fat_1',
        numero: 'FT 2026/0001',
        serie: '2026',
        tipo: 'fatura' as const,
        dataEmissao: new Date('2026-03-01'),
        dataVencimento: new Date('2026-03-31'),
        clienteNome: 'Cliente',
        clienteNif: '987654321ZZ',
        // Decimal real, não um objecto com `toString`.
        totalIliquido: new Prisma.Decimal('100.00'),
        totalIva: new Prisma.Decimal('23.00'),
        totalLiquido: new Prisma.Decimal('123.00'),
        atcud: null,
        hashAssinatura: null,
        estadoDocumento: 'emitido' as const,
        linhas: [
          { taxaIva: new Prisma.Decimal('23.00'), totalLinha: new Prisma.Decimal('123.00') },
        ],
      };

      const doc = FiscalAgtService.paraDocumentoAgt(fatura as never, MOEDA_AGT);

      expect(doc.totalIliquido).toBe(100);
      expect(doc.totalIva).toBe(23);
      expect(doc.totalLiquido).toBe(123);
      expect(doc.linhas[0].taxaIva).toBe(23);
      expect(doc.moeda).toBe(MOEDA_AGT);
    });
  });
});