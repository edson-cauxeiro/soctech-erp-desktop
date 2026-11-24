/**
 * @file schema.test.ts
 * @description TASK-032 — Database: Relações, Constraints e Migrações.
 *
 * Verificação estática do contrato de dados, sem dependência de uma base viva:
 *  - o schema.prisma reflecte as relações e unicidades documentadas no
 *    `05-MODELO-DE-DADOS-ALVO.md` (cascatas, unicidades compostas, índices);
 *  - as constraints CHECK e os índices existem na migração que os cria
 *    (`armazens_stock_granularidade_lote_estoque_regras`);
 *  - cada migração tem `migration.sql` e o lock está no PostgreSQL.
 *
 * A ausência de drift entre schema e base é verificada nos gates com
 * `prisma migrate status` (tem de dizer "Database schema is up to date!"), que
 * não é repetida aqui para os testes continuarem herméticos.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const SCHEMA = readFileSync(join(RAIZ, 'prisma', 'schema.prisma'), 'utf8');

/** Conteúdo de um modelo do schema, entre `model X {` e o fecho. */
function blocoModelo(nome: string): string {
  const inicio = SCHEMA.indexOf(`model ${nome} {`);
  expect(inicio, `model ${nome} presente no schema`).toBeGreaterThanOrEqual(0);
  const fim = SCHEMA.indexOf('\nmodel ', inicio + 1);
  return SCHEMA.slice(inicio, fim >= 0 ? fim : SCHEMA.length);
}

function blocoEnum(nome: string): string {
  const inicio = SCHEMA.indexOf(`enum ${nome} {`);
  expect(inicio, `enum ${nome} presente no schema`).toBeGreaterThanOrEqual(0);
  const fim = SCHEMA.indexOf('\nenum ', inicio + 1);
  return SCHEMA.slice(inicio, fim >= 0 ? fim : SCHEMA.length);
}

describe('TASK-032 — Datasource e modelo', () => {
  it('define o datasource PostgreSQL', () => {
    const bloco = SCHEMA.slice(SCHEMA.indexOf('datasource db {'));
    expect(bloco).toContain('provider = "postgresql"');
  });

  it('enum TipoMovimentoStock cobre os tipos usados pelos services', () => {
    const bloco = blocoEnum('TipoMovimentoStock');
    for (const tipo of [
      'entrada',
      'saida',
      'transferencia',
      'ajuste',
      'consumo_producao',
      'devolucao',
      'quarentena',
      'liberacao',
    ]) {
      expect(bloco).toMatch(new RegExp(`\\b${tipo}\\b`));
    }
  });
});

describe('TASK-032 — Relações (schema.prisma)', () => {
  it('Armazem: unicidade por empresa e sem @unique global no codigo', () => {
    const bloco = blocoModelo('Armazem');
    expect(bloco).toContain('@@unique([empresaId, codigo]');
    // A migração `armazens_codigo_por_empresa` dropou o @unique global; o alvo
    // é `@@unique([empresaId, codigo])`.
    expect(bloco).not.toMatch(/codigo\s+String\s+@unique/);
  });

  it('cascata de armazém → área → zona → localização', () => {
    const area = blocoModelo('ArmazemArea');
    expect(area).toContain('@@unique([armazemId, codigo])');
    expect(area).toMatch(/armazem\s+Armazem\s+@relation\([^)]*onDelete:\s*Cascade/);

    const zona = blocoModelo('ArmazemZona');
    expect(zona).toContain('@@unique([areaId, codigo])');
    expect(zona).toMatch(/area\s+ArmazemArea\s+@relation\([^)]*onDelete:\s*Cascade/);

    const localizacao = blocoModelo('ArmazemLocalizacao');
    expect(localizacao).toContain('@@unique([zonaId, codigo])');
    expect(localizacao).toContain('@@index([isPickable, isPutaway])');
    expect(localizacao).toMatch(/zona\s+ArmazemZona\s+@relation\([^)]*onDelete:\s*Cascade/);
  });

  it('Estoque: stock por posição com índices e cascata em localização/lote', () => {
    const bloco = blocoModelo('Estoque');
    expect(bloco).toContain('@@map("estoques")');
    expect(bloco).toContain('quantidadeReservada');
    for (const idx of ['artigoId', 'armazemId', 'localizacaoId', 'loteId']) {
      expect(bloco).toContain(`@@index([${idx}])`);
    }
    expect(bloco).toMatch(/localizacao\s+ArmazemLocalizacao\?[^\n]*onDelete:\s*Cascade/);
    expect(bloco).toMatch(/lote\s+Lote\?[^\n]*onDelete:\s*Cascade/);
  });

  it('Lote: único por (artigoId, numeroLote) e índice de FEFO', () => {
    const bloco = blocoModelo('Lote');
    expect(bloco).toContain('@@unique([artigoId, numeroLote])');
    expect(bloco).toContain('@@index([dataValidade])');
  });

  it('MovimentoStock: rastreável (lote normalizado, localizações, auditoria, data)', () => {
    const bloco = blocoModelo('MovimentoStock');
    expect(bloco).toMatch(/numero\s+String\s+@unique/);
    for (const idx of ['artigoId', 'armazemOrigemId', 'armazemDestinoId', 'loteId', 'data']) {
      expect(bloco).toContain(`@@index([${idx}])`);
    }
    // lote livre é texto legado; o lote normalizado é por FK com SetNull.
    expect(bloco).toMatch(/lote\s+String\?/);
    expect(bloco).toMatch(/loteNormalizado\s+Lote\?[^\n]*onDelete:\s*SetNull/);
    expect(bloco).toMatch(/criadoPor\s+Utilizador\?[^\n]*onDelete:\s*SetNull/);
  });
});

describe('TASK-032 — Constraints (migração de regras de stock)', () => {
  const sql = readFileSync(
    join(
      RAIZ,
      'prisma',
      'migrations',
      '20261005141138_armazens_stock_granularidade_lote_estoque_regras',
      'migration.sql'
    ),
    'utf8'
  );

  it('bloqueia stock negativo e reserva inválida em estoques', () => {
    expect(sql).toContain('estoques_quantidade_nao_negativa');
    expect(sql).toContain('CHECK ("quantidade" >= 0)');
    expect(sql).toContain('estoques_reserva_valida');
    expect(sql).toContain('"quantidade_reservada" >= 0 AND "quantidade_reservada" <= "quantidade"');
  });

  it('valida capacidade e self-referência das localizações', () => {
    expect(sql).toContain('armazens_localizacoes_capacidade_nao_negativa');
    expect(sql).toContain('armazens_localizacoes_pai_diferente');
  });

  it('cria os índices de leitura do stock por posição', () => {
    for (const nome of [
      'estoques_artigo_id_idx',
      'estoques_armazem_id_idx',
      'estoques_localizacao_id_idx',
      'estoques_lote_id_idx',
      'movimentos_stock_data_idx',
      'lotes_data_validade_idx',
    ]) {
      expect(sql).toContain(nome);
    }
  });
});

describe('TASK-032 — Migrações aplicáveis', () => {
  it('toda a pasta de migrações tem migration.sql', () => {
    const pasta = join(RAIZ, 'prisma', 'migrations');
    const entradas = readdirSync(pasta, { withFileTypes: true });
    const dirs = entradas.filter((e) => e.isDirectory()).map((e) => e.name);
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      expect(
        existsSync(join(pasta, dir, 'migration.sql')),
        `migration.sql em ${dir}`
      ).toBe(true);
    }
  });

  it('o lock de migração aponta para PostgreSQL', () => {
    const lock = readFileSync(
      join(RAIZ, 'prisma', 'migrations', 'migration_lock.toml'),
      'utf8'
    );
    expect(lock).toMatch(/provider\s*=\s*["']postgresql["']/);
  });

  it('as migrações da estrutura de armazém estão presentes e por ordem', () => {
    const pasta = readdirSync(join(RAIZ, 'prisma', 'migrations')).filter((n) =>
      n.includes('armazens')
    );
    expect(pasta).toContain('20261005141007_armazens_estrutura_area_zona_localizacao_classe');
    expect(pasta).toContain('20261005141138_armazens_stock_granularidade_lote_estoque_regras');
    expect(pasta).toContain('20261005150000_armazens_backfill_stock');
    expect(pasta).toContain('20261005153000_armazens_codigo_por_empresa');
  });
});