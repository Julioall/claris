import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

type AuthorizationContextPayload = {
  is_admin?: boolean;
  group_id?: string | null;
  group_name?: string | null;
  group_slug?: string | null;
  permissions?: string[];
};

export interface UserAccessGroup {
  id: string;
  name: string;
  slug: string;
}

export interface UserPermissions {
  isAdmin: boolean;
  isLoading: boolean;
  isFetching: boolean;
  role: string | null;
  group: UserAccessGroup | null;
  permissions: string[];
  refresh: () => Promise<unknown>;
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  canAccessAdminSection: (_section: string) => boolean;
}

interface UsePermissionsOptions {
  staleTime?: number;
  refetchInterval?: number | false;
  refetchOnMount?: boolean | 'always';
}

const EMPTY_PERMISSIONS: string[] = [];

export function usePermissions(options: UsePermissionsOptions = {}): UserPermissions {
  const { user } = useAuth();

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['authorization-context', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data: context, error } = await supabase.rpc('get_current_user_authorization_context' as never);
      if (error) throw error;

      return (context ?? null) as AuthorizationContextPayload | null;
    },
    enabled: !!user?.id,
    staleTime: options.staleTime ?? 5 * 60 * 1000,
    refetchInterval: options.refetchInterval,
    refetchOnMount: options.refetchOnMount,
  });

  return useMemo(() => {
    const permissions = Array.isArray(data?.permissions)
      ? data.permissions.filter((permission): permission is string => typeof permission === 'string')
      : EMPTY_PERMISSIONS;
    const permissionSet = new Set(permissions);
    const isAdmin = data?.is_admin === true;
    const group = data?.group_id && data?.group_name && data?.group_slug
      ? {
          id: data.group_id,
          name: data.group_name,
          slug: data.group_slug,
        }
      : null;

    const can = (permission: string) => isAdmin || permissionSet.has(permission);
    const canAny = (requestedPermissions: string[]) => isAdmin || requestedPermissions.some((permission) => permissionSet.has(permission));

    return {
      isAdmin,
      isLoading,
      isFetching,
      role: isAdmin ? 'admin' : group?.slug ?? null,
      group,
      permissions,
      refresh: refetch,
      can,
      canAny,
      canAccessAdminSection: () => isAdmin,
    };
  }, [data, isFetching, isLoading, refetch]);
}
