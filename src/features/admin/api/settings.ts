import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { AiGradingSettings } from '@/lib/ai-grading-settings';
import {
  fetchGlobalAppSettings,
  GLOBAL_APP_SETTINGS_ID,
  type GlobalRiskThresholdDays,
} from '@/lib/global-app-settings';
import type { ClarisLlmSettings } from '@/lib/claris-settings';

type ClarisConnectionInput = Pick<ClarisLlmSettings, 'provider' | 'model' | 'baseUrl'> & {
  apiKey?: string;
};

const parseFunctionErrorMessage = async (error: unknown): Promise<string | null> => {
  if (!(error instanceof FunctionsHttpError)) {
    return null;
  }

  try {
    const payload = await error.context.json() as { error?: unknown; message?: unknown };
    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      return payload.error.trim();
    }
    if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
      return payload.message.trim();
    }
  } catch {
    return null;
  }

  return null;
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

export async function saveAiGradingSettings(settings: AiGradingSettings) {
  return supabase.from('app_settings').upsert(
    {
      singleton_id: GLOBAL_APP_SETTINGS_ID,
      ai_grading_settings: settings,
    },
    { onConflict: 'singleton_id' },
  );
}

export async function testClarisLLM(input: ClarisConnectionInput) {
  const result = await supabase.functions.invoke('claris-llm-test', {
    body: {
      provider: input.provider,
      model: input.model,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
    },
  });

  if (result.error) {
    const message = await parseFunctionErrorMessage(result.error);
    if (message) {
      return {
        ...result,
        error: new Error(message),
      };
    }
  }

  return result;
}
