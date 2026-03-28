import { Navigate, useLocation } from 'react-router-dom';

import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { type AppPermissionKey, getFirstAccessiblePrivatePath, NO_ACCESS_ROUTE } from '@/lib/access-control';

interface PermissionRouteProps {
  children: React.ReactNode;
  permission: AppPermissionKey;
}

export function PermissionRoute({ children, permission }: PermissionRouteProps) {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const { isAdmin, can, isLoading: isPermissionsLoading } = usePermissions();

  if (isLoading || (isAuthenticated && isPermissionsLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isAdmin || can(permission)) {
    return <>{children}</>;
  }

  const fallbackPath = getFirstAccessiblePrivatePath({ can, isAdmin });
  if (fallbackPath !== location.pathname) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <Navigate to={NO_ACCESS_ROUTE} replace />;
}
