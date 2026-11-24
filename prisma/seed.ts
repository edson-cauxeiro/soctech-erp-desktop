/**
 * @file seed.ts
 * @description Seed inicial de dados para o DoraERP (Perfis RBAC, Empresa e Utilizadores).
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { semearDepartamentosECargos } from '../src/main/services/rh-referencia.service';
import { ContabilidadeSeedService } from '../src/main/services/contabilidade-seed.service';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://doraerp_user:doraerp_secret@localhost:5432/doraerp?schema=public',
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  console.log('🌱 A iniciar o seed da base de dados DoraERP...');

  // 1. Criar Empresa Padrão
  const empresa = await prisma.empresaConfig.upsert({
    where: { nif: '599999990' },
    update: {},
    create: {
      nome: 'DoraERP Soluções Empresariais, Lda.',
      nif: '599999990',
      endereco: 'Avenida da Liberdade, 100, 1250-001 Lisboa',
      pais: 'PT',
      cae: '62010',
      regimeIva: 'geral',
      moedaBase: 'AOA',
      anoFiscalInicio: new Date(new Date().getFullYear(), 0, 1),
      anoFiscalFim: new Date(new Date().getFullYear(), 11, 31),
      serieDefault: '2026',
      dadosBancarios: 'IBAN: PT50 0000 0000 0000 0000 0000 0',
    },
  });
  console.log(`✅ Empresa configurada: ${empresa.nome}`);

  // 2. Criar Perfis de Acesso (RBAC)
  const perfis = [
    {
      nome: 'Administrador',
      permissoesJson: JSON.stringify({
        '*': true,
      }),
    },
    {
      nome: 'Operador',
      permissoesJson: JSON.stringify({
        vendas: ['read', 'write'],
        compras: ['read', 'write'],
        estoque: ['read', 'write'],
        comercial: ['read', 'write'],
        financas: ['read'],
        fiscal: ['read'],
        relatorios: ['read'],
      }),
    },
    {
      nome: 'Financeiro',
      permissoesJson: JSON.stringify({
        financas: ['read', 'write', 'approve'],
        vendas: ['read'],
        compras: ['read'],
        fiscal: ['read', 'write'],
        relatorios: ['read', 'write'],
      }),
    },
    {
      nome: 'Vendedor',
      permissoesJson: JSON.stringify({
        vendas: ['read', 'write'],
        comercial: ['read'],
        relatorios: ['read'],
      }),
    },
  ];

  const perfilMap: Record<string, string> = {};

  for (const p of perfis) {
    const perfil = await prisma.perfilAcesso.upsert({
      where: { nome: p.nome },
      update: { permissoesJson: p.permissoesJson },
      create: {
        nome: p.nome,
        permissoesJson: p.permissoesJson,
      },
    });
    perfilMap[p.nome] = perfil.id;
    console.log(`✅ Perfil RBAC criado/atualizado: ${perfil.nome}`);
  }

  // 3. Criar Utilizadores Iniciais
  const salt = await bcrypt.genSalt(10);
  const defaultPasswordHash = await bcrypt.hash('senha123', salt);

  const utilizadores = [
    {
      login: 'admin',
      nomeCompleto: 'Administrador do Sistema',
      email: 'admin@doraerp.local',
      passwordHash: defaultPasswordHash,
      estado: 'ativo' as const,
      perfilId: perfilMap['Administrador'],
      empresaConfigId: empresa.id,
    },
    {
      login: 'ana.marques',
      nomeCompleto: 'Ana Marques',
      email: 'ana.marques@doraerp.local',
      passwordHash: defaultPasswordHash,
      estado: 'ativo' as const,
      perfilId: perfilMap['Vendedor'],
      empresaConfigId: empresa.id,
    },
  ];

  for (const u of utilizadores) {
    const user = await prisma.utilizador.upsert({
      where: { login: u.login },
      update: {
        passwordHash: u.passwordHash,
        perfilId: u.perfilId,
        estado: u.estado,
        empresaConfigId: u.empresaConfigId,
      },
      create: u,
    });
    console.log(`✅ Utilizador pronto: ${user.login} (${user.nomeCompleto})`);
  }

  // 4. Criar Armazéns Padrão (ARM-01 Geral para entradas e ARM-02 Vendas para saídas de venda)
  const armazens = [
    {
      codigo: 'ARM-01',
      designacao: 'Geral',
      tipo: 'materia_prima' as const,
      localizacao: 'Edifício Principal - Setor de Armazenamento e Entradas',
      isDefaultCompras: true,
      isDefaultVendas: false,
      ativo: true,
    },
    {
      codigo: 'ARM-02',
      designacao: 'Vendas',
      tipo: 'produto_acabado' as const,
      localizacao: 'Loja / Terminal de Vendas e Faturação',
      isDefaultCompras: false,
      isDefaultVendas: true,
      ativo: true,
    },
  ];

  for (const arm of armazens) {
    const armazem = await prisma.armazem.upsert({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo: arm.codigo } },
      update: {
        designacao: arm.designacao,
        tipo: arm.tipo,
        localizacao: arm.localizacao,
        isDefaultCompras: arm.isDefaultCompras,
        isDefaultVendas: arm.isDefaultVendas,
        ativo: arm.ativo,
      },
      create: { ...arm, empresaId: empresa.id },
    });
    console.log(`✅ Armazém padrão configurado: ${armazem.codigo} - ${armazem.designacao} (${arm.isDefaultVendas ? 'Default Vendas' : 'Default Entradas/Geral'})`);
  }

  // 5. Contas Bancárias base
  // A tesouraria deriva o saldo a partir de `saldoInicial` + movimentos
  // confirmados, por isso as contas nascem com saldo zero: o saldo real vem
  // do saldo inicial que o utilizador definir na aba Contas.
  const contas = [
    {
      codigo: 'CAIXA',
      designacao: 'Caixa',
      tipo: 'caixa' as const,
      nomeBanco: null as string | null,
      iban: null as string | null,
      swiftBic: null as string | null,
    },
    {
      codigo: 'BANC-01',
      designacao: 'Conta Bancária Principal',
      tipo: 'banco' as const,
      nomeBanco: 'Banco de Fomento Angola',
      iban: 'AO06 0000 0000 0000 0000 0000 0',
      swiftBic: 'BFANAOXX',
    },
  ];

  for (const conta of contas) {
    const existente = await prisma.contaBancaria.findFirst({
      where: { empresaId: empresa.id, codigo: conta.codigo },
    });

    const contaBancaria = existente
      ? await prisma.contaBancaria.update({
          where: { id: existente.id },
          data: {
            designacao: conta.designacao,
            tipo: conta.tipo,
            nomeBanco: conta.nomeBanco,
            iban: conta.iban,
            swiftBic: conta.swiftBic,
            ativo: true,
          },
        })
      : await prisma.contaBancaria.create({
          data: { ...conta, empresaId: empresa.id, saldoInicial: 0, moeda: 'AOA', ativo: true },
        });

    console.log(`✅ Conta bancária pronta: ${contaBancaria.codigo} - ${contaBancaria.designacao}`);
  }

  // 6. Séries de numeração da tesouraria
  // Sem uma série activa, `DocumentoNumeroService` não consegue reservar um
  // número e nenhum lançamento de tesouraria é aceite.
  const ano = new Date().getFullYear();
  const series = [
    { codigo: 'TES', descricao: 'Lançamentos de tesouraria', tipoDocumento: 'TS' as const, modulosJson: '["financas"]' },
    { codigo: 'CX', descricao: 'Sessões de caixa', tipoDocumento: 'SC' as const, modulosJson: '["financas"]' },
  ];

  for (const s of series) {
    const serie = await prisma.serieDocumento.upsert({
      where: {
        empresaId_tipoDocumento_codigo: {
          empresaId: empresa.id,
          tipoDocumento: s.tipoDocumento,
          codigo: s.codigo,
        },
      },
      update: { descricao: s.descricao, estado: 'ativo' },
      create: {
        codigo: s.codigo,
        descricao: s.descricao,
        empresaId: empresa.id,
        tipoDocumento: s.tipoDocumento,
        modulosJson: s.modulosJson,
        dataInicio: new Date(ano, 0, 1),
        dataFim: new Date(ano, 11, 31),
        estado: 'ativo',
      },
    });
    console.log(`✅ Série de numeração pronta: ${serie.tipoDocumento} ${serie.codigo}`);
  }

  // 7. RH — Rubricas de sistema, tipos de ausência, parâmetros, tabela de IRT,
  //    configuração singleton e períodos do ano corrente (Fase 1 / RH-105).
  await seedRh(empresa.id);

  // 8. Contabilidade — Plano de contas PGC Angola, diários padrão e
  //    mapeamentos simbólicos. O seed é idempotente e não reescreve contas ou
  //    diários já configurados; só cria o que falta.
  const contabilidadeSeed = new ContabilidadeSeedService(prisma);
  const resultadoContabilidade = await contabilidadeSeed.semearTudo(empresa.id);
  console.log(
    `✅ Contabilidade: ${resultadoContabilidade.contasCriadas} conta(s) criada(s), ` +
      `${resultadoContabilidade.diariosCriados} diário(s) criado(s), ` +
      `${resultadoContabilidade.mapeamentosCriados} mapeamento(s) criado(s).`
  );

  console.log('🎉 Seed finalizado com sucesso!');
}

/**
 * Seed idempotente do módulo de RH. Cada bloco verifica a existência do
 * registo antes de criar, para que o seed possa correr repetidamente sem
 * duplicar nem sobrescrever configuração do utilizador.
 */
async function seedRh(empresaId: string): Promise<void> {
  const vigenciaInicial = new Date(Date.UTC(2025, 0, 1));

  // 7.1 Rubricas de sistema ─────────────────────────────────────────────────
  const rubricasSistema = [
    { codigoSistema: 'SALARIO_BASE', codigo: 'SALARIO_BASE', descricao: 'Salário Base', tipo: 'REMUNERACAO', natureza: 'FIXA', formaCalculo: 'VALOR_FIXO', incideIRT: true, incideINSS: true, ordemRecibo: 1 },
    { codigoSistema: 'SUBS_ALIMENTACAO', codigo: 'SUBS_ALIMENTACAO', descricao: 'Subsídio de Alimentação', tipo: 'REMUNERACAO', natureza: 'FIXA', formaCalculo: 'VALOR_X_QUANTIDADE', incideIRT: false, incideINSS: false, ordemRecibo: 2 },
    { codigoSistema: 'SUBS_TRANSPORTE', codigo: 'SUBS_TRANSPORTE', descricao: 'Subsídio de Transporte', tipo: 'REMUNERACAO', natureza: 'FIXA', formaCalculo: 'VALOR_FIXO', incideIRT: false, incideINSS: false, ordemRecibo: 3 },
    { codigoSistema: 'SUBS_FERIAS', codigo: 'SUBS_FERIAS', descricao: 'Subsídio de Férias', tipo: 'REMUNERACAO', natureza: 'FIXA', formaCalculo: 'SISTEMA', incideIRT: true, incideINSS: true, ordemRecibo: 4 },
    { codigoSistema: 'SUBS_NATAL', codigo: 'SUBS_NATAL', descricao: 'Subsídio de Natal', tipo: 'REMUNERACAO', natureza: 'FIXA', formaCalculo: 'SISTEMA', incideIRT: true, incideINSS: true, ordemRecibo: 5 },
    { codigoSistema: 'HORAS_EXTRA', codigo: 'HORAS_EXTRA', descricao: 'Horas Extraordinárias', tipo: 'REMUNERACAO', natureza: 'VARIAVEL', formaCalculo: 'VALOR_X_QUANTIDADE', incideIRT: true, incideINSS: true, ordemRecibo: 6 },
    { codigoSistema: 'FALTAS', codigo: 'FALTAS', descricao: 'Faltas', tipo: 'DESCONTO', natureza: 'VARIAVEL', formaCalculo: 'VALOR_X_QUANTIDADE', incideIRT: false, incideINSS: false, ordemRecibo: 7 },
    { codigoSistema: 'INSS_TRAB', codigo: 'INSS_TRAB', descricao: 'INSS — Trabalhador (3%)', tipo: 'DESCONTO', natureza: 'FIXA', formaCalculo: 'SISTEMA', percentagem: 3, incideIRT: false, incideINSS: false, ordemRecibo: 8 },
    { codigoSistema: 'INSS_PATRONAL', codigo: 'INSS_PATRONAL', descricao: 'INSS — Entidade Patronal (8%)', tipo: 'ENCARGO_PATRONAL', natureza: 'FIXA', formaCalculo: 'SISTEMA', percentagem: 8, incideIRT: false, incideINSS: false, ordemRecibo: 9 },
    { codigoSistema: 'IRT', codigo: 'IRT', descricao: 'IRT', tipo: 'DESCONTO', natureza: 'FIXA', formaCalculo: 'SISTEMA', incideIRT: false, incideINSS: false, ordemRecibo: 10 },
    { codigoSistema: 'PENHORA', codigo: 'PENHORA', descricao: 'Penhora', tipo: 'DESCONTO', natureza: 'VARIAVEL', formaCalculo: 'VALOR_FIXO', incideIRT: false, incideINSS: false, ordemRecibo: 11 },
    { codigoSistema: 'ADIANTAMENTO', codigo: 'ADIANTAMENTO', descricao: 'Adiantamento', tipo: 'DESCONTO', natureza: 'VARIAVEL', formaCalculo: 'VALOR_FIXO', incideIRT: false, incideINSS: false, ordemRecibo: 12 },
    { codigoSistema: 'EMPRESTIMO', codigo: 'EMPRESTIMO', descricao: 'Empréstimo', tipo: 'DESCONTO', natureza: 'VARIAVEL', formaCalculo: 'VALOR_FIXO', incideIRT: false, incideINSS: false, ordemRecibo: 13 },
    { codigoSistema: 'INDEMNIZACAO', codigo: 'INDEMNIZACAO', descricao: 'Indemnização', tipo: 'REMUNERACAO', natureza: 'EXTRAORDINARIA', formaCalculo: 'VALOR_FIXO', incideIRT: false, incideINSS: false, ordemRecibo: 14 },
    { codigoSistema: 'FERIAS_NAO_GOZADAS', codigo: 'FERIAS_NAO_GOZADAS', descricao: 'Férias não Gozadas', tipo: 'REMUNERACAO', natureza: 'EXTRAORDINARIA', formaCalculo: 'VALOR_FIXO', incideIRT: true, incideINSS: true, ordemRecibo: 15 },
    { codigoSistema: 'RETROATIVO', codigo: 'RETROATIVO', descricao: 'Retroactivo', tipo: 'REMUNERACAO', natureza: 'VARIAVEL', formaCalculo: 'SISTEMA', incideIRT: true, incideINSS: true, ordemRecibo: 16 },
  ] as const;

  for (const r of rubricasSistema) {
    const existente = await prisma.rhRubrica.findFirst({
      where: { empresaId, codigoSistema: r.codigoSistema },
      select: { id: true },
    });
    if (existente) continue;
    await prisma.rhRubrica.create({
      data: {
        empresaId,
        codigo: r.codigo,
        descricao: r.descricao,
        tipo: r.tipo,
        natureza: r.natureza,
        formaCalculo: r.formaCalculo,
        percentagem: 'percentagem' in r ? r.percentagem : null,
        incideIRT: r.incideIRT,
        incideINSS: r.incideINSS,
        ordemRecibo: r.ordemRecibo,
        sistema: true,
        codigoSistema: r.codigoSistema,
      },
    });
  }
  console.log(`✅ RH: ${rubricasSistema.length} rubricas de sistema verificadas.`);

  // 7.2 Tipos de ausência ───────────────────────────────────────────────────
  const tiposAusencia = [
    { codigo: 'FALTA_JUST', descricao: 'Falta Justificada', justificada: true, descontaSalario: false, descontaSubsidioAlimentacao: true },
    { codigo: 'FALTA_INJUST', descricao: 'Falta Injustificada', justificada: false, descontaSalario: true, descontaSubsidioAlimentacao: true },
    { codigo: 'DOENCA', descricao: 'Doença', justificada: true, descontaSalario: false, descontaSubsidioAlimentacao: false },
    { codigo: 'MATERNIDADE', descricao: 'Maternidade', justificada: true, descontaSalario: false, descontaSubsidioAlimentacao: false },
    { codigo: 'PATERNIDADE', descricao: 'Paternidade', justificada: true, descontaSalario: false, descontaSubsidioAlimentacao: false },
    { codigo: 'LUTO', descricao: 'Luto', justificada: true, descontaSalario: false, descontaSubsidioAlimentacao: false },
    { codigo: 'CASAMENTO', descricao: 'Casamento', justificada: true, descontaSalario: false, descontaSubsidioAlimentacao: false },
    { codigo: 'LIC_SEM_VENC', descricao: 'Licença sem Vencimento', justificada: true, descontaSalario: true, descontaSubsidioAlimentacao: true },
  ];

  for (const t of tiposAusencia) {
    const existente = await prisma.rhTipoAusencia.findFirst({
      where: { empresaId, codigo: t.codigo },
      select: { id: true },
    });
    if (existente) continue;
    await prisma.rhTipoAusencia.create({ data: { empresaId, ...t } });
  }
  console.log(`✅ RH: ${tiposAusencia.length} tipos de ausência verificados.`);

  // 7.3 Parâmetros fiscais (valores a validar com RH/jurídico) ──────────────
  const parametros = [
    { chave: 'INSS_TRAB', valor: '3', tipoValor: 'DECIMAL', descricao: 'Taxa INSS do trabalhador (%)' },
    { chave: 'INSS_PATRONAL', valor: '8', tipoValor: 'DECIMAL', descricao: 'Taxa INSS da entidade patronal (%)' },
    { chave: 'PCT_SUBS_NATAL', valor: '100', tipoValor: 'DECIMAL', descricao: 'Subsídio de Natal (% do salário)' },
    { chave: 'PCT_SUBS_FERIAS', valor: '100', tipoValor: 'DECIMAL', descricao: 'Subsídio de Férias (% do salário)' },
    { chave: 'DIAS_FERIAS_ANO', valor: '22', tipoValor: 'INT', descricao: 'Dias de férias por ano' },
    { chave: 'BASE_DIAS_MES', valor: '30', tipoValor: 'INT', descricao: 'Base de dias por mês' },
    { chave: 'LIMITE_PENHORA_PCT', valor: '33.33', tipoValor: 'DECIMAL', descricao: 'Limite de penhora sobre o líquido (%)' },
    { chave: 'HE_1A_PCT', valor: '50', tipoValor: 'DECIMAL', descricao: 'Majoração da 1.ª hora extra (%)' },
    { chave: 'HE_2A_PCT', valor: '75', tipoValor: 'DECIMAL', descricao: 'Majoração das horas extra seguintes (%)' },
    { chave: 'HE_DESCANSO_PCT', valor: '100', tipoValor: 'DECIMAL', descricao: 'Majoração em dia de descanso (%)' },
    { chave: 'EXTRAORD_ACUMULA_IRT', valor: 'true', tipoValor: 'BOOLEAN', descricao: 'Rendimentos extraordinários acumulam para a taxa de IRT' },
    { chave: 'RETENCAO_HONORARIOS', valor: '6.5', tipoValor: 'DECIMAL', descricao: 'Retenção sobre honorários de independentes (%)' },
    { chave: 'SALARIO_MINIMO', valor: '70000', tipoValor: 'DECIMAL', descricao: 'Salário mínimo nacional (AOA)' },
    { chave: 'LIMITE_ISENCAO_SUBS_ALIM', valor: '30000', tipoValor: 'DECIMAL', descricao: 'Limite mensal de isenção do subsídio de alimentação (AOA)' },
  ];

  for (const p of parametros) {
    const existente = await prisma.rhParametroFiscal.findFirst({
      where: { empresaId, chave: p.chave, vigenteDesde: vigenciaInicial },
      select: { id: true },
    });
    if (existente) continue;
    await prisma.rhParametroFiscal.create({
      data: {
        empresaId,
        chave: p.chave,
        valor: p.valor,
        tipoValor: p.tipoValor,
        descricao: p.descricao,
        vigenteDesde: vigenciaInicial,
      },
    });
  }
  console.log(`✅ RH: ${parametros.length} parâmetros fiscais verificados.`);

  // 7.4 Tabela de IRT vigente (valores a validar com RH/jurídico) ───────────
  const descricaoIrt = 'Tabela de IRT (regime geral) — valores a validar';
  const tabelaExistente = await prisma.rhTabelaIRT.findFirst({
    where: { empresaId, descricao: descricaoIrt },
    select: { id: true },
  });
  if (!tabelaExistente) {
    const escaloes = [
      { ordem: 1, rendimentoDe: 0, rendimentoAte: 100000, parcelaFixa: 0, taxa: 0, excessoDe: 0 },
      { ordem: 2, rendimentoDe: 100000, rendimentoAte: 150000, parcelaFixa: 0, taxa: 13, excessoDe: 100000 },
      { ordem: 3, rendimentoDe: 150000, rendimentoAte: 200000, parcelaFixa: 6500, taxa: 16, excessoDe: 150000 },
      { ordem: 4, rendimentoDe: 200000, rendimentoAte: 300000, parcelaFixa: 14500, taxa: 18, excessoDe: 200000 },
      { ordem: 5, rendimentoDe: 300000, rendimentoAte: 500000, parcelaFixa: 32500, taxa: 19, excessoDe: 300000 },
      { ordem: 6, rendimentoDe: 500000, rendimentoAte: 1000000, parcelaFixa: 70500, taxa: 20, excessoDe: 500000 },
      { ordem: 7, rendimentoDe: 1000000, rendimentoAte: 1500000, parcelaFixa: 170500, taxa: 21, excessoDe: 1000000 },
      { ordem: 8, rendimentoDe: 1500000, rendimentoAte: 2000000, parcelaFixa: 275500, taxa: 22, excessoDe: 1500000 },
      { ordem: 9, rendimentoDe: 2000000, rendimentoAte: 2500000, parcelaFixa: 385500, taxa: 23, excessoDe: 2000000 },
      { ordem: 10, rendimentoDe: 2500000, rendimentoAte: 5000000, parcelaFixa: 500500, taxa: 24, excessoDe: 2500000 },
      { ordem: 11, rendimentoDe: 5000000, rendimentoAte: null, parcelaFixa: 1100500, taxa: 25, excessoDe: 5000000 },
    ];
    await prisma.rhTabelaIRT.create({
      data: {
        empresaId,
        descricao: descricaoIrt,
        vigenteDesde: vigenciaInicial,
        escaloes: { create: escaloes },
      },
    });
  }
  console.log('✅ RH: tabela de IRT verificada.');

  // 7.5 Configuração singleton ──────────────────────────────────────────────
  await prisma.rhConfiguracao.upsert({
    where: { empresaId },
    update: {},
    create: {
      empresaId,
      modoSubsidioNatalPadrao: 'PAGAMENTO_UNICO',
      mesSubsidioNatalPadrao: 12,
      modoSubsidioFeriasPadrao: 'ANTES_GOZO',
      baseDiasMes: 30,
      liquidoNegativoBloqueia: true,
      serieRecibo: 'RV',
    },
  });
  console.log('✅ RH: configuração singleton verificada.');

  // 7.6 Períodos P01..P12 do ano corrente ───────────────────────────────────
  const anoCorrente = new Date().getFullYear();
  const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  await prisma.rhPeriodo.createMany({
    data: Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      return {
        empresaId,
        ano: anoCorrente,
        codigo: `P${String(mes).padStart(2, '0')}`,
        mes,
        descricao: `${nomesMeses[i]} ${anoCorrente}`,
        dataInicio: new Date(Date.UTC(anoCorrente, i, 1)),
        dataFim: new Date(Date.UTC(anoCorrente, mes, 0)),
      };
    }),
    skipDuplicates: true,
  });
  console.log(`✅ RH: períodos P01..P12 de ${anoCorrente} verificados.`);

  // 7.7 Dados de referência: departamentos e cargos (RH-806) ────────────────
  // A importação CSV resolve departamento/cargo por código; sem estes registos
  // uma empresa nova não consegue importar funcionários. A lista é partilhada
  // com o assistente de migração (`RhMigracaoWizard`).
  const referencia = await semearDepartamentosECargos(prisma, empresaId);
  console.log(
    `✅ RH: dados de referência — ${referencia.departamentosCriados} departamento(s) e ${referencia.cargosCriados} cargo(s) criados.`
  );
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
