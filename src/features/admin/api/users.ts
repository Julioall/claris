import { supabase } from '@/integrations/supabase/client';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['admin', 'support', 'analyst'],
  analyst: ['analyst'],
  support: ['support'],
};

export async function listAdminUsers() {
  return supabase
    .from('users')
    .select('id, full_name, moodle_username, email')
    .order('full_name');
}

export async function listAdminUserRoles() {
  return supabase
    .from('admin_user_roles')
    .select('*')
    .order('created_at', { ascending: false });
}

export async function upsertAdminUserRole(userId: string, role: string) {
  return supabase.from('admin_user_roles').upsert(
    {
      user_id: userId,
      role,
      permissions: ROLE_PERMISSIONS[role] ?? [role],
    },
    { onConflict: 'user_id' },
  );
}

export async function deleteAdminUserRole(id: string) {
  return supabase.from('admin_user_roles').delete().eq('id', id);
}
