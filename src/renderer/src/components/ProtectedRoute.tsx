import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Loader2 } from 'lucide-react';
import type { ModuleKey } from '../config/modules';
import type { AcaoRbac } from '../config/permissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Módulo cuja permissão é exigida. Se omitido, apenas exige autenticação. */
  module?: ModuleKey;
  /** Acção mínima exigida para o módulo (default "read"). */
  action?: AcaoRbac;
}

export function ProtectedRoute({ children, module, action = 'read' }: ProtectedRouteProps) {
  const { isAuthenticated, checkSession, hasPermission } = useAuth();
  const [isInitializing, setIsInitializing] = useState(!isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) {
      checkSession().finally(() => {
        setIsInitializing(false);
      });
    } else {
      setIsInitializing(false);
    }
  }, [isAuthenticated, checkSession]);

  if (isInitializing) {
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

  return <>{children}</>;
}
