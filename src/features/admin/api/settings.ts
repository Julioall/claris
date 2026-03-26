import { supabase } from '@/integrations/supabase/client';
import {
  fetchGlobalAppSettings,
  GLOBAL_APP_SETTINGS_ID,
  type GlobalRiskThresholdDays,
} from '@/lib/global-app-settings';
import type { ClarisLlmSettings } from '@/lib/claris-settings';

type ClarisConnectionInput = Pick<ClarisLlmSettings, 'provider' | 'model' | 'baseUrl'> & {
  apiKey?: string;
};

export async function fetchAdminSettings() {
  return fetchGlobalAppSettings(supabase);
}

export async function saveRiskThresholdSettings(riskThresholdDays: GlobalRiskThresholdDays) {
  return supabase.from('app_settings').upsert(
    {
      singleton_id: GLOBAL_APP_SETTINGS_ID,
      risk_threshold_days: riskThresholdDays,
    },
    { onConflict: 'singleton_id' },
  );
}

export async function saveMoodleConnectionSettings(url: string, service: string) {
  return supabase.from('app_settings').upsert(
    {
      singleton_id: GLOBAL_APP_SETTINGS_ID,
      moodle_connection_url: url,
      moodle_connection_service: service,
    },
    { onConflict: 'singleton_id' },
  );
}

export async function saveClarisConnectionSettings(settings: Record<string, unknown>) {
  return supabase.from('app_settings').upsert(
    {
      singleton_id: GLOBAL_APP_SETTINGS_ID,
      claris_llm_settings: settings,
    },
    { onConflict: 'singleton_id' },
  );
}

export async function testClarisLLM(input: ClarisConnectionInput) {
  return supabase.functions.invoke('claris-llm-test', {
    body: {
      provider: input.provider,
      model: input.model,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
    },
  });
}
