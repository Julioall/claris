import { supabase } from '@/integrations/supabase/client';
import { fetchGlobalAppSettings } from '@/lib/global-app-settings';

export interface LoginDefaults {
  moodleUrl: string;
  moodleService: string;
}

export async function fetchLoginDefaults(): Promise<LoginDefaults> {
  const appSettings = await fetchGlobalAppSettings(supabase);

  return {
    moodleUrl: appSettings.moodleConnectionUrl,
    moodleService: appSettings.moodleConnectionService,
  };
}
