import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLicensing } from '../hooks/useLicensing';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldAlert } from 'lucide-react';
import type { ModuleKey } from '../config/modules';
import type { AcaoRbac } from '../config/permissions';
import { getLicensingModuleLabel, isAlwaysAvailableModule, isLicensingModule } from '../../../shared/licensing/modules';
import { LICENSING_MESSAGES } from '../../../shared/licensing/messages';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Módulo cuja permissão é exigida. Se omitido, apenas exige autenticação. */
  module?: ModuleKey;
  /** Acção mínima exigida para o módulo (default "read"). */
  action?: AcaoRbac;
}

export function ProtectedRoute({ children, module, action = 'read' }: ProtectedRouteProps) {
  const { isAuthenticated, checkSession, hasPermission } = useAuth();
  const licencaCarregada = useLicensing((s) => s.carregado);
  const carregarLicenca = useLicensing((s) => s.carregar);
  const podeAcessarModulo = useLicensing((s) => s.podeAcessarModulo);
  const navigate = useNavigate();
  const [isInitializing, setIsInitializing] = useState(!isAuthenticated);

  // Configurações e Início não dependem de licença. Nos restantes módulos a
  // verificação do Renderer é só uma barreira visual: o Main volta a exigir a
  // licença em cada handler protegido.
  const exigeLicenca = Boolean(
    module && isLicensingModule(module) && !isAlwaysAvailableModule(module)
  );

  useEffect(() => {
    if (!isAuthenticated) {
      checkSession().finally(() => {
        setIsInitializing(false);
      });
    } else {
      setIsInitializing(false);
    }
  }, [isAuthenticated, checkSession]);

  useEffect(() => {
    if (isAuthenticated && exigeLicenca && !licencaCarregada) void carregarLicenca();
  }, [isAuthenticated, exigeLicenca, licencaCarregada, carregarLicenca]);

  if (isInitializing || (exigeLicenca && !licencaCarregada)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground font-medium">A carregar SOC TECHNO...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Se o módulo exige uma permissão específica e o utilizador não a tem, devolve ao início.
  if (module && !hasPermission(module, action)) {
    return <Navigate to="/inicio" replace />;
  }

  // RBAC e licenciamento são verificações distintas: passar a primeira não
  // basta quando o módulo não foi adquirido.
  if (exigeLicenca && module && !podeAcessarModulo(module)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md w-full text-center space-y-4 p-8 border border-destructive/30 rounded-2xl bg-card">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive grid place-items-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold">Módulo sem licença</h2>
          <p className="text-sm text-muted-foreground">
            {LICENSING_MESSAGES.MODULE_NOT_LICENSED} O módulo {getLicensingModuleLabel(module)} não está incluído na licença instalada.
          </p>
          <p className="text-xs text-muted-foreground">
            Consulte Configurações › Licenciamento para importar uma licença válida. Os dados existentes não foram apagados.
          </p>
          <Button onClick={() => navigate('/inicio')} className="cursor-pointer">
            Voltar ao Início
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
