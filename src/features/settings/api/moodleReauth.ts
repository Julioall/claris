import { supabase } from '@/integrations/supabase/client';
import { resolveFunctionsInvokeErrorMessage } from '@/lib/moodle-errors';

export interface MoodleReauthSettings {
  credentialActive: boolean;
  lastError: string | null;
  lastReauthAt: string | null;
  preferenceEnabled: boolean;
}

export interface UpdateMoodleReauthSettingsResult {
  credentialActive: boolean;
  message?: string;
  preferenceEnabled: boolean;
  requiresLogin: boolean;
}

export async function fetchMoodleReauthSettings(userId: string): Promise<MoodleReauthSettings> {
  const [{ data: userData, error: userError }, { data: credentialData, error: credentialError }] =
    await Promise.all([
      supabase
        .from('users')
        .select('background_reauth_enabled')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('user_moodle_reauth_credentials')
        .select('credential_ciphertext, reauth_enabled, last_error, last_reauth_at')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

  if (userError) throw userError;
  if (credentialError) throw credentialError;

  return {
    credentialActive:
      Boolean(credentialData?.credential_ciphertext) && credentialData?.reauth_enabled === true,
    lastError: credentialData?.last_error ?? null,
    lastReauthAt: credentialData?.last_reauth_at ?? null,
    preferenceEnabled: userData?.background_reauth_enabled ?? true,
  };
}

export async function updateMoodleReauthSettings(enabled: boolean): Promise<UpdateMoodleReauthSettingsResult> {
  const { data, error } = await supabase.functions.invoke('moodle-reauth-settings', {
    body: {
      enabled,
    },
  });

  if (error) {
    throw new Error(resolveFunctionsInvokeErrorMessage(error));
  }

  return {
    credentialActive: data?.credentialActive === true,
    message: typeof data?.message === 'string' ? data.message : undefined,
    preferenceEnabled: data?.preferenceEnabled === true,
    requiresLogin: data?.requiresLogin === true,
  };
}
