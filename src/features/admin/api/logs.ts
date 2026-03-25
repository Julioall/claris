// API para logs administrativos

import { supabase } from '@/integrations/supabase/client';

export async function fetchAdminLogs() {
  return supabase.from('app_error_logs').select('*');
}
