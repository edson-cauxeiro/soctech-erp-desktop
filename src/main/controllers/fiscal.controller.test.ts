/**
 * @file fiscal.controller.test.ts
 * @description Testes de autorização do controlador fiscal.
 *
 * O alvo é uma classe de bug que nenhum outro teste apanha: o `empresaId` do
 * payload. Todo o resto da aplicação filtra pela empresa; o fiscal recebia-o do
 * renderer e usava-o tal como vinha. Um perfil com `fiscal: read` na empresa A
 * podia passar o id da empresa B e ler as vendas, a auditoria e a cadeia de
 * custódia da B. Passava a verificação de permissão — a permissão é a mesma —
 * e falhava só no dado.
 *
 * Os testes injectam os serviços para não tocar na base de dados. O que se
 * verifica é que a operação **não chega a ser executada** quando o pedido é de
 * outra empresa.
 *
 * Há aqui uma segunda classe de bug, que é a razão deste ficheiro ter crescido
 * para duas secções: o `com()` já embrulha em `ok()`, e uma rota que devolvia
 * `ok(...)` ou `err(...)` de dentro acabava com `success: true` embrulhado à
 * volta da resposta real. Uma validação SAF-T reprovada chegava ao ecrã como
 * conformidade. É um bug que nenhum teste de autorização apanha, porque a
 * autorização continua a estar certa.
 */

import { describe, it, expect, vi } from 'vitest';
import { FiscalController } from './fiscal.controller';
import type { IpcResponse } from '../utils/ipc-response';
import type { UserSession } from '../middlewares/rbac.middleware';

/**
 * O `gerarSaft` consulta a empresa pelo Prisma antes de gerar. Sem este mock, o
 * `empresaConfig.findUnique` real vai à base de dados de desenvolvimento e
 * devolve `null`, o que rebenta o teste por `NOT_FOUND` antes de chegar à
 * validação — que é a parte que este teste quer exercitar.
 */
vi.mock('../database/prisma', () => ({
  prisma: {
    empresaConfig: {
      findUnique: vi.fn(async () => ({ nome: 'DoraERP, Lda', moedaBase: 'AOA' })),
    },
  },
}));

/**
 * Lê o código de erro de uma resposta que se espera ter falhado.
 *
 * A resposta é uma união `success: true | false`, e o TypeScript só estreita o
 * tipo depois de `success` ser provado falso. Um `expect(...).toBe(false)` não
 * conta para o compilador, daí a função.
 */
function codigoDe(resposta: IpcResponse<unknown>): string | undefined {
  return resposta.success ? undefined : resposta.error.code;
}

const EMPRESA_SESSAO = 'empresa_da_sessao';
const EMPRESA_OUTRA = 'empresa_outra';

function sessao(sobreposicoes: Partial<UserSession> = {}): UserSession {
  return {
    id: 'util_1',
    login: 'ana.marques',
    nomeCompleto: 'Ana Marques',
    email: 'ana@doraerp.ao',
    perfilId: 'perfil_1',
    perfilNome: 'Financeiro',
    permissoes: { fiscal: ['read', 'write'] },
    empresaConfigId: EMPRESA_SESSAO,
    ...sobreposicoes,
  };
}

/** Serviço que regista se foi chamado, para provar que não foi. */
function servicoQueFalhaSeForChamado(nome: string) {
  return {
    gerar: vi.fn(async () => {
      throw new Error(`${nome} não devia ter sido chamado`);
    }),
    listar: vi.fn(async () => {
      throw new Error(`${nome}.listar não devia ter sido chamado`);
    }),
    verificarIntegridade: vi.fn(async () => {
      throw new Error(`${nome}.verificarIntegridade não devia ter sido chamado`);
    }),
    resumo: vi.fn(async () => {
      throw new Error(`${nome}.resumo não devia ter sido chamado`);
    }),
    obterDeEmpresa: vi.fn(async () => null),
    registarResposta: vi.fn(async () => {
      throw new Error(`${nome}.registarResposta não devia ter sido chamado`);
    }),
    gerarFicheiro: vi.fn(async () => {
      throw new Error(`${nome}.gerarFicheiro não devia ter sido chamado`);
    }),
  };
}

function criarController(sessaoActual: UserSession | null) {
  const saft = servicoQueFalhaSeForChamado('saft');
  const agt = servicoQueFalhaSeForChamado('agt');
  const audit = servicoQueFalhaSeForChamado('audit');
  const auth = { getCurrentSession: () => sessaoActual };

  const controller = new FiscalController(auth as never, audit as never, saft as never, agt as never);
  return { controller, saft, agt, audit };
}

describe('FiscalController — empresa da sessão', () => {
  it('recusa gerar SAF-T de outra empresa', async () => {
    const { controller, saft } = criarController(sessao());

    const resposta = await controller.gerarSaft({
      empresaId: EMPRESA_OUTRA,
      ano: 2026,
      mes: 1,
    });

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('FORBIDDEN');
    // O serviço não pode ter sido chamado: o erro tem de ser antes do acesso
    // a dados, não depois.
    expect(saft.gerar).not.toHaveBeenCalled();
  });

  it('recusa validar SAF-T de outra empresa', async () => {
    const { controller, saft } = criarController(sessao());

    const resposta = await controller.validarSaft({
      empresaId: EMPRESA_OUTRA,
      ano: 2026,
      mes: 1,
    });

    expect(resposta.success).toBe(false);
    expect(saft.gerar).not.toHaveBeenCalled();
  });

  it('recusa gerar AGT de outra empresa', async () => {
    const { controller, agt } = criarController(sessao());

    const resposta = await controller.gerarAgt({
      empresaId: EMPRESA_OUTRA,
      ano: 2026,
      mes: 1,
      software: {
        nome: 'DoraERP',
        versao: '1.0.0',
        chaveSeguranca: 'CHAVE',
        certificado: 'CERT-1',
      },
    });

    expect(resposta.success).toBe(false);
    expect(agt.gerarFicheiro).not.toHaveBeenCalled();
  });

  it('recusa listar a auditoria de outra empresa', async () => {
    const { controller, audit } = criarController(sessao());

    const resposta = await controller.listarAuditoria({ empresaId: EMPRESA_OUTRA });

    expect(resposta.success).toBe(false);
    expect(audit.listar).not.toHaveBeenCalled();
  });

  it('recusa verificar a integridade da auditoria de outra empresa', async () => {
    const { controller, audit } = criarController(sessao());

    const resposta = await controller.verificarIntegridade({ empresaId: EMPRESA_OUTRA });

    expect(resposta.success).toBe(false);
    expect(audit.verificarIntegridade).not.toHaveBeenCalled();
  });

  it('recusa resumir a auditoria de outra empresa', async () => {
    const { controller, audit } = criarController(sessao());

    const resposta = await controller.resumoAuditoria({ empresaId: EMPRESA_OUTRA });

    expect(resposta.success).toBe(false);
    expect(audit.resumo).not.toHaveBeenCalled();
  });

  it('recusa listar submissões AGT de outra empresa', async () => {
    const { controller, agt } = criarController(sessao());

    const resposta = await controller.listarSubmissoes({ empresaId: EMPRESA_OUTRA });

    expect(resposta.success).toBe(false);
    expect(agt.listar).not.toHaveBeenCalled();
  });
});

describe('FiscalController — submissão AGT entre empresas', () => {
  it('recusa registar resposta numa submissão de outra empresa', async () => {
    // O `submissaoId` é previsível e a rota não receives a empresa. Sem o
    // `obterDeEmpresa`, bastava conhecer um id alheio para injectar uma
    // resposta forjada na cadeia de custódia fiscal de outra empresa.
    const { controller, agt } = criarController(sessao());

    const resposta = await controller.registarRespostaAgt({
      submissaoId: 'submissao_alheia',
      estado: 'aceite',
      respostaAgt: '{"codigo":"0"}',
      hashRecebido: 'a'.repeat(64),
    });

    expect(resposta.success).toBe(false);
    expect(agt.registarResposta).not.toHaveBeenCalled();
  });
});

describe('FiscalController — permissões', () => {
  it('recusa leitura sem permissão fiscal', async () => {
    const semFiscal = sessao({ permissoes: { vendas: ['read'] } });
    const { controller, audit } = criarController(semFiscal);

    const resposta = await controller.listarAuditoria({ empresaId: EMPRESA_SESSAO });

    expect(resposta.success).toBe(false);
    expect(audit.listar).not.toHaveBeenCalled();
  });

  it('recusa escrita sem permissão de escrita, mesmo com leitura', async () => {
    // A distinção entre `read` e `write` não é decorativa: gerar um ficheiro
    // fiscal escreve em disco e altera o estado fiscal da empresa.
    const soLeitura = sessao({ permissoes: { fiscal: ['read'] } });
    const { controller, saft } = criarController(soLeitura);

    const resposta = await controller.gerarSaft({
      empresaId: EMPRESA_SESSAO,
      ano: 2026,
      mes: 1,
    });

    expect(resposta.success).toBe(false);
    expect(saft.gerar).not.toHaveBeenCalled();
  });

  it('recusa tudo sem sessão', async () => {
    const { controller, audit } = criarController(null);

    const resposta = await controller.listarAuditoria({ empresaId: EMPRESA_SESSAO });

    expect(resposta.success).toBe(false);
    expect(audit.listar).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Envelope IPC
// ===========================================================================

/**
 * Um `AuditService` que responde com dados em vez de falhar.
 *
 * `servicoQueFalhaSeForChamado` serve para provar que um serviço não foi
 * chamado. Aqui o oposto: é preciso que a operação chegue ao fim para se ver
 * o que o renderer recebe.
 */
function auditComDados() {
  return {
    listar: vi.fn(async () => ({
      registos: [{ id: 'reg_1', acao: 'exportar' }],
      proximoCursor: null,
      total: 1,
    })),
    verificarIntegridade: vi.fn(async () => ({
      totalVerificados: 3,
      adulterados: [],
      integro: true,
    })),
    resumo: vi.fn(async () => ({ criar: 1 })),
    registar: vi.fn(async () => 'aud_1'),
    registarOperacao: vi.fn(async () => 'aud_1'),
  };
}

describe('FiscalController — envelope IPC', () => {
  function controllerCom(overrides: Record<string, unknown> = {}) {
    const audit = { ...auditComDados(), ...overrides } as never;
    return new FiscalController(
      { getCurrentSession: () => sessao() } as never,
      audit,
      servicoQueFalhaSeForChamado('saft') as never,
      servicoQueFalhaSeForChamado('agt') as never,
    );
  }

  it('entrega a lista de auditoria directamente em `data`', async () => {
    const resposta = await controllerCom().listarAuditoria({ empresaId: EMPRESA_SESSAO });

    // Com duplo envelope o renderer recebia `{ data: { data: [...] } }` e o
    // ecrã de auditoria ficava a iterar sobre `undefined`.
    expect(resposta.success).toBe(true);
    if (!resposta.success) throw new Error('deveria ser sucesso');
    expect(resposta.data).toMatchObject({ total: 1 });
    expect((resposta.data as { registos?: unknown }).registos).toHaveLength(1);
  });

  it('entrega a verificação de integridade sem envelope extra', async () => {
    const resposta = await controllerCom().verificarIntegridade({ empresaId: EMPRESA_SESSAO });

    if (!resposta.success) throw new Error('deveria ser sucesso');
    expect(resposta.data).toMatchObject({ integro: true, totalVerificados: 3 });
  });

  it('devolve o resumo por acção sem envelope extra', async () => {
    const resposta = await controllerCom().resumoAuditoria({ empresaId: EMPRESA_SESSAO });

    if (!resposta.success) throw new Error('deveria ser sucesso');
    expect(resposta.data).toMatchObject({ porAcao: { criar: 1 } });
  });

  it('reporta uma validação SAF-T reprovada como falha, não como sucesso', async () => {
    // Este é o teste que vale a pena: a rota devolvia `err(...)` de dentro do
    // `com()`, que a embrulhava em `ok()`. O ficheiro reprovado chegava ao
    // ecrã como `success: true` e o painel mostrava conformidade.
    const saft = {
      gerar: vi.fn(async () => ({
        nomeFicheiro: 'SAFTPT01_2026_01.xml',
        xml: '<AuditFile/>',
        hashFicheiro: 'a'.repeat(64),
        validacao: {
          valido: false,
          totalErros: 3,
          totalAvisos: 0,
          problemas: [{ codigo: 'E001', severidade: 'erro' }],
        },
        estatisticas: { documentos: 0, totalLiquido: 0 },
      })),
    } as never;

    const controller = new FiscalController(
      { getCurrentSession: () => sessao() } as never,
      { ...auditComDados(), registar: vi.fn(async () => 'aud_1') } as never,
      saft,
      servicoQueFalhaSeForChamado('agt') as never,
    );

    const resposta = await controller.gerarSaft({ empresaId: EMPRESA_SESSAO, ano: 2026, mes: 1 });

    expect(resposta.success).toBe(false);
    expect(codigoDe(resposta)).toBe('SAFT_VALIDACAO_FALHOU');
  });

  it('devolve as submissões AGT como array, não embrulhadas', async () => {
    const agt = { listar: vi.fn(async () => [{ id: 'sub_1', estado: 'assinado' }]) } as never;

    const controller = new FiscalController(
      { getCurrentSession: () => sessao() } as never,
      auditComDados() as never,
      servicoQueFalhaSeForChamado('saft') as never,
      agt,
    );

    const resposta = await controller.listarSubmissoes({ empresaId: EMPRESA_SESSAO });

    if (!resposta.success) throw new Error('deveria ser sucesso');
    expect(Array.isArray(resposta.data)).toBe(true);
    expect(resposta.data).toHaveLength(1);
  });
});
