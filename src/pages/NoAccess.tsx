import { Clock3 } from 'lucide-react';
import { Navigate } from 'react-router-dom';

import { RouteLoadingScreen } from '@/app/routes/RouteLoadingScreen';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { getFirstAccessiblePrivatePath } from '@/lib/access-control';

export default function NoAccessPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const {
    isAdmin,
    isLoading: isPermissionsLoading,
    permissions,
    can,
  } = usePermissions({
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 5000,
  });

  if (isLoading || (isAuthenticated && isPermissionsLoading)) {
    return <RouteLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const hasOperationalAccess = isAdmin || permissions.length > 0;
  if (hasOperationalAccess) {
    return <Navigate to={getFirstAccessiblePrivatePath({ can, isAdmin })} replace />;
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-12">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Clock3 className="h-7 w-7" />
        </div>

        <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-primary/80">
          Bem-vindo a Claris
        </p>

        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Seu acesso esta quase pronto
        </h1>

        <div className="mt-5 space-y-3 text-base leading-7 text-muted-foreground sm:text-lg">
          <p>
            Voce e novo por aqui, e nosso time ja esta liberando o seu acesso na plataforma.
          </p>
          <p>
            Aguarde mais alguns instantes ate que a equipe atribua o grupo correto para o seu perfil.
          </p>
        </div>
      </div>
    </div>
  );
}
