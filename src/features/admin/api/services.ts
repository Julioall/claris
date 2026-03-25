// API para app_service_instances

import { supabase } from '@/integrations/supabase/client';

export async function fetchAppServiceInstances() {
  return supabase.from('app_service_instances').select('*');
}
