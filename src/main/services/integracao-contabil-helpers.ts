/**
 * @file integracao-contabil-helpers.ts
 * @description Utilitários para ligar módulos de origem ao motor contabilístico.
 *
 * A integração é sempre uma operação *depois do commit*: se falhar, a origem
 * continua a funcionar. Este helper centraliza o `try/catch` e o registo do
 * erro para que nenhum chamador se esqueça dessa regra.
 */

interface ResultadoIntegracaoLike {
  sucesso?: boolean;
  pendente?: boolean;
  mensagem?: string;
}

function mensagemDoResultado(resultado: unknown): string {
  if (!resultado || typeof resultado !== 'object') return 'sem detalhe';
  const candidato = resultado as ResultadoIntegracaoLike;
  return candidato.mensagem || 'sem mensagem';
}

/**
 * Executa uma acção de integração de forma segura.
 *
 * @param descricao Identificação legível da operação (para o log).
 * @param acao Função que chama o serviço de integração.
 */
export async function integrarDepoisCommit(
  descricao: string,
  acao: () => Promise<unknown>
): Promise<void> {
  try {
    const resultado = await acao();
    if (
      resultado &&
      typeof resultado === 'object' &&
      'pendente' in resultado &&
      (resultado as ResultadoIntegracaoLike).pendente
    ) {
      console.warn(
        `[integracao-contabil] ${descricao} ficou pendente: ${mensagemDoResultado(resultado)}`
      );
    }
  } catch (erro) {
    // Nunca propagar: o documento de origem já foi gravado com sucesso.
    console.error(`[integracao-contabil] Falha ao integrar ${descricao}:`, erro);
  }
}
