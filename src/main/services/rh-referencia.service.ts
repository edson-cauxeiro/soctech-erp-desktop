/**
 * @file rh-referencia.service.ts
 * @description Dados de referência do RH para o mercado angolano (RH-806).
 *
 * A lista vive num único módulo para que o seed (`prisma/seed.ts`) e o
 * assistente de migração (`RhMigracaoWizard`) criem exactamente os mesmos
 * registos. Tudo é idempotente: o código é a chave e registos existentes
 * nunca são sobrescritos.
 */

/** Cliente Prisma mínimo necessário — aceita o `PrismaClient` do seed e o serviço. */
export interface PrismaRhReferencia {
  rhDepartamento: {
    createMany: (args: {
      data: Array<{ empresaId: string; codigo: string; nome: string }>;
      skipDuplicates?: boolean;
    }) => Promise<{ count: number }>;
  };
  rhCargo: {
    createMany: (args: {
      data: Array<{ empresaId: string; codigo: string; nome: string }>;
      skipDuplicates?: boolean;
    }) => Promise<{ count: number }>;
  };
}

export interface ReferenciaRh {
  codigo: string;
  nome: string;
}

/** Departamentos típicos de uma empresa angolana. */
export const DEPARTAMENTOS_REFERENCIA: readonly ReferenciaRh[] = [
  { codigo: 'ADM', nome: 'Administração e Direcção' },
  { codigo: 'RH', nome: 'Recursos Humanos' },
  { codigo: 'FIN', nome: 'Finanças e Contabilidade' },
  { codigo: 'COM', nome: 'Comercial e Vendas' },
  { codigo: 'PRO', nome: 'Produção e Operações' },
  { codigo: 'LOG', nome: 'Logística e Armazém' },
  { codigo: 'TI', nome: 'Tecnologias de Informação' },
  { codigo: 'MAN', nome: 'Manutenção' },
];

/** Cargos/funções típicos de uma empresa angolana. */
export const CARGOS_REFERENCIA: readonly ReferenciaRh[] = [
  { codigo: 'DIR', nome: 'Director(a) Geral' },
  { codigo: 'GES', nome: 'Gestor(a) de Departamento' },
  { codigo: 'SUP', nome: 'Supervisor(a)' },
  { codigo: 'CONT', nome: 'Contabilista' },
  { codigo: 'TES', nome: 'Tesoureiro(a)' },
  { codigo: 'TEC', nome: 'Técnico(a) Administrativo(a)' },
  { codigo: 'TECRH', nome: 'Técnico(a) de Recursos Humanos' },
  { codigo: 'VEND', nome: 'Vendedor(a)' },
  { codigo: 'OPER', nome: 'Operador(a) de Produção' },
  { codigo: 'ARMAZ', nome: 'Responsável de Armazém' },
  { codigo: 'MOT', nome: 'Motorista' },
  { codigo: 'AUX', nome: 'Auxiliar de Limpeza' },
  { codigo: 'SEG', nome: 'Agente de Segurança' },
];

export interface ResultadoReferenciaRh {
  departamentosCriados: number;
  cargosCriados: number;
}

/**
 * Cria os departamentos e cargos de referência que ainda não existem na
 * empresa. Devolve apenas a contagem de registos efectivamente criados.
 */
export async function semearDepartamentosECargos(
  prisma: PrismaRhReferencia,
  empresaId: string
): Promise<ResultadoReferenciaRh> {
  const [departamentos, cargos] = await Promise.all([
    prisma.rhDepartamento.createMany({
      data: DEPARTAMENTOS_REFERENCIA.map((d) => ({ ...d, empresaId })),
      skipDuplicates: true,
    }),
    prisma.rhCargo.createMany({
      data: CARGOS_REFERENCIA.map((c) => ({ ...c, empresaId })),
      skipDuplicates: true,
    }),
  ]);

  return {
    departamentosCriados: departamentos.count,
    cargosCriados: cargos.count,
  };
}
