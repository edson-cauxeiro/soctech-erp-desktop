/**
 * @file DbConfigPanel.tsx
 * @description Painel oculto (Shift+F10) para configurar a ligação à base de dados
 * e o APP_SECRET, com re-autenticação e teste de ligação.
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Eye, EyeOff, Plug, Save, Loader2, ShieldAlert, Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';

const schema = z.object({
  host: z.string().min(1, 'Campo obrigatório'),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.string().min(1, 'Campo obrigatório'),
  password: z.string().min(1, 'Campo obrigatório'),
  database: z.string().min(1, 'Campo obrigatório'),
  appSecret: z.string().min(8, 'Mínimo 8 caracteres'),
});

type DbConfigValues = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function DbConfigPanel({ isOpen, onClose }: Props): React.JSX.Element {
  const { user } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [adminLogin, setAdminLogin] = useState(user?.login ?? '');
  const [adminPass, setAdminPass] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    ms?: number;
    error?: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<DbConfigValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      host: '',
      port: 5432,
      user: '',
      password: '',
      database: '',
      appSecret: '',
    },
  });

  // Carrega os valores actuais depois da confirmação de identidade.
  const carregarConfig = async (): Promise<void> => {
    setIsLoadingConfig(true);
    try {
      const res = await window.api.dbConfig.ler();
      if (res.success) {
        form.reset(res.data);
      } else {
        toast.error(res.error.message);
      }
    } catch (err) {
      toast.error((err as Error)?.message || 'Erro ao ler a configuração.');
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const handleConfirmIdentity = async (): Promise<void> => {
    const login = user?.login ?? adminLogin.trim();

    if (!login) {
      toast.error('Indique o utilizador administrador.');
      return;
    }
    if (!adminPass) {
      toast.error('Introduza a palavra-passe de administrador.');
      return;
    }

    setIsConfirming(true);
    try {
      // Chamada directa: um erro de credenciais não deve limpar a sessão actual
      // (como aconteceria ao usar o `login` da store de autenticação).
      const res = await window.api.auth.login({
        utilizador: login,
        senha: adminPass,
      });

      if (res.success) {
        setAdminPass('');
        setConfirmed(true);
        await carregarConfig();
      } else {
        toast.error(res.error.message || 'Palavra-passe incorrecta.');
      }
    } catch (err) {
      toast.error((err as Error)?.message || 'Erro ao confirmar a identidade.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleTest = async (): Promise<void> => {
    const valid = await form.trigger();
    if (!valid) return;

    const values = form.getValues();
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await window.api.dbConfig.testar({
        ...values,
        port: Number(values.port),
      });

      if (res.success) {
        setTestResult(res.data);
      } else {
        setTestResult({ ok: false, error: res.error.message });
      }
    } catch (err) {
      setTestResult({ ok: false, error: (err as Error)?.message || 'Erro no teste.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (values: DbConfigValues): Promise<void> => {
    const proceed = window.confirm(
      'Guardar a nova configuração? As operações em curso na base de dados serão interrompidas e o Prisma será reconectado.',
    );
    if (!proceed) return;

    setIsSaving(true);
    try {
      const res = await window.api.dbConfig.guardar({
        ...values,
        port: Number(values.port),
      });

      if (res.success) {
        toast.success('Configuração guardada. Prisma reconectado.');
        onClose();
      } else {
        toast.error(res.error.message);
      }
    } catch (err) {
      toast.error((err as Error)?.message || 'Erro ao guardar a configuração.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Configuração Técnica — Base de Dados
          </DialogTitle>
        </DialogHeader>

        {!confirmed ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {user
                  ? `Confirme a palavra-passe de ${user.login} para continuar.`
                  : 'Sem sessão iniciada, introduza as credenciais de um utilizador administrador.'}
              </span>
            </div>

            {!user && (
              <div className="space-y-1.5">
                <Label htmlFor="db-admin-login">Utilizador administrador</Label>
                <Input
                  id="db-admin-login"
                  value={adminLogin}
                  onChange={(e) => setAdminLogin(e.target.value)}
                  placeholder="Ex: admin"
                  autoFocus
                  autoComplete="username"
                  disabled={isConfirming}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleConfirmIdentity();
                    }
                  }}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="db-admin-pass">Palavra-passe</Label>
              <Input
                id="db-admin-pass"
                type="password"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                placeholder="Palavra-passe"
                autoFocus={!!user}
                autoComplete="current-password"
                disabled={isConfirming}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleConfirmIdentity();
                  }
                }}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isConfirming}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleConfirmIdentity()} disabled={isConfirming}>
                {isConfirming && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              void form.handleSubmit(handleSave)(e);
            }}
            className="space-y-4"
          >
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Alterar estes valores reconecta a base de dados e interrompe operações em curso.
              </span>
            </div>

            <fieldset disabled={isLoadingConfig || isSaving} className="space-y-3">
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="db-host">Host</Label>
                  <Input id="db-host" placeholder="localhost" {...form.register('host')} />
                  {form.formState.errors.host && (
                    <p className="text-[11px] text-destructive">{form.formState.errors.host.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="db-port">Porto</Label>
                  <Input id="db-port" type="number" placeholder="5432" {...form.register('port')} />
                  {form.formState.errors.port && (
                    <p className="text-[11px] text-destructive">{form.formState.errors.port.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="db-user">Utilizador</Label>
                <Input id="db-user" placeholder="utilizador" {...form.register('user')} />
                {form.formState.errors.user && (
                  <p className="text-[11px] text-destructive">{form.formState.errors.user.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="db-password">Palavra-passe</Label>
                <div className="relative">
                  <Input
                    id="db-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pr-10"
                    {...form.register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {form.formState.errors.password && (
                  <p className="text-[11px] text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="db-name">Base de dados</Label>
                <Input id="db-name" placeholder="doraerp" {...form.register('database')} />
                {form.formState.errors.database && (
                  <p className="text-[11px] text-destructive">
                    {form.formState.errors.database.message}
                  </p>
                )}
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="db-app-secret">APP_SECRET</Label>
                <div className="relative">
                  <Input
                    id="db-app-secret"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="••••••••••••••••••"
                    className="pr-10"
                    {...form.register('appSecret')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {form.formState.errors.appSecret && (
                  <p className="text-[11px] text-destructive">
                    {form.formState.errors.appSecret.message}
                  </p>
                )}
              </div>
            </fieldset>

            {testResult && (
              <p className={testResult.ok ? 'text-sm text-green-600' : 'text-sm text-red-600'}>
                {testResult.ok
                  ? `✅ Ligação OK — ${testResult.ms}ms`
                  : `❌ ${testResult.error || 'Ligação falhou.'}`}
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleTest()}
                disabled={isTesting || isSaving || isLoadingConfig}
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="h-4 w-4" />
                )}
                Testar Ligação
              </Button>

              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving || isLoadingConfig}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
