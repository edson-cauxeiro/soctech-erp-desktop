/**
 * @file licensing.repository.ts
 * @description Acesso a dados de licenciamento local.
 *
 * Camada fina, seguindo o padrão dos repositories existentes: não decide,
 * não valida assinaturas e não infere direitos. O serviço valida o documento
 * assinado antes de chamar `substituirLicenca`, que apaga a licença anterior
 * e cria a nova na mesma transacção.
 */

import { randomUUID } from 'node:crypto';
import { type License, type LicensedModule, type Prisma, type PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';
import type { InstallationBindingMode, LicensingModuleKey } from '../../shared/licensing/types';

/** Cliente Prisma ou o cliente já isolado dentro de uma transacção. */
type Cliente = Prisma.TransactionClient | PrismaClient;

export type LicenseComModulos = License & { modulos: LicensedModule[] };

export interface ModuloLicencaPersistido {
  moduleKey: LicensingModuleKey;
  enabled: boolean;
}

/** Dados derivados do payload assinado; a assinatura continua a ser a autoridade. */
export interface DadosSubstituicaoLicenca {
  licenseId: string;
  productId: string;
  customerName: string;
  customerTaxNumber?: string | null;
  issuedAt: Date;
  notBefore: Date;
  expiresAt?: Date | null;
  /** Bytes canónicos exactamente como foram verificados. */
  payloadJson: string;
  signature: string;
  keyId: string;
  bindingMode: InstallationBindingMode;
  installationId?: string | null;
  modulos: readonly ModuloLicencaPersistido[];
  installedAt?: Date;
  lastValidatedAt?: Date;
}

export class LicensingRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  private cliente(tx?: Prisma.TransactionClient): Cliente {
    return tx ?? this.prisma;
  }

  private async transacao<T>(
    operacao: (tx: Prisma.TransactionClient) => Promise<T>,
    tx?: Prisma.TransactionClient
  ): Promise<T> {
    return tx ? operacao(tx) : this.prisma.$transaction(operacao);
  }

  /**
   * Devolve o identificador global da instalação, criando-o uma única vez.
   *
   * `scope` é único, por isso duas chamadas concorrentes não criam dois IDs:
   * uma falharia na restrição e a restante seria devolvida pelo `upsert`.
   */
  async obterInstallationId(tx?: Prisma.TransactionClient): Promise<string> {
    const cliente = this.cliente(tx);
    const existente = await cliente.installation.findUnique({ where: { scope: 'global' } });
    if (existente) return existente.installationId;

    const criada = await cliente.installation.upsert({
      where: { scope: 'global' },
      create: { scope: 'global', installationId: randomUUID() },
      update: {},
    });
    return criada.installationId;
  }

  /** Substitui a licença actual de forma atómica. A anterior nunca fica órfã. */
  async substituirLicenca(
    dados: DadosSubstituicaoLicenca,
    tx?: Prisma.TransactionClient
  ): Promise<LicenseComModulos> {
    return this.transacao(async (cliente) => {
      await cliente.license.deleteMany();
      return cliente.license.create({
        data: {
          licenseId: dados.licenseId,
          productId: dados.productId,
          customerName: dados.customerName,
          customerTaxNumber: dados.customerTaxNumber ?? null,
          issuedAt: dados.issuedAt,
          notBefore: dados.notBefore,
          expiresAt: dados.expiresAt ?? null,
          installedAt: dados.installedAt ?? new Date(),
          lastValidatedAt: dados.lastValidatedAt ?? null,
          payloadJson: dados.payloadJson,
          signature: dados.signature,
          keyId: dados.keyId,
          bindingMode: dados.bindingMode,
          installationId: dados.installationId ?? null,
          modulos: {
            create: dados.modulos.map((modulo) => ({
              moduleKey: modulo.moduleKey,
              enabled: modulo.enabled,
            })),
          },
        },
        include: { modulos: true },
      });
    }, tx);
  }

  /** `null` quando não existe licença instalada. */
  async obterLicencaAtual(tx?: Prisma.TransactionClient): Promise<LicenseComModulos | null> {
    return this.cliente(tx).license.findFirst({
      include: { modulos: true },
      orderBy: { installedAt: 'desc' },
    });
  }

  /** Actualiza apenas o momento da última revalidação; nunca grava um estado. */
  async marcarValidacao(
    licenseId: string,
    data: Date = new Date(),
    tx?: Prisma.TransactionClient
  ): Promise<boolean> {
    const resultado = await this.cliente(tx).license.updateMany({
      where: { id: licenseId },
      data: { lastValidatedAt: data },
    });
    return resultado.count > 0;
  }

  /** Remove apenas a licença; os módulos são removidos por cascata. */
  async removerLicenca(tx?: Prisma.TransactionClient): Promise<number> {
    const resultado = await this.cliente(tx).license.deleteMany();
    return resultado.count;
  }
}

export const licensingRepository = new LicensingRepository();
