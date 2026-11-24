/**
 * @file env.ts
 * @description Validação e carregamento de variáveis de ambiente com Zod.
 */

import { z } from 'zod';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Carrega .env a partir da raiz do projeto
dotenv.config({ path: resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL é obrigatória.')
    .default('postgresql://doraerp_user:doraerp_secret@localhost:5432/doraerp?schema=public'),
  APP_SECRET: z.string().min(8, 'APP_SECRET deve ter pelo menos 8 caracteres').default('doraerp_secret_key_default_development_2026'),
  PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string().default('doraerp_user'),
  POSTGRES_PASSWORD: z.string().default('doraerp_secret'),
  POSTGRES_DB: z.string().default('doraerp'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Erro na validação das variáveis de ambiente:', result.error.format());
    throw new Error('Configuração de variáveis de ambiente inválida.');
  }

  return result.data;
}

export const env = parseEnv();
