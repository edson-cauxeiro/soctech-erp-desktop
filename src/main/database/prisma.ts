/**
 * @file prisma.ts
 * @description Singleton do PrismaClient com suporte para PostgreSQL via @prisma/adapter-pg.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '../config/env';

let prismaInstance: PrismaClient | null = null;
let pgPool: Pool | null = null;

/**
 * Obtém a instância Singleton do PrismaClient.
 * @returns Instância do PrismaClient inicializada.
 */
export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    pgPool = new Pool({
      connectionString: process.env['DATABASE_URL'] ?? env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    const adapter = new PrismaPg(pgPool);

    prismaInstance = new PrismaClient({
      adapter,
      log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  return prismaInstance;
}

/**
 * Instância pública do Prisma. É um proxy que delega sempre para a instância
 * actual, para que os serviços que importaram `prisma` no arranque passem a
 * usar a nova ligação depois de `reconnectPrisma()`.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

/**
 * Testa a conexão com a base de dados PostgreSQL.
 * @returns Promise<boolean> indicando sucesso da conexão.
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = getPrismaClient();
    await client.$connect();
    // Executa uma query simples de teste
    await client.$queryRaw`SELECT 1`;
    console.log('✅ Conexão com a base de dados PostgreSQL estabelecida com sucesso.');
    return true;
  } catch (error) {
    console.error('❌ Falha ao conectar com a base de dados PostgreSQL:', error);
    return false;
  }
}

/**
 * Encerra as conexões ativas do Prisma e do Pool PostgreSQL.
 */
export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  console.log('🔌 Conexão com o banco de dados encerrada.');
}

/**
 * Reconecta o Prisma com as novas variáveis de ambiente já definidas em
 * `process.env`. Chamada após `guardarConfig()` actualizar o `DATABASE_URL`.
 */
export async function reconnectPrisma(): Promise<void> {
  await disconnectPrisma();
  prismaInstance = null;
  pgPool = null;
  getPrismaClient();

  const ok = await testDatabaseConnection();
  if (!ok) {
    throw new Error('Não foi possível ligar à base de dados com a nova configuração.');
  }

  console.log('🔄 Prisma reconectado com nova configuração.');
}
