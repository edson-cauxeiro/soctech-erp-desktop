import { defineConfig, env } from 'prisma/config'
import "dotenv/config";
// import { PrismaPg } from '@prisma/adapter-pg'

// =============================================================================
// DoraERP — Prisma Configuration (Prisma 7+)
// A URL de conexão é lida da variável de ambiente DATABASE_URL definida em .env
// =============================================================================

// export default defineConfig({
//   schema: './prisma/schema.prisma'
// })




export default defineConfig({
  datasource: {
    url: env("DATABASE_URL"),
    // Necessário ao `prisma migrate dev` para criar a shadow database e
    // ao `prisma migrate diff` quando a origem é a pasta de migrações.
    shadowDatabaseUrl: env("SHADOW_DATABASE_URL"),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});