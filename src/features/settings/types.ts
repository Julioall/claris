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
