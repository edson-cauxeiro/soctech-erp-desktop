/**
 * @file rh-permissions.ts
 * @description Espelho, no renderer, do catálogo de permissões fine-grained do RH
 * (`src/main/constants/rh-permissions.constants.ts`). Permite esconder/mostrar
 * acções sensíveis (ex.: valores salariais) de forma consistente com o Main.
 */

export const RH_MODULO = 'rh';

export const RH_SUBMODULOS: Record<string, { label: string; acoes: readonly string[] }> = {
  funcionarios: { label: 'Funcionários', acoes: ['ver', 'criar', 'editar', 'inativar'] },
  contratos: { label: 'Contratos', acoes: ['ver', 'gerir'] },
  alteracoes: { label: 'Alterações Mensais', acoes: ['ver', 'gerir'] },
  processamento: { label: 'Processamento de Salários', acoes: ['ver', 'simular', 'processar', 'anular'] },
  recibos: { label: 'Recibos', acoes: ['ver', 'emitir'] },
  pagamentos: { label: 'Pagamentos', acoes: ['ver', 'gerir'] },
  assiduidade: { label: 'Assiduidade', acoes: ['ver', 'gerir', 'aprovar'] },
  dividas: { label: 'Dívidas e Penhoras', acoes: ['ver', 'gerir'] },
  independentes: { label: 'Serviços Independentes', acoes: ['ver', 'gerir', 'processar'] },
  config: { label: 'Configuração de RH', acoes: ['ver', 'editar'] },
  salarios: { label: 'Valores Salariais (dado sensível)', acoes: ['ver'] },
};

/** Chave sensível: só a chave exacta (ou administração do módulo) a concede. */
export const RH_CHAVE_SALARIOS = 'rh.salarios.ver';

/** Mapeia a acção fina para a acção coarse equivalente (`null` = sensível). */
function rbacDaAcao(recurso: string, acao: string): string | null {
  if (recurso === 'salarios') return null;
  if (recurso === 'config') return acao === 'editar' ? 'admin' : 'read';
  if (acao === 'anular' || acao === 'aprovar') return 'approve';
  if (acao === 'ver') return 'read';
  return 'write';
}

/**
 * Verifica se um bloco de permissões concede uma chave fina do RH.
 * Mesma ordem de avaliação do Main (ver `rhPermissaoConcede`).
 */
export function rhPermissaoConcede(
  permissoes: Record<string, string[] | boolean> | null | undefined,
  chave: string
): boolean {
  if (!permissoes) return false;

  if (permissoes['*'] === true) return true;
  if (Array.isArray(permissoes['*']) && permissoes['*'].includes('*')) return true;

  const rhCoarse = permissoes[RH_MODULO];
  if (rhCoarse === true) return true;
  if (Array.isArray(rhCoarse) && (rhCoarse.includes('*') || rhCoarse.includes('admin'))) return true;

  const partes = chave.split('.');
  if (partes.length !== 3 || partes[0] !== RH_MODULO) return false;
  const [, recurso, acao] = partes;

  const exact = permissoes[`${RH_MODULO}.${recurso}`];
  if (exact === true) return true;
  if (Array.isArray(exact) && (exact.includes('*') || exact.includes(acao))) return true;

  const rbac = rbacDaAcao(recurso, acao);
  if (!rbac) return false;

  return Array.isArray(rhCoarse) && (rhCoarse.includes('*') || rhCoarse.includes(rbac));
}
