/**
 * @file dados-bancarios-documento.ts
 * @description Dados bancários para impressão de documentos.
 *
 * `EmpresaConfig.dadosBancarios` é texto livre: ora é um IBAN escrito à mão,
 * ora um array JSON. Quando existem dois Representations no mesmo sítio, os
 * documentos impressos divergem do que o ERP assume. A `ContaBancaria` é a
 * fonte única, por isso a impressão lê de lá — e só de lá.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../database/prisma';

export interface DadosBancariosDocumento {
  banco: string;
  iban: string;
  swift?: string | null;
}

type ContaBancariaMinima = {
  nomeBanco: string | null;
  designacao: string;
  iban: string | null;
  swiftBic: string | null;
};

function paraDocumento(conta: ContaBancariaMinima): DadosBancariosDocumento {
  return {
    banco: conta.nomeBanco || conta.designacao,
    iban: conta.iban || '',
    swift: conta.swiftBic,
  };
}

/** A conta que o movimento do documento specifies. É a que o cliente deve pagar. */
export async function contaDoDocumento(
  contaBancariaId: string | null | undefined,
  client: PrismaClient = defaultPrisma
): Promise<DadosBancariosDocumento[]> {
  if (!contaBancariaId) return [];
  const conta = await client.contaBancaria.findUnique({
    where: { id: contaBancariaId },
    select: { nomeBanco: true, designacao: true, iban: true, swiftBic: true },
  });
  return conta ? [paraDocumento(conta)] : [];
}

/**
 * Contas ativas da empresa, para documentos que não liquidam nada (proforma,
 * guia de entrega): o destinatário precisa de saber para onde pagar.
 */
export async function contasAtivasDaEmpresa(
  empresaId: string | null | undefined,
  client: PrismaClient = defaultPrisma
): Promise<DadosBancariosDocumento[]> {
  if (!empresaId) return [];
  const contas = await client.contaBancaria.findMany({
    where: { empresaId, ativo: true, iban: { not: null } },
    orderBy: { codigo: 'asc' },
    select: { nomeBanco: true, designacao: true, iban: true, swiftBic: true },
  });
  return contas.map(paraDocumento);
}
