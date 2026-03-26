import { supabase } from '@/integrations/supabase/client';
import { fetchGlobalAppSettings } from '@/lib/global-app-settings';

export async function fetchGlobalSettings() {
  return fetchGlobalAppSettings(supabase);
}
