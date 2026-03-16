import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import {
  DEFAULT_CLARIS_LLM_SETTINGS,
  parseClarisLlmSettings,
  type ClarisLlmSettings,
} from '@/lib/claris-settings';

export interface GlobalRiskThresholdDays {
  atencao: number;
  risco: number;
  critico: number;
}

export interface GlobalAppSettings {
  singletonId: string;
  moodleConnectionUrl: string;
  moodleConnectionService: string;
  riskThresholdDays: GlobalRiskThresholdDays;
  clarisSettings: ClarisLlmSettings;
}

export const GLOBAL_APP_SETTINGS_ID = 'global';
export const DEFAULT_MOODLE_URL = 'https://ead.fieg.com.br';
export const DEFAULT_MOODLE_SERVICE = 'moodle_mobile_app';

export const DEFAULT_GLOBAL_APP_SETTINGS: GlobalAppSettings = {
  singletonId: GLOBAL_APP_SETTINGS_ID,
  moodleConnectionUrl: DEFAULT_MOODLE_URL,
  moodleConnectionService: DEFAULT_MOODLE_SERVICE,
  riskThresholdDays: {
    atencao: 7,
    risco: 14,
    critico: 30,
  },
  clarisSettings: DEFAULT_CLARIS_LLM_SETTINGS,
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export const normalizeRiskThresholdDays = (value: GlobalRiskThresholdDays): GlobalRiskThresholdDays => ({
  atencao: Math.max(1, Math.floor(value.atencao)),
  risco: Math.max(1, Math.floor(value.risco)),
  critico: Math.max(1, Math.floor(value.critico)),
});

export function parseGlobalAppSettings(value: unknown): GlobalAppSettings {
  const raw = asObject(value);
  const rawRiskThreshold = asObject(raw.risk_threshold_days);

  return {
    singletonId: String(raw.singleton_id ?? GLOBAL_APP_SETTINGS_ID),
    moodleConnectionUrl: String(raw.moodle_connection_url ?? DEFAULT_MOODLE_URL),
    moodleConnectionService: String(raw.moodle_connection_service ?? DEFAULT_MOODLE_SERVICE),
    riskThresholdDays: normalizeRiskThresholdDays({
      atencao: Number(rawRiskThreshold.atencao ?? DEFAULT_GLOBAL_APP_SETTINGS.riskThresholdDays.atencao),
      risco: Number(rawRiskThreshold.risco ?? DEFAULT_GLOBAL_APP_SETTINGS.riskThresholdDays.risco),
      critico: Number(rawRiskThreshold.critico ?? DEFAULT_GLOBAL_APP_SETTINGS.riskThresholdDays.critico),
    }),
    clarisSettings: parseClarisLlmSettings(raw.claris_llm_settings),
  };
}

export async function fetchGlobalAppSettings(client: SupabaseClient<Database>): Promise<GlobalAppSettings> {
  const { data, error } = await client
    .from('app_settings')
    .select('singleton_id, moodle_connection_url, moodle_connection_service, risk_threshold_days, claris_llm_settings')
    .eq('singleton_id', GLOBAL_APP_SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return DEFAULT_GLOBAL_APP_SETTINGS;
  }

  return parseGlobalAppSettings(data);
}