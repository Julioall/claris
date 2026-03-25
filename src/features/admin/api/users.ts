// API para admin_user_roles

import { supabase } from '@/integrations/supabase/client';

export async function fetchAdminUsers() {
  return supabase.from('admin_user_roles').select('*');
}
