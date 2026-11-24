/**
 * @file licensing.service.test.ts
 * @description Testes do serviço de licenciamento: decisão no Main,
 * revalidação do documento guardado, importação sem substituir licença válida
 * em caso de erro e auditoria sem segredos.
 */

import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalize } from '../../shared/licensing/canonical';
import { LICENSE_FILE_EXTENSION } from '../../shared/licensing/file';
import type { LicensePublicKey } from './licensing/public-keys';
import type { AuditService } from './audit.service';
import type { LicensingRepository, LicenseComModulos } from '../repositories/licensing.repository';
import { LicensingError } from '../utils/licensing-errors';
import { LicensingService, type LeitorFicheirosLicenca } from './licensing.service';

const NOW = new Date('2026-11-24T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const INSTALLATION_ID = 'instalacao-teste';
const KEY_ID = 'chave-teste';
const CAMINHO = `licenca${LICENSE_FILE_EXTENSION}`;

function criarChave(keyId: string): {
  entry: LicensePublicKey;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    entry: { keyId, publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() },
    privateKey,
  };
}

const chave = criarChave(KEY_ID);
const chaveDesconhecida = criarChave('chave-desconhecida');

function iso(offset: number): string {
  return new Date(NOW.getTime() + offset).toISOString();
}

function payloadBase(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    licenseId: 'LIC-2026-000001',
    productId: 'ERP_DESKTOP',
    customer: { name: 'Empresa Exemplo, Lda.', taxNumber: '000000000' },
    issuedAt: iso(-DAY),
    notBefore: iso(-DAY),
    expiresAt: null,
    modules: [
      { key: 'vendas', enabled: true },
      { key: 'estoque', enabled: true },
      { key: 'configuracoes', enabled: true },
    ],
    limits: { maxUsers: null, maxDevices: 1 },
    installation: { bindingMode: 'installation', installationId: INSTALLATION_ID },
    keyId: KEY_ID,
  };
}

function documentoAssinado(
  payload: Record<string, unknown> = payloadBase(),
  origem = chave
): { payload: Record<string, unknown>; signature: string } {
  return {
    payload,
    signature: sign(null, Buffer.from(canonicalize(payload), 'utf8'), origem.privateKey).toString('base64'),
  };
}

function registroDe(payload: Record<string, unknown>, signature: string): LicenseComModulos {
  const instalacao = payload['installation'] as { bindingMode: string; installationId: string | null };
  return {
    id: 'lic-1',
    licenseId: payload['licenseId'] as string,
    productId: payload['productId'] as string,
    customerName: (payload['customer'] as { name: string }).name,
    customerTaxNumber: (payload['customer'] as { taxNumber?: string | null }).taxNumber ?? null,
    issuedAt: new Date(payload['issuedAt'] as string),
    notBefore: new Date(payload['notBefore'] as string),
    expiresAt: payload['expiresAt'] ? new Date(payload['expiresAt'] as string) : null,
    installedAt: NOW,
    lastValidatedAt: NOW,
    payloadJson: canonicalize(payload),
    signature,
    keyId: payload['keyId'] as string,
    bindingMode: instalacao.bindingMode,
    installationId: instalacao.installationId,
    createdAt: NOW,
    updatedAt: NOW,
    modulos: ((payload['modules'] as Array<{ key: string; enabled: boolean }>) ?? []).map((modulo, indice) => ({
      id: `mod-${indice}`,
      licenseId: 'lic-1',
      moduleKey: modulo.key,
      enabled: modulo.enabled,
    })),
  } as LicenseComModulos;
}

describe('LicensingService', () => {
  let repositorio: any;
  let leitor: LeitorFicheirosLicenca;
  let auditoria: any;
  let servico: LicensingService;
  let contexto: { empresaId: string; utilizadorId: string };

  beforeEach(() => {
    repositorio = {
      obterInstallationId: vi.fn().mockResolvedValue(INSTALLATION_ID),
      obterLicencaAtual: vi.fn().mockResolvedValue(null),
      substituirLicenca: vi.fn(async (dados: any) => ({
        id: 'lic-1',
        ...dados,
        modulos: dados.modulos.map((modulo: any, indice: number) => ({ id: `mod-${indice}`, ...modulo })),
      })),
      marcarValidacao: vi.fn().mockResolvedValue(true),
      removerLicenca: vi.fn().mockResolvedValue(1),
    };
    leitor = {
      stat: vi.fn().mockResolvedValue({ size: 1024 }),
      readFile: vi.fn(),
    };
    auditoria = {
      registar: vi.fn().mockResolvedValue('aud-1'),
      listar: vi.fn().mockResolvedValue({ registos: [], proximoCursor: null, total: 0 }),
    };
    servico = new LicensingService({
      repository: repositorio as unknown as LicensingRepository,
      publicKeys: [chave.entry],
      agora: () => NOW,
      leitorFicheiros: leitor,
      auditoria: auditoria as unknown as Pick<AuditService, 'registar' | 'listar'>,
    });
    contexto = { empresaId: 'emp-1', utilizadorId: 'util-1' };
  });

  describe('obterEstado', () => {
    it('devolve MISSING sem direitos de módulo comercial', async () => {
      const estado = await servico.obterEstado();

      expect(estado.status).toBe('MISSING');
      expect(estado.summary).toBeNull();
      expect(estado.licensedModules).toEqual([]);
      expect(estado.installationId).toBe(INSTALLATION_ID);
      expect(estado.modules.find((modulo) => modulo.key === 'configuracoes')).toMatchObject({
        licensed: false,
        alwaysAvailable: true,
      });
    });

    it('revalida o payload assinado guardado e ignora colunas-resumo adulteradas', async () => {
      const documento = documentoAssinado();
      const registro = registroDe(documento.payload, documento.signature);
      registro.customerName = 'Nome alterado à mão';
      registro.modulos = [];
      repositorio.obterLicencaAtual.mockResolvedValue(registro);

      const estado = await servico.obterEstado();

      expect(estado.status).toBe('VALID');
      expect(estado.summary?.customerName).toBe('Empresa Exemplo, Lda.');
      expect(estado.licensedModules).toContain('vendas');
      expect(estado.modules.find((modulo) => modulo.key === 'rh')?.licensed).toBe(false);
    });

    it('não aceita uma linha cujo payload guardado foi adulterado', async () => {
      const documento = documentoAssinado();
      const registro = registroDe(documento.payload, documento.signature);
      registro.payloadJson = canonicalize({ ...documento.payload, customer: { name: 'Adulterado' } });
      repositorio.obterLicencaAtual.mockResolvedValue(registro);

      expect((await servico.obterEstado()).status).toBe('INVALID_SIGNATURE');
    });

    it('devolve EXPIRED quando a validade passou', async () => {
      const payload = payloadBase();
      payload['expiresAt'] = iso(-1000);
      const documento = documentoAssinado(payload);
      repositorio.obterLicencaAtual.mockResolvedValue(registroDe(documento.payload, documento.signature));

      expect((await servico.obterEstado()).status).toBe('EXPIRED');
    });
  });

  describe('checkModuleAccess', () => {
    it('bloqueia módculo não licenciado mas mantém configuracoes acessível', async () => {
      const documento = documentoAssinado();
      repositorio.obterLicencaAtual.mockResolvedValue(registroDe(documento.payload, documento.signature));

      expect(await servico.checkModuleAccess('rh')).toEqual({
        allowed: false,
        reason: 'MODULE_NOT_LICENSED',
      });
      expect(await servico.checkModuleAccess('configuracoes')).toEqual({
        allowed: true,
        reason: 'LICENSE_ACTIVE',
      });
    });

    it('devolve INSTALLATION_MISMATCH quando a licença está vinculada a outra instalação', async () => {
      const payload = payloadBase();
      payload['installation'] = { bindingMode: 'installation', installationId: 'outra-instalacao' };
      const documento = documentoAssinado(payload);
      repositorio.obterLicencaAtual.mockResolvedValue(registroDe(documento.payload, documento.signature));

      expect((await servico.obterEstado()).status).toBe('INSTALLATION_MISMATCH');
      expect(await servico.checkModuleAccess('vendas')).toEqual({
        allowed: false,
        reason: 'INSTALLATION_MISMATCH',
      });
    });

    it('não licencia módulos inventados', async () => {
      expect(await servico.checkModuleAccess('modulo-inexistente')).toEqual({
        allowed: false,
        reason: 'MODULE_NOT_LICENSED',
      });
    });
  });

  describe('importLicenseDocument', () => {
    it('valida antes de persistir e guarda bytes canónicos e assinatura', async () => {
      const documento = documentoAssinado();

      const resultado = await servico.importLicenseDocument(documento, contexto);

      expect(resultado.valid).toBe(true);
      expect(repositorio.substituirLicenca).toHaveBeenCalledWith(
        expect.objectContaining({
          payloadJson: canonicalize(documento.payload),
          signature: documento.signature,
          keyId: KEY_ID,
          bindingMode: 'installation',
          installationId: INSTALLATION_ID,
          modulos: expect.arrayContaining([{ moduleKey: 'vendas', enabled: true }]),
        })
      );
      expect(auditoria.registar).toHaveBeenCalledWith(
        expect.objectContaining({ modulo: 'configuracoes', entidade: 'License', acao: 'actualizar' })
      );
      const dados = auditoria.registar.mock.calls[0][0].dadosNovos;
      expect(JSON.stringify(dados)).not.toContain(documento.signature);
      expect(JSON.stringify(dados)).not.toContain('payloadJson');
    });

    it('não substitui a licença actual quando a assinatura é inválida', async () => {
      const documento = documentoAssinado();
      const adulterado = { ...documento, payload: { ...documento.payload, licenseId: 'LIC-FALSIFICADA' } };

      await expect(servico.importLicenseDocument(adulterado, contexto)).rejects.toMatchObject({
        status: 'INVALID_SIGNATURE',
      });
      expect(repositorio.substituirLicenca).not.toHaveBeenCalled();
      expect(repositorio.removerLicenca).not.toHaveBeenCalled();
    });

    it('rejeita chave desconhecida sem gravar', async () => {
      const documento = documentoAssinado(payloadBase(), chaveDesconhecida);
      documento.payload = { ...documento.payload, keyId: 'chave-desconhecida' };

      await expect(servico.importLicenseDocument(documento, contexto)).rejects.toMatchObject({
        status: 'UNKNOWN_KEY',
      });
      expect(repositorio.substituirLicenca).not.toHaveBeenCalled();
    });
  });

  describe('importLicenseFile', () => {
    it('rejeita extensão, tamanho e JSON inválidos antes de tocar na base', async () => {
      await expect(servico.importLicenseFile('licenca.txt', contexto)).rejects.toBeInstanceOf(LicensingError);
      expect((leitor.stat as any).mock.calls).toHaveLength(0);

      (leitor.stat as any).mockResolvedValueOnce({ size: 1024 * 1024 });
      await expect(servico.importLicenseFile(CAMINHO, contexto)).rejects.toMatchObject({
        details: { reason: 'SIZE' },
      });

      (leitor.readFile as any).mockResolvedValueOnce('{ JSON partido');
      await expect(servico.importLicenseFile(CAMINHO, contexto)).rejects.toMatchObject({
        details: { reason: 'JSON' },
      });
      expect(repositorio.substituirLicenca).not.toHaveBeenCalled();
    });

    it('pré-visualiza sem persistir', async () => {
      const documento = documentoAssinado();
      (leitor.readFile as any).mockResolvedValueOnce(JSON.stringify(documento));

      const previsualizacao = await servico.previewLicenseFile(CAMINHO);

      expect(previsualizacao).toMatchObject({ valid: true, status: 'VALID' });
      expect(previsualizacao.summary?.licenseId).toBe('LIC-2026-000001');
      expect(repositorio.substituirLicenca).not.toHaveBeenCalled();
      expect(auditoria.registar).not.toHaveBeenCalled();
    });
  });

  describe('removerLicenca e auditoria', () => {
    it('remove apenas a licença e regista o evento em configuracoes', async () => {
      expect(await servico.removerLicenca(contexto)).toBe(true);

      expect(repositorio.removerLicenca).toHaveBeenCalledTimes(1);
      expect(auditoria.registar).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'eliminar', modulo: 'configuracoes' })
      );
    });

    it('revalida no arranque e regista o estado resultante', async () => {
      await servico.revalidarLicencaArmazenada(contexto);

      expect(auditoria.registar).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'validar', dadosNovos: { status: 'MISSING' } })
      );
    });

    it('consulta o histórico no AuditLog com o módulo de configurações', async () => {
      await servico.listarEventos('emp-1', 10);

      expect(auditoria.listar).toHaveBeenCalledWith(
        expect.objectContaining({ empresaId: 'emp-1', modulo: 'configuracoes', entidade: 'License', limite: 10 })
      );
    });
  });
});
