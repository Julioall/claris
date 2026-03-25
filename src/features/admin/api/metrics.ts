// API para métricas administrativas

import { supabase } from '@/integrations/supabase/client';

export async function fetchAppUsageEventsCount() {
  return supabase.from('app_usage_events').select('*', { count: 'exact', head: true });
}

export async function fetchAppErrorLogsCount() {
  return supabase.from('app_error_logs').select('*', { count: 'exact', head: true });
}
