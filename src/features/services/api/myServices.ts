// API para MyServicesPage

import { supabase } from '@/integrations/supabase/client';

export async function fetchAppServiceInstances() {
  return supabase.from('app_service_instances').select('*');
}

export async function fetchAppServiceInstanceEvents() {
  return supabase.from('app_service_instance_events').select('*');
}
