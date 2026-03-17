import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AdminRole = 'admin' | 'support' | 'analyst';

export interface AdminPermissions {
  isAdmin: boolean;
  role: AdminRole | null;
  permissions: string[];
  canAccessAdminSection: (section: string) => boolean;
}

export function usePermissions(): AdminPermissions {
  const { user } = useAuth();

  // Check admin_user_roles table for proper RBAC
  const { data: roleData } = useQuery({
    queryKey: ['admin-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('admin_user_roles')
        .select('role, permissions')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Also check the server-side is_application_admin() function
  // This is the source of truth for admin status (SECURITY DEFINER function)
  const { data: isServerAdmin } = useQuery({
    queryKey: ['is-app-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase.rpc('is_application_admin');
      if (error) return false;
      return data === true;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const isAdmin = isServerAdmin === true || roleData?.role === 'admin';
  const role = (roleData?.role as AdminRole | null) ?? (isAdmin ? 'admin' : null);
  const permissions: string[] = Array.isArray(roleData?.permissions)
    ? (roleData!.permissions as string[])
    : isAdmin
      ? ['admin', 'support', 'analyst']
      : [];

  const canAccessAdminSection = (section: string): boolean => {
    if (isAdmin) return true;
    return permissions.includes(section);
  };

  return { isAdmin, role, permissions, canAccessAdminSection };
}
