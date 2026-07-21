import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

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

export async function fetchMoodleReauthSettings(_userId: string): Promise<MoodleReauthSettings> {
  return invokeEdgeFunction<MoodleReauthSettings>('moodle-reauth-settings', {
    body: { action: 'get_settings' },
  });
}

export async function updateMoodleReauthSettings(enabled: boolean): Promise<UpdateMoodleReauthSettingsResult> {
  return invokeEdgeFunction<UpdateMoodleReauthSettingsResult>('moodle-reauth-settings', {
    body: {
      action: 'update_settings',
      enabled,
    },
  });
}
