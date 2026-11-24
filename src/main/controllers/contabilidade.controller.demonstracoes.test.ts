/**
 * @file contabilidade.controller.demonstracoes.test.ts
 * @description Exportação de demonstrações financeiras pelo IPC da
 * contabilidade: ficheiro escrito, auditoria e isolamento entre empresas.
 *
 * O serviço `DemonstracoesService.gerar` não recebe empresaId — a estrutura é
 * a única fonte dessa informação. Um dos testes fixa por isso a recusa de uma
 * estrutura de outra empresa antes de qualquer valor ser gerado ou escrito.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserSession } from '../middlewares/rbac.middleware';
import { ContabilidadeController } from './contabilidade.controller';

/**
 * `vi.mock` sobe ao topo do ficheiro, antes dos `const`: os mocks partilhados
 * têm de nascer dentro de `vi.hoisted`.
 */
const { showSaveDialog, writeFile } = vi.hoisted(() => ({
  showSaveDialog: vi.fn(
    async (_janela: unknown, _opcoes: unknown): Promise<{ canceled: boolean; filePath?: string }> => ({
      canceled: true,
    }),
  ),
  writeFile: vi.fn(async (_caminho: string, _conteudo: unknown): Promise<void> => undefined),
}));

vi.mock('electron', () => ({
  dialog: { showSaveDialog },
  BrowserWindow: { fromWebContents: () => ({ id: 1 }) },
  ipcMain: { handle: () => undefined },
}));

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  writeFile,
}));

// O gerador real abre uma janela do Chromium, que não existe em Vitest.
vi.mock('../services/relatorio-pdf.service', () => ({
  gerarPdfRelatorio: vi.fn(async (): Promise<Buffer> => Buffer.from('%PDF-1.4 fake')),
  tituloRelatorio: (nome: string) => nome,
}));

const EMPRESA = 'empresa_1';
const OUTRA_EMPRESA = 'empresa_2';

function sessao(overrides: Partial<UserSession> = {}): UserSession {
  return {
    id: 'util_1',
    login: 'ana.marques',
    nomeCompleto: 'Ana Marques',
    email: 'ana@doraerp.ao',
    perfilId: 'perfil_1',
    perfilNome: 'Financeiro',
    permissoes: { financas: ['read', 'write'] },
    empresaConfigId: EMPRESA,
    ...overrides,
  };
}

const DEMONSTRACAO = {
  estruturaId: 'estr-1',
  codigo: 'BALANCO',
  designacao: 'Balanço',
  tipo: 'balanco',
  dataInicio: '2026-01-01',
  dataFim: '2026-12-31',
  linhas: [
    {
      linhaId: 'linha-1',
      codigo: 'AT',
      designacao: 'Activo',
      nivel: 1,
      tipo: 'activo',
      sinal: 1,
      valor: '100.0000',
      filhos: [
        {
          linhaId: 'linha-2',
          codigo: 'AT1',
          designacao: 'Activo corrente',
          nivel: 2,
          tipo: 'activo',
          sinal: 1,
          valor: '40.0000',
          filhos: [],
        },
      ],
    },
  ],
  totais: { AT: '100.0000' },
  avisos: [],
};

function criarController(
  empresaEstrutura = EMPRESA,
  sessaoOverrides: Partial<UserSession> = {}
) {
  const estrutura = {
    id: 'estr-1',
    empresaId: empresaEstrutura,
    codigo: 'BALANCO',
    designacao: 'Balanço',
    tipo: 'balanco',
    activa: true,
    linhas: [],
  };
  const demonstracoes = {
    listarEstruturas: vi.fn(async (_empresaId: string) => [estrutura]),
    obterEstrutura: vi.fn(async (_id: string) => estrutura),
    guardarEstrutura: vi.fn(async (_empresaId: string, _input: unknown) => estrutura),
    removerEstrutura: vi.fn(async (_empresaId: string, _id: string) => undefined),
    gerar: vi.fn(async () => DEMONSTRACAO),
  };
  const auth = { getCurrentSession: vi.fn(() => sessao(sessaoOverrides)) };
  const audit = {
    registar: vi.fn(
      async (_registo: {
        empresaId: string;
        utilizadorId?: string | null;
        modulo?: string;
        acao: string;
        entidade: string;
        descricao: string;
        dadosNovos?: unknown;
      }): Promise<void> => undefined,
    ),
  };

  const controller = new ContabilidadeController(
    {} as any, // contas
    {} as any, // diarios
    {} as any, // periodos
    {} as any, // mapeamentos
    {} as any, // seed
    {} as any, // exercicios
    {} as any, // lancamentos
    {} as any, // reconciliacao
    {} as any, // motor
    {} as any, // integracao
    {} as any, // relatorios
    {} as any, // fecho
    {} as any, // apuramento
    {} as any, // apuramentoResultados
    {} as any, // fechoAnual
    demonstracoes as any,
    auth as any,
    audit as any,
  );
  return { controller, demonstracoes, audit };
}

const pedido = {
  relatorio: 'demonstracao',
  formato: 'csv',
  filtros: {
    estruturaId: 'estr-1',
    dataInicio: '2026-01-01',
    dataFim: '2026-12-31',
  },
} as const;

describe('ContabilidadeController — exportação de demonstrações', () => {
  beforeEach(() => {
    showSaveDialog.mockReset();
    writeFile.mockClear();
  });

  it('escreve o ficheiro e audita a exportação com relatorio=demonstracao', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/demonstracao.csv' });
    const { controller, demonstracoes, audit } = criarController();

    const resposta = await controller.exportarRelatorio(pedido, { id: 1 } as never);

    expect(resposta.success).toBe(true);
    if (!resposta.success) throw new Error(resposta.error.message);
    expect(resposta.data).toMatchObject({
      caminho: 'C:/tmp/demonstracao.csv',
      linhas: 2,
      formato: 'csv',
    });

    expect(demonstracoes.obterEstrutura).toHaveBeenCalledWith('estr-1');
    expect(demonstracoes.gerar).toHaveBeenCalledWith('estr-1', '2026-01-01', '2026-12-31');
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0][0]).toBe('C:/tmp/demonstracao.csv');

    const conteudo = (writeFile.mock.calls[0][1] as Buffer).toString('utf8');
    expect(conteudo).toContain('Código;Designação;Valor');
    expect(conteudo).toContain('Activo corrente');
    expect(conteudo).toContain('100.0000');

    expect(audit.registar).toHaveBeenCalledTimes(1);
    const registo = audit.registar.mock.calls[0][0];
    expect(registo).toMatchObject({
      empresaId: EMPRESA,
      utilizadorId: 'util_1',
      modulo: 'financas',
      acao: 'exportar',
      entidade: 'Relatorio',
    });
    expect(registo.dadosNovos).toMatchObject({
      relatorio: 'demonstracao',
      formato: 'csv',
      ficheiro: 'C:/tmp/demonstracao.csv',
      linhas: 2,
    });
  });

  it('recusa uma estrutura de outra empresa', async () => {
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/demonstracao.csv' });
    const { controller, demonstracoes, audit } = criarController(OUTRA_EMPRESA);

    const resposta = await controller.exportarRelatorio(pedido, { id: 1 } as never);

    expect(resposta.success).toBe(false);
    if (resposta.success) throw new Error('A exportação de outra empresa devia falhar');
    expect(resposta.error.code).toBe('FORBIDDEN');
    expect(demonstracoes.gerar).not.toHaveBeenCalled();
    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(audit.registar).not.toHaveBeenCalled();
  });

  it('devolve cancelado sem escrever nem auditar', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });
    const { controller, audit } = criarController();

    const resposta = await controller.exportarRelatorio(pedido, { id: 1 } as never);

    expect(resposta.success).toBe(true);
    if (!resposta.success) throw new Error(resposta.error.message);
    expect(resposta.data).toMatchObject({ cancelado: true });
    expect(writeFile).not.toHaveBeenCalled();
    expect(audit.registar).not.toHaveBeenCalled();
  });
});

describe('ContabilidadeController — isolamento das estruturas de relatório', () => {
  it('lista estruturas apenas da empresa da sessão, ignorando o empresaId do chamador', async () => {
    const { controller, demonstracoes } = criarController();

    const resposta = await controller.listarEstruturas(OUTRA_EMPRESA);

    expect(resposta.success).toBe(true);
    expect(demonstracoes.listarEstruturas).toHaveBeenCalledWith(EMPRESA);
  });

  it('guarda estruturas apenas na empresa da sessão', async () => {
    const { controller, demonstracoes } = criarController();
    const payload = { codigo: 'BALANCO', designacao: 'Balanço', linhas: [] };

    const resposta = await controller.guardarEstrutura(OUTRA_EMPRESA, payload);

    expect(resposta.success).toBe(true);
    expect(demonstracoes.guardarEstrutura).toHaveBeenCalledWith(EMPRESA, payload);
  });

  it('recusa obter uma estrutura de outra empresa', async () => {
    const { controller, demonstracoes } = criarController(OUTRA_EMPRESA);

    const resposta = await controller.obterEstrutura('estr-1');

    expect(resposta.success).toBe(false);
    if (resposta.success) throw new Error('A estrutura de outra empresa não devia ser devolvida');
    expect(resposta.error.code).toBe('FORBIDDEN');
    expect(demonstracoes.obterEstrutura).toHaveBeenCalledWith('estr-1');
  });

  it('recusa gerar demonstração de uma estrutura de outra empresa', async () => {
    const { controller, demonstracoes } = criarController(OUTRA_EMPRESA);

    const resposta = await controller.gerarDemonstracao('estr-1', '2026-01-01', '2026-12-31');

    expect(resposta.success).toBe(false);
    if (resposta.success) throw new Error('A demonstração de outra empresa não devia ser gerada');
    expect(resposta.error.code).toBe('FORBIDDEN');
    expect(demonstracoes.gerar).not.toHaveBeenCalled();
  });

  it('gera demonstração quando a estrutura pertence à empresa da sessão', async () => {
    const { controller, demonstracoes } = criarController();

    const resposta = await controller.gerarDemonstracao('estr-1', '2026-01-01', '2026-12-31');

    expect(resposta.success).toBe(true);
    expect(demonstracoes.obterEstrutura).toHaveBeenCalledWith('estr-1');
    expect(demonstracoes.gerar).toHaveBeenCalledWith(
      'estr-1',
      new Date('2026-01-01'),
      new Date('2026-12-31')
    );
  });

  it('recusa operar sem empresa na sessão', async () => {
    const { controller, demonstracoes } = criarController(EMPRESA, {
      empresaConfigId: undefined,
    });

    const resposta = await controller.listarEstruturas(OUTRA_EMPRESA);

    expect(resposta.success).toBe(false);
    if (resposta.success) throw new Error('Sem empresa na sessão a listagem devia falhar');
    expect(resposta.error.code).toBe('VALIDATION_ERROR');
    expect(demonstracoes.listarEstruturas).not.toHaveBeenCalled();
  });
});
