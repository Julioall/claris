import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const ADMIN_MOODLE_USERNAME = '04112637225';
const ADMIN_EMAIL = 'julioalves@fieg.com.br';

export type AdminRole = 'admin' | 'support' | 'analyst';

export interface AdminPermissions {
  isAdmin: boolean;
  role: AdminRole | null;
  permissions: string[];
  canAccessAdminSection: (section: string) => boolean;
}

function isHardcodedAdmin(user: { moodle_username?: string; email?: string } | null): boolean {
  if (!user) return false;
  return (
    user.moodle_username === ADMIN_MOODLE_USERNAME ||
    (user.email ?? '').toLowerCase() === ADMIN_EMAIL
  );
}

export function usePermissions(): AdminPermissions {
  const { user } = useAuth();

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

  const hardcoded = isHardcodedAdmin(user ?? null);
  const isAdmin = hardcoded || roleData?.role === 'admin';
  const role = (roleData?.role as AdminRole | null) ?? (hardcoded ? 'admin' : null);
  const permissions: string[] = Array.isArray(roleData?.permissions)
    ? (roleData!.permissions as string[])
    : hardcoded
      ? ['admin', 'support', 'analyst']
      : [];

  const canAccessAdminSection = (section: string): boolean => {
    if (isAdmin) return true;
    return permissions.includes(section);
  };

  return { isAdmin, role, permissions, canAccessAdminSection };
}
