/**
 * @file config.service.ts
 * @description Leitura/gravação da configuração técnica da base de dados no `.env`
 * e teste de ligação ao PostgreSQL.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { app } from 'electron';
import { Pool } from 'pg';

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  appSecret: string;
}

/**
 * Devolve o caminho do `.env` a usar.
 * - Desenvolvimento: raiz do projecto (`process.cwd()`).
 * - Produção: pasta de dados do utilizador (`%APPDATA%\soctechno-desktop`).
 */
function getEnvPath(): string {
  if (process.env.NODE_ENV === 'development') {
    return resolve(process.cwd(), '.env');
  }
  return resolve(app.getPath('userData'), '.env');
}

/**
 * Lê a configuração actual a partir do `.env`.
 */
export function lerConfig(): DbConfig {
  const envPath = getEnvPath();
  const content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';

  const get = (key: string, fallback: string): string => {
    const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].trim() : fallback;
  };

  const dbUrl = get(
    'DATABASE_URL',
    'postgresql://doraerp_user:doraerp_secret@localhost:5432/doraerp?schema=public',
  );
  const url = new URL(dbUrl);

  return {
    host: url.hostname,
    port: parseInt(url.port || '5432', 10),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace('/', '').split('?')[0],
    appSecret: get('APP_SECRET', ''),
  };
}

/**
 * Grava a configuração no `.env`, preservando comentários e restantes variáveis.
 */
export function guardarConfig(config: DbConfig): void {
  const envPath = getEnvPath();
  let content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';

  const dbUrl = `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}?schema=public`;
  const shadowUrl = `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}_shadow?schema=public`;

  const setVar = (current: string, key: string, value: string): string => {
    const regex = new RegExp(`^(${key}=).*$`, 'm');
    return regex.test(current)
      ? current.replace(regex, (_match, prefix: string) => `${prefix}${value}`)
      : current + `\n${key}=${value}`;
  };

  content = setVar(content, 'DATABASE_URL', dbUrl);
  content = setVar(content, 'SHADOW_DATABASE_URL', shadowUrl);
  content = setVar(content, 'APP_SECRET', config.appSecret);
  content = setVar(content, 'POSTGRES_USER', config.user);
  content = setVar(content, 'POSTGRES_PASSWORD', config.password);
  content = setVar(content, 'POSTGRES_DB', config.database);
  content = setVar(content, 'POSTGRES_PORT', String(config.port));

  writeFileSync(envPath, content, 'utf-8');

  // Recarrega as variáveis de ambiente no processo actual, para que o Prisma
  // possa ser reconectado com os novos parâmetros.
  process.env['DATABASE_URL'] = dbUrl;
  process.env['SHADOW_DATABASE_URL'] = shadowUrl;
  process.env['APP_SECRET'] = config.appSecret;
  process.env['POSTGRES_USER'] = config.user;
  process.env['POSTGRES_PASSWORD'] = config.password;
  process.env['POSTGRES_DB'] = config.database;
  process.env['POSTGRES_PORT'] = String(config.port);
}

/**
 * Testa uma ligação ao PostgreSQL com os parâmetros indicados, sem gravar nada.
 */
export async function testarConexao(
  config: DbConfig,
): Promise<{ ok: boolean; ms?: number; error?: string }> {
  const connectionString = `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`;
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  const start = Date.now();

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return { ok: true, ms: Date.now() - start };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    await pool.end().catch(() => undefined);
  }
}
