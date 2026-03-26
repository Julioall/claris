import { supabase } from '@/integrations/supabase/client';
import { CLARIS_CONFIGURED_STORAGE_KEY, parseClarisLlmSettings } from '@/lib/claris-settings';
import { GLOBAL_APP_SETTINGS_ID } from '@/lib/global-app-settings';

export type ClarisAvailabilityStatus = 'ready' | 'not_configured' | 'invalid';

export interface ClarisChatInvokePayload {
  message: string;
  history: Array<{ role: 'assistant' | 'user'; content: string }>;
  moodleUrl?: string | null;
  moodleToken?: string | null;
  action?: {
    kind: 'quick_reply';
    value: string;
    jobId?: string;
  };
}

export interface ClarisChatFunctionResponse {
  reply?: unknown;
  uiActions?: unknown;
  richBlocks?: unknown;
}

export async function fetchClarisAvailability(): Promise<ClarisAvailabilityStatus> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('claris_llm_settings')
      .eq('singleton_id', GLOBAL_APP_SETTINGS_ID)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const rawSettings = (data?.claris_llm_settings ?? null) as unknown;
    const parsed = parseClarisLlmSettings(rawSettings);
    const rawConfiguredFlag = Boolean(
      rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)
        ? (rawSettings as { configured?: unknown }).configured
        : false,
    );

    const status: ClarisAvailabilityStatus = parsed.configured
      ? 'ready'
      : rawConfiguredFlag
        ? 'invalid'
        : 'not_configured';

    localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, String(status === 'ready'));
    return status;
  } catch {
    localStorage.setItem(CLARIS_CONFIGURED_STORAGE_KEY, 'false');
    return 'not_configured';
  }
}

export async function invokeClarisChat(payload: ClarisChatInvokePayload): Promise<ClarisChatFunctionResponse> {
  const { data, error } = await supabase.functions.invoke('claris-chat', {
    body: payload,
  });

  if (error) {
    throw error;
  }

  return (data ?? {}) as ClarisChatFunctionResponse;
}
