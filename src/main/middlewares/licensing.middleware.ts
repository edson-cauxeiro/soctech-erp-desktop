/**
 * @file licensing.middleware.ts
 * @description Verificação de licença por módulo, complementar ao RBAC.
 *
 * RBAC responde "este utilizador pode?"; licenciamento responde "esta
 * instalação adquiriu este módulo?". As duas respostas têm de ser `sim` para
 * que uma operação comercial ocorra.
 */

import { licensingService } from '../services/licensing.service';
import { ModuleNotLicensedError } from '../utils/licensing-errors';
import type { LicensingModuleKey, ModuleAccessResult } from '../../shared/licensing/types';

interface VerificadorModulos {
  checkModuleAccess(modulo: string): Promise<ModuleAccessResult>;
}

async function verificar(
  modulos: readonly LicensingModuleKey[],
  servico: VerificadorModulos
): Promise<ModuleAccessResult> {
  const resultados = await Promise.all(
    modulos.map((modulo) => servico.checkModuleAccess(modulo))
  );
  return {
    allowed: resultados.some((resultado) => resultado.allowed),
    reason: resultados.find((resultado) => resultado.allowed)?.reason ?? resultados[0]?.reason ?? 'MODULE_NOT_LICENSED',
  };
}

/** Exige licença activa para um módulo comercial. */
export async function requireLicensedModule(
  modulo: LicensingModuleKey,
  servico: VerificadorModulos = licensingService
): Promise<void> {
  await requireAnyLicensedModule([modulo], servico);
}

/**
 * Exige licença para pelo menos um dos módulos indicados. Usado em entidades
 * partilhadas (artigos, clientes, saldos), onde a permissão funcional pode vir
 * de Vendas, Stock, Compras ou Comercial.
 */
export async function requireAnyLicensedModule(
  modulos: readonly LicensingModuleKey[],
  servico: VerificadorModulos = licensingService
): Promise<void> {
  if (modulos.length === 0) return;

  const resultado = await verificar(modulos, servico);
  if (!resultado.allowed) {
    throw new ModuleNotLicensedError(modulos[0], resultado.reason);
  }
}
