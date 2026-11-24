/**
 * @file repositories/index.ts
 * @description Ponto de entrada único da camada de acesso a dados (EPIC 2).
 *
 * Cada repository é instanciado com o `PrismaClient` global por omissão, tal
 * como os services. Para testes, passar um cliente falso ao construtor:
 *
 * ```ts
 * const repo = new EstoqueRepository(mockPrisma);
 * ```
 *
 * As operações aceitam uma transacção opcional em último argumento, para que um
 * service possa compor várias chamadas do mesmo `$transaction`:
 *
 * ```ts
 * await prisma.$transaction(async (tx) => {
 *   const estoque = await estoqueRepository.findOrCreateByPosition(posicao, {}, tx);
 *   await estoqueRepository.addQuantity(estoque.id, 10, 5, tx);
 * });
 * ```
 */

export { ArmazemRepository, armazemRepository } from './warehouse.repository';
export type { FiltrosArmazem, DadosArmazem, DadosActualizacaoArmazem } from './warehouse.repository';

export {
  LocalizacaoRepository,
  localizacaoRepository,
} from './location.repository';
export type {
  ArvoreLocalizacoes,
  NoLocalizacao,
  FiltrosLocalizacao,
  FiltrosLocalizacaoDisponivel,
  DadosArea,
  DadosZona,
  DadosLocalizacao,
} from './location.repository';

export { EstoqueRepository, estoqueRepository } from './inventory.repository';
export type {
  PosicaoStock,
  FiltrosEstoque,
  DadosEstoque,
  EstoqueCompleto,
} from './inventory.repository';

export {
  MovimentoStockRepository,
  movimentoStockRepository,
} from './stock-movement.repository';
export type {
  DadosMovimento,
  FiltrosMovimento,
  MovimentoCompleto,
} from './stock-movement.repository';

export { LicensingRepository, licensingRepository } from './licensing.repository';
export type {
  LicenseComModulos,
  ModuloLicencaPersistido,
  DadosSubstituicaoLicenca,
} from './licensing.repository';
