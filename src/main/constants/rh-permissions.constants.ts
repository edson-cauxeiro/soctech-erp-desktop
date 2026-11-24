/**
 * @file rh-permissions.constants.ts
 * @description Catálogo de permissões fine-grained do módulo de Recursos Humanos.
 *
 * O RBAC do ERP é coarse (módulo × acção: read/write/delete/approve/admin). O RH
 * precisa de permissões mais finas (`rh.funcionarios.criar`, `rh.salarios.ver`).
 * Este catálogo mapeia cada permissão fina para a acção coarse do módulo `rh`,
 * excepto os dados sensíveis (valores salariais), que só são concedidos pela
 * chave exacta ou por administração total do módulo.
 *
 * Ver `docs/rh-docs/DECISOES.md` (ADR-004).
 */

import type { AcaoRbac } from './permissions.constants';

/** Módulo coarse do RH (adicionado a `MODULOS_RBAC`). */
export const RH_MODULO = 'rh';

/** Acções usadas pelas chaves finas do RH. */
export const RH_ACOES_RBAC = [
  'ver',
  'criar',
  'editar',
  'inativar',
  'gerir',
  'simular',
  'processar',
  'anular',
  'emitir',
  'aprovar',
] as const;

export type RhAcaoRbac = (typeof RH_ACOES_RBAC)[number];

/** Descrições das acções finas (UI de gestão de perfis). */
export const RH_ACOES_LABELS: Record<RhAcaoRbac, string> = {
  ver: 'Consultar',
  criar: 'Criar',
  editar: 'Editar',
  inativar: 'Inactivar',
  gerir: 'Gerir',
  simular: 'Simular',
  processar: 'Processar',
  anular: 'Anular',
  emitir: 'Emitir',
  aprovar: 'Aprovar',
};

export interface RhSubmoduloDef {
  label: string;
  acoes: readonly RhAcaoRbac[];
}

/** Submódulos do RH e acções aplicáveis (chave fina: `rh.<submódulo>`). */
export const RH_SUBMODULOS: Record<string, RhSubmoduloDef> = {
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
  auditoria: { label: 'Auditoria de RH', acoes: ['ver'] },
};

/** Chave sensível: só a chave exacta (ou administração do módulo) a concede. */
export const RH_CHAVE_SALARIOS = 'rh.salarios.ver';

export interface RhPermissaoDef {
  /** Chave completa, ex.: `rh.funcionarios.criar`. */
  chave: string;
  recurso: string;
  acao: RhAcaoRbac;
  label: string;
  /** Acção coarse equivalente, ou `null` quando a permissão é sensível. */
  rbac: AcaoRbac | null;
  sensivel: boolean;
}

function rbacDaPermissao(recurso: string, acao: RhAcaoRbac): AcaoRbac | null {
  if (recurso === 'salarios') return null;
  if (recurso === 'config') return acao === 'editar' ? 'admin' : 'read';
  if (acao === 'anular' || acao === 'aprovar') return 'approve';
  if (acao === 'ver') return 'read';
  return 'write';
}

/** Catálogo completo de permissões finas do RH. */
export const RH_PERMISSOES: RhPermissaoDef[] = Object.entries(RH_SUBMODULOS).flatMap(
  ([recurso, def]) =>
    def.acoes.map((acao) => ({
      chave: `${RH_MODULO}.${recurso}.${acao}`,
      recurso,
      acao,
      label: `${def.label} — ${RH_ACOES_LABELS[acao]}`,
      rbac: rbacDaPermissao(recurso, acao),
      sensivel: recurso === 'salarios',
    }))
);

const RH_PERMISSOES_MAP = new Map(RH_PERMISSOES.map((p) => [p.chave, p]));

/** Obtém a definição de uma permissão fina. */
export function obterRhPermissao(chave: string): RhPermissaoDef | undefined {
  return RH_PERMISSOES_MAP.get(chave);
}

/** Divide `rh.<submódulo>.<acção>` nas partes. Devolve `null` se o formato for inválido. */
export function dividirRhChave(
  chave: string
): { recurso: string; acao: string } | null {
  const partes = chave.split('.');
  if (partes.length !== 3 || partes[0] !== RH_MODULO) return null;
  return { recurso: partes[1], acao: partes[2] };
}

/** Verifica se uma chave é um submódulo RH válido (`rh.<submódulo>`). */
export function ehSubmoduloRh(chave: string): boolean {
  const partes = chave.split('.');
  return partes.length === 2 && partes[0] === RH_MODULO && Boolean(RH_SUBMODULOS[partes[1]]);
}

/**
 * Verifica se um bloco de permissões concede uma chave fina do RH.
 *
 * Ordem de avaliação:
 * 1. Wildcard global (`*`).
 * 2. Administração total do módulo (`rh: true`, `rh: ['admin']` ou `rh: ['*']`).
 * 3. Chave exacta do submódulo (`rh.funcionarios: ['criar']`).
 * 4. Fallback para a acção coarse mapeada — nunca para dados sensíveis.
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

  const split = dividirRhChave(chave);
  if (!split) return false;

  const exact = permissoes[`${RH_MODULO}.${split.recurso}`];
  if (exact === true) return true;
  if (Array.isArray(exact) && (exact.includes('*') || exact.includes(split.acao))) return true;

  const def = obterRhPermissao(chave);
  if (!def || def.sensivel || !def.rbac) return false;

  return Array.isArray(rhCoarse) && (rhCoarse.includes('*') || rhCoarse.includes(def.rbac));
}

/**
 * Extrai as chaves finas do RH de uma matriz de permissões, filtrando as acções
 * ao catálogo conhecido. Usado por `normalizarPermissoes` para preservar `rh.*`.
 */
export function extrairPermissoesRh(
  matriz: Record<string, string[] | boolean> | null | undefined
): Record<string, string[] | boolean> {
  const resultado: Record<string, string[] | boolean> = {};
  if (!matriz) return resultado;

  for (const [chave, valor] of Object.entries(matriz)) {
    const partes = chave.split('.');
    if (partes.length !== 2 || partes[0] !== RH_MODULO) continue;

    const def = RH_SUBMODULOS[partes[1]];
    if (!def) continue;

    if (valor === true) {
      resultado[chave] = [...def.acoes];
      continue;
    }
    if (!Array.isArray(valor)) continue;

    const acoes = valor.filter(
      (acao) => (def.acoes as readonly string[]).includes(acao) || acao === '*'
    );
    if (acoes.length > 0) {
      resultado[chave] = acoes.includes('*') ? [...def.acoes] : [...new Set(acoes)];
    }
  }

  return resultado;
}
