/**
 * @file licensing.repository.test.ts
 * @description Testes da persistência de licenciamento: transacção de
 * substituição, ID global da instalação e ausência de estado persistido.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LicensingRepository, type DadosSubstituicaoLicenca } from './licensing.repository';

const ISSUED_AT = new Date('2026-11-01T10:00:00.000Z');
const NOT_BEFORE = new Date('2026-11-01T10:00:00.000Z');
const INSTALLED_AT = new Date('2026-11-24T12:00:00.000Z');

const dados: DadosSubstituicaoLicenca = {
  licenseId: 'LIC-2026-000001',
  productId: 'ERP_DESKTOP',
  customerName: 'Empresa Exemplo, Lda.',
  customerTaxNumber: '000000000',
  issuedAt: ISSUED_AT,
  notBefore: NOT_BEFORE,
  expiresAt: null,
  payloadJson: '{"keyId":"chave-1","licenseId":"LIC-2026-000001"}',
  signature: 'ASSINATURA_BASE64',
  keyId: 'chave-1',
  bindingMode: 'installation',
  installationId: 'instalacao-1',
  modulos: [
    { moduleKey: 'vendas', enabled: true },
    { moduleKey: 'estoque', enabled: false },
  ],
  installedAt: INSTALLED_AT,
  lastValidatedAt: INSTALLED_AT,
};

describe('LicensingRepository', () => {
  let tx: any;
  let mockPrisma: any;
  let repo: LicensingRepository;

  beforeEach(() => {
    tx = {
      license: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'lic-1' }),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      installation: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    };
    mockPrisma = {
      ...tx,
      $transaction: vi.fn(async (operacao: (cliente: any) => Promise<unknown>) => operacao(tx)),
    };
    repo = new LicensingRepository(mockPrisma);
  });

  describe('obterInstallationId', () => {
    it('reutiliza o identificador global persistido', async () => {
      tx.installation.findUnique.mockResolvedValue({ installationId: 'instalacao-existente' });

      expect(await repo.obterInstallationId()).toBe('instalacao-existente');
      expect(tx.installation.upsert).not.toHaveBeenCalled();
    });

    it('cria um identificador aleatório uma única vez', async () => {
      tx.installation.findUnique.mockResolvedValue(null);
      tx.installation.upsert.mockResolvedValue({ installationId: 'instalacao-gerada' });

      expect(await repo.obterInstallationId()).toBe('instalacao-gerada');
      expect(tx.installation.upsert).toHaveBeenCalledWith({
        where: { scope: 'global' },
        create: {
          scope: 'global',
          installationId: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          ),
        },
        update: {},
      });
    });
  });

  describe('substituirLicenca', () => {
    it('apaga a anterior e cria a nova na mesma transacção', async () => {
      await repo.substituirLicenca(dados);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.license.deleteMany).toHaveBeenCalledWith();
      expect(tx.license.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          licenseId: 'LIC-2026-000001',
          payloadJson: dados.payloadJson,
          signature: 'ASSINATURA_BASE64',
          keyId: 'chave-1',
          bindingMode: 'installation',
          installationId: 'instalacao-1',
          expiresAt: null,
          installedAt: INSTALLED_AT,
          lastValidatedAt: INSTALLED_AT,
          modulos: {
            create: [
              { moduleKey: 'vendas', enabled: true },
              { moduleKey: 'estoque', enabled: false },
            ],
          },
        }),
        include: { modulos: true },
      });
    });

    it('aceita uma transacção já aberta pelo serviço', async () => {
      await repo.substituirLicenca(dados, tx);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(tx.license.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('obterLicencaAtual', () => {
    it('inclui os módulos e escolhe a licença instalada mais recente', async () => {
      tx.license.findFirst.mockResolvedValue({ id: 'lic-1', modulos: [] });

      expect(await repo.obterLicencaAtual()).toEqual({ id: 'lic-1', modulos: [] });
      expect(tx.license.findFirst).toHaveBeenCalledWith({
        include: { modulos: true },
        orderBy: { installedAt: 'desc' },
      });
    });
  });

  describe('marcarValidacao', () => {
    it('actualiza apenas a data de revalidação', async () => {
      tx.license.updateMany.mockResolvedValue({ count: 1 });
      const agora = new Date('2026-11-24T13:00:00.000Z');

      expect(await repo.marcarValidacao('lic-1', agora)).toBe(true);
      expect(tx.license.updateMany).toHaveBeenCalledWith({
        where: { id: 'lic-1' },
        data: { lastValidatedAt: agora },
      });
    });
  });

  describe('removerLicenca', () => {
    it('remove apenas a licença; os módulos seguem por cascata', async () => {
      tx.license.deleteMany.mockResolvedValue({ count: 1 });

      expect(await repo.removerLicenca()).toBe(1);
      expect(tx.license.deleteMany).toHaveBeenCalledWith();
      expect(tx.installation.upsert).not.toHaveBeenCalled();
    });
  });
});
