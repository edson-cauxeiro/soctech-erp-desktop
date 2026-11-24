# Plano: PostgreSQL Local + Painel de Configuração Oculto (Shift+F10)

## Objetivo

Duas melhorias independentes mas relacionadas:

1. **Migrar de Docker para PostgreSQL local** — o contentor Docker deixa de ser necessário em produção/desenvolvimento normal; o PostgreSQL é instalado directamente no Windows.
2. **Painel de configuração técnica oculto** — uma tela acessível apenas por `Shift+F10` que permite alterar as credenciais de ligação à base de dados (`host`, `port`, `user`, `password`, `database`) e o `APP_SECRET`, gravando no ficheiro `.env` em disco e reconectando o Prisma sem reiniciar a app.

---

## User Review Required

> [!IMPORTANT]
> **Segurança do painel oculto**: Qualquer utilizador com acesso físico ao teclado pode pressionar `Shift+F10` e ver/alterar as credenciais. Essas informações de só devem ser configurada uma vez e guardada, para que não seja necessário configurar outra vez caso feche e abra o app.

> [!WARNING]
> **Reconexão do Prisma sem reiniciar a app**: Após guardar novas credenciais, o `pg.Pool` e o `PrismaClient` são destruídos e recriados com os novos parâmetros. Quaisquer operações em curso (queries, transacções) serão interrompidas. O painel mostrará um aviso, mas não há mecanismo automático de espera por transacções activas. Se isso for um risco, pode-se optar por reiniciar a app inteira (`app.relaunch() + app.quit()`).

> [!IMPORTANT]
> **Localização do `.env` em produção**: Em desenvolvimento, o `.env` está na raiz do projecto (`process.cwd()`). Em produção (app empacotada com `electron-builder`), o `process.cwd()` aponta para uma pasta diferente. O plano usa `app.getPath('userData')` para guardar uma cópia do `.env` em produção (`%APPDATA%\soctechno-desktop\.env`). Confirme se esta abordagem é aceitável.

---

## Open Questions

> [!IMPORTANT]
> **Migração de dados do Docker**: Tem dados existentes no contentor Docker que precisam de ser migrados para o PostgreSQL local, ou a base de dados local começa do zero com as migrations?

> [!IMPORTANT]
> **Shadow database em produção**: O `SHADOW_DATABASE_URL` é apenas usado pelo `prisma migrate dev` (desenvolvimento). Em produção não é necessário. O painel deve incluir ou omitir esse campo?

---

## Parte 1 — Migrar Docker → PostgreSQL Local (Windows)

### Contexto

O `.env` actual já aponta para `localhost:5432` — a app **não precisa de alterações de código** para esta parte. A mudança é apenas de infraestrutura.

### Passos manuais (fora do código)

| # | Acção | Detalhe |
|---|---|---|
| 1 | Instalar PostgreSQL 16 no Windows | [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) — installer padrão, porta 5432 |
| 2 | Criar utilizador | `CREATE ROLE soctech_user WITH LOGIN PASSWORD 'soctech_secret' CREATEDB;` |
| 3 | Criar bases de dados | `CREATE DATABASE soctech_db OWNER soctech_user;` e `CREATE DATABASE soctech_shadow OWNER soctech_user;` |
| 4 | Aplicar migrations | `npx prisma migrate deploy` na raiz do projecto |
| 5 | (Opcional) Migrar dados do Docker | `pg_dump` do contentor → `psql` no PostgreSQL local |
| 6 | Parar o Docker | `docker compose down` — não apagar o `docker-compose.yml` (mantê-lo como referência) |

### Alterações de código (mínimas)

Nenhuma alteração obrigatória ao código da app para esta parte. O `.env` já está correcto.

**Opcional mas recomendado**: Adicionar comentário no `.env` a indicar que Docker já não é necessário:

```diff
- # PostgreSQL (Docker)
+ # PostgreSQL — local (instalado no Windows, já não requer Docker)
  POSTGRES_USER=soctech_user
  POSTGRES_PASSWORD=soctech_secret
  POSTGRES_DB=soctech_db
  POSTGRES_PORT=5432
```

---

## Parte 2 — Painel de Configuração Oculto (Shift+F10)

### Arquitectura geral

```
Renderer (React)                 Preload (contextBridge)          Main (Electron/Node)
────────────────                 ──────────────────────           ────────────────────
useDbConfigShortcut.ts           window.api.dbConfig              config.router.ts
  └─ keydown Shift+F10              .ler()          ────────────► config.controller.ts
     └─ abre DbConfigPanel          .guardar(data)  ────────────► config.service.ts
                                    .testar(data)   ────────────►   ├─ lê/escreve .env
                                                                     └─ reconnectPrisma()
```

### Fluxo de utilização

```
1. Utilizador prime Shift+F10  →  modal abre
2. App pede palavra-passe de Administrador (re-autenticação)
3. Após confirmação, campos são preenchidos com valores actuais do .env
4. Utilizador edita campos
5. Clica "Testar Ligação" → app testa conexão com os novos parâmetros (sem gravar)
6. Se OK, clica "Guardar"
7. App mostra aviso de interrupção de operações + confirmação
8. Grava .env + reconecta Prisma
9. Toast de sucesso / modal fecha
```

---

## Proposed Changes

### 1 — `src/main/services/config.service.ts` [NEW]

Responsável por:
- Ler o `.env` actual e devolver os campos editáveis
- Gravar os campos editáveis de volta no `.env` (preservando comentários e campos não editáveis como `NODE_ENV`)
- Reconectar o Prisma após gravar
- Testar uma conexão com parâmetros fornecidos sem gravar

```typescript
// src/main/services/config.service.ts

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

function getEnvPath(): string {
  // Desenvolvimento: raiz do projecto
  // Produção: userData (%APPDATA%\soctechno-desktop)
  if (process.env.NODE_ENV === 'development') {
    return resolve(process.cwd(), '.env');
  }
  return resolve(app.getPath('userData'), '.env');
}

export function lerConfig(): DbConfig {
  const envPath = getEnvPath();
  const content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
  
  const get = (key: string, fallback: string) => {
    const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].trim() : fallback;
  };

  const dbUrl = get('DATABASE_URL', 'postgresql://soctech_user:soctech_secret@localhost:5432/soctech_db?schema=public');
  // Parseia DATABASE_URL para extrair os campos individuais
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

export function guardarConfig(config: DbConfig): void {
  const envPath = getEnvPath();
  let content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';

  const dbUrl = `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}?schema=public`;
  const shadowUrl = `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}_shadow?schema=public`;

  const setVar = (content: string, key: string, value: string): string => {
    const regex = new RegExp(`^(${key}=).*$`, 'm');
    return regex.test(content)
      ? content.replace(regex, `$1${value}`)
      : content + `\n${key}=${value}`;
  };

  content = setVar(content, 'DATABASE_URL', dbUrl);
  content = setVar(content, 'SHADOW_DATABASE_URL', shadowUrl);
  content = setVar(content, 'APP_SECRET', config.appSecret);
  content = setVar(content, 'POSTGRES_USER', config.user);
  content = setVar(content, 'POSTGRES_PASSWORD', config.password);
  content = setVar(content, 'POSTGRES_DB', config.database);
  content = setVar(content, 'POSTGRES_PORT', String(config.port));

  writeFileSync(envPath, content, 'utf-8');

  // Recarrega as variáveis de ambiente no processo actual
  process.env['DATABASE_URL'] = dbUrl;
  process.env['SHADOW_DATABASE_URL'] = shadowUrl;
  process.env['APP_SECRET'] = config.appSecret;
  process.env['POSTGRES_USER'] = config.user;
  process.env['POSTGRES_PASSWORD'] = config.password;
  process.env['POSTGRES_DB'] = config.database;
  process.env['POSTGRES_PORT'] = String(config.port);
}

export async function testarConexao(config: DbConfig): Promise<{ ok: boolean; ms?: number; error?: string }> {
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
```

---

### 2 — `src/main/database/prisma.ts` [MODIFY]

Adicionar a função `reconnectPrisma()` que destrói o singleton actual e cria um novo com as variáveis de ambiente actualizadas:

```diff
+ /**
+  * Reconecta o Prisma com as novas variáveis de ambiente já definidas em process.env.
+  * Chamada após guardarConfig() actualizar o DATABASE_URL.
+  */
+ export async function reconnectPrisma(): Promise<void> {
+   await disconnectPrisma();          // encerra pool e prisma actuais
+   prismaInstance = null;
+   pgPool = null;
+   getPrismaClient();                 // recria com o novo process.env.DATABASE_URL
+   await testDatabaseConnection();
+   console.log('🔄 Prisma reconectado com nova configuração.');
+ }
```

---

### 3 — `src/main/routers/config.router.ts` [NEW]

Segue o padrão existente (ver `auth.router.ts`, `empresa.router.ts`):

```typescript
// src/main/routers/config.router.ts

import { ipcMain } from 'electron';
import { configController } from '../controllers/config.controller';

export function registerConfigRouter(): void {
  ipcMain.handle('config:ler', async () => {
    return configController.ler();
  });

  ipcMain.handle('config:guardar', async (_event, payload) => {
    return configController.guardar(payload);
  });

  ipcMain.handle('config:testar', async (_event, payload) => {
    return configController.testar(payload);
  });
}
```

---

### 4 — `src/main/controllers/config.controller.ts` [NEW]

Valida input com Zod e delega ao service:

```typescript
// src/main/controllers/config.controller.ts

import { z } from 'zod';
import { lerConfig, guardarConfig, testarConexao } from '../services/config.service';
import { reconnectPrisma } from '../database/prisma';

const dbConfigSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1),
  appSecret: z.string().min(8),
});

export const configController = {
  ler() {
    try {
      const data = lerConfig();
      return { success: true, data };
    } catch (err) {
      return { success: false, error: { code: 'CONFIG_READ_ERROR', message: (err as Error).message } };
    }
  },

  async guardar(payload: unknown) {
    const result = dbConfigSchema.safeParse(payload);
    if (!result.success) {
      return { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.message } };
    }
    try {
      guardarConfig(result.data);
      await reconnectPrisma();
      return { success: true, data: { message: 'Configuração guardada e Prisma reconectado.' } };
    } catch (err) {
      return { success: false, error: { code: 'CONFIG_SAVE_ERROR', message: (err as Error).message } };
    }
  },

  async testar(payload: unknown) {
    const result = dbConfigSchema.safeParse(payload);
    if (!result.success) {
      return { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.message } };
    }
    const testResult = await testarConexao(result.data);
    return { success: true, data: testResult };
  },
};
```

---

### 5 — `src/main/index.ts` [MODIFY]

Registar o novo router:

```diff
+ import { registerConfigRouter } from './routers/config.router';

  // Register IPC Routers
  registerAuthRouter();
  // ... (outros routers)
+ registerConfigRouter();
```

---

### 6 — `src/preload/index.ts` [MODIFY]

Adicionar `dbConfig` ao objecto `api` exposto via `contextBridge`:

```diff
+ dbConfig: {
+   ler: () => ipcRenderer.invoke('config:ler'),
+   guardar: (data: unknown) => ipcRenderer.invoke('config:guardar', data),
+   testar: (data: unknown) => ipcRenderer.invoke('config:testar', data),
+ },
```

---

### 7 — `src/preload/index.d.ts` [MODIFY]

Adicionar tipos à interface `ErpApi`:

```diff
+ dbConfig: {
+   ler: () => Promise<IpcResponse<{
+     host: string; port: number; user: string;
+     password: string; database: string; appSecret: string;
+   }>>;
+   guardar: (data: unknown) => Promise<IpcResponse<{ message: string }>>;
+   testar: (data: unknown) => Promise<IpcResponse<{ ok: boolean; ms?: number; error?: string }>>;
+ };
```

---

### 8 — `src/renderer/src/hooks/useDbConfigShortcut.ts` [NEW]

Hook global que detecta `Shift+F10` e controla visibilidade do painel:

```typescript
// src/renderer/src/hooks/useDbConfigShortcut.ts

import { useEffect, useState } from 'react';

export function useDbConfigShortcut() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'F10') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { isOpen, setIsOpen };
}
```

---

### 9 — `src/renderer/src/components/system/DbConfigPanel.tsx` [NEW]

Modal oculto com formulário, teste de ligação e confirmação de gravação.

**Estrutura visual:**

```
┌─────────────────────────────────────────────────────────────────┐
│  🔒  Configuração Técnica da Base de Dados        [×]           │
│  ─────────────────────────────────────────────────────────────  │
│  ⚠️  Confirme a sua identidade antes de continuar               │
│              │
│  ─────────────────────────────────────────────────────────────  │
│  Host           [localhost              ]                        │
│  Porto          [5432                  ]                        │
│  Utilizador     [soctech_user          ]                        │
│  Palavra-passe  [••••••••              ]  👁                    │
│  Base de dados  [soctech_db               ]                        │
│  APP_SECRET     [••••••••••••••••••    ]  👁                    │
│  ─────────────────────────────────────────────────────────────  │
│  [ 🔌 Testar Ligação ]         [ Cancelar ]  [ 💾 Guardar ]     │
│  ✅ Ligação OK — 12ms                                           │
└─────────────────────────────────────────────────────────────────┘
```

**Componentes shadcn usados:** `Dialog`, `DialogContent`, `DialogHeader`, `Input`, `Label`, `Button`, `Separator` — todos já existentes no projecto.

**Código resumido (estrutura):**

```typescript
// src/renderer/src/components/system/DbConfigPanel.tsx

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Eye, EyeOff, Plug, Save, Loader2, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';

const schema = z.object({
  host: z.string().min(1, 'Campo obrigatório'),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.string().min(1, 'Campo obrigatório'),
  password: z.string().min(1, 'Campo obrigatório'),
  database: z.string().min(1, 'Campo obrigatório'),
  appSecret: z.string().min(8, 'Mínimo 8 caracteres'),
});

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function DbConfigPanel({ isOpen, onClose }: Props) {
  const { user, login } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; ms?: number; error?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm({ resolver: zodResolver(schema) });

  // Carrega valores actuais ao abrir
  useEffect(() => {
    if (isOpen && confirmed) {
      window.api.dbConfig.ler().then(res => {
        if (res.success) form.reset(res.data);
      });
    }
    if (!isOpen) {
      setConfirmed(false);
      setAdminPass('');
      setTestResult(null);
    }
  }, [isOpen, confirmed]);

  const handleConfirmIdentity = async () => {
    if (!user) return;
    // Re-autentica com a palavra-passe fornecida
    const ok = await login({ utilizador: user.login, senha: adminPass });
    if (ok) setConfirmed(true);
    else toast.error('Palavra-passe incorrecta.');
  };

  const handleTest = async () => {
    const values = form.getValues();
    setIsTesting(true);
    const res = await window.api.dbConfig.testar(values);
    setIsTesting(false);
    if (res.success) setTestResult(res.data);
  };

  const handleSave = async (values: z.infer<typeof schema>) => {
    setIsSaving(true);
    const res = await window.api.dbConfig.guardar(values);
    setIsSaving(false);
    if (res.success) {
      toast.success('Configuração guardada. Prisma reconectado.');
      onClose();
    } else {
      toast.error(res.error.message);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Configuração Técnica — Base de Dados
          </DialogTitle>
        </DialogHeader>

        {/* Fase 1: confirmação de identidade */}
        {!confirmed ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Confirme a sua palavra-passe de administrador para continuar.
            </p>
            <Input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)}
              placeholder="Palavra-passe" onKeyDown={e => e.key === 'Enter' && handleConfirmIdentity()} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleConfirmIdentity}>Confirmar</Button>
            </div>
          </div>
        ) : (
          /* Fase 2: formulário */
          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
            {/* ... campos do formulário ... */}
            {testResult && (
              <p className={testResult.ok ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
                {testResult.ok ? `✅ Ligação OK — ${testResult.ms}ms` : `❌ ${testResult.error}`}
              </p>
            )}
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handleTest} disabled={isTesting}>
                {isTesting ? <Loader2 className="animate-spin" /> : <Plug className="h-4 w-4" />}
                Testar Ligação
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Loader2 className="animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

---

### 10 — `src/renderer/src/App.tsx` [MODIFY]

Montar o painel globalmente (está sempre presente no DOM, mas invisível):

```diff
+ import { DbConfigPanel } from './components/system/DbConfigPanel';
+ import { useDbConfigShortcut } from './hooks/useDbConfigShortcut';

  export default function App() {
+   const { isOpen, setIsOpen } = useDbConfigShortcut();

    return (
      <HashRouter>
        <ErrorBoundary>
          <Routes>
            {/* ... rotas existentes ... */}
          </Routes>
          <Toaster position="top-right" />
+         <DbConfigPanel isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </ErrorBoundary>
      </HashRouter>
    );
  }
```

---

## Diagrama de ficheiros

```
src/
├── main/
│   ├── controllers/
│   │   └── config.controller.ts        [NEW]
│   ├── database/
│   │   └── prisma.ts                   [MODIFY] — adiciona reconnectPrisma()
│   ├── routers/
│   │   └── config.router.ts            [NEW]
│   ├── services/
│   │   └── config.service.ts           [NEW]
│   └── index.ts                        [MODIFY] — regista registerConfigRouter()
├── preload/
│   ├── index.ts                        [MODIFY] — adiciona dbConfig ao api
│   └── index.d.ts                      [MODIFY] — adiciona tipos DbConfig
└── renderer/src/
    ├── App.tsx                         [MODIFY] — monta DbConfigPanel globalmente
    ├── components/system/
    │   └── DbConfigPanel.tsx           [NEW]
    └── hooks/
        └── useDbConfigShortcut.ts      [NEW]
```

**Total: 4 ficheiros novos, 5 ficheiros modificados.**

---

## Verification Plan

### Automated Tests

Não há testes automatizados para a UI (painel React), mas o service pode ser testado isoladamente:

```bash
# Correr testes existentes para garantir que nada quebrou
npx vitest run

# Build para verificar TypeScript
npx tsc --noEmit
```

### Manual Verification

1. **Abrir a app** (`npm run dev`)
2. **Premir `Shift+F10`** → modal deve aparecer com pedido de palavra-passe
3. **Introduzir palavra-passe errada** → deve mostrar erro sem abrir o formulário
4. **Introduzir palavra-passe correcta** → formulário deve aparecer preenchido com valores do `.env`
5. **Clicar "Testar Ligação"** com dados correctos → deve mostrar `✅ Ligação OK — Xms`
6. **Clicar "Testar Ligação"** com porta errada (ex.: 9999) → deve mostrar `❌ ...connection refused`
7. **Guardar** com dados correctos → toast de sucesso, modal fecha, Prisma reconectado
8. **Verificar `.env`** em disco → deve reflectir os novos valores
9. **Premir `Shift+F10` novamente** → modal fecha (toggle)
10. **Verificar que o atalho não funciona na tela de login** (ou funciona — a confirmar conforme preferência)
