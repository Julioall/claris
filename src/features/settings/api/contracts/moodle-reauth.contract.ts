export interface MoodleReauthSettingsDto {
  credentialActive: boolean;
  lastError: string | null;
  lastReauthAt: string | null;
  preferenceEnabled: boolean;
}

export interface UpdateMoodleReauthSettingsDto {
  credentialActive: boolean;
  message: string;
  preferenceEnabled: boolean;
  requiresLogin: boolean;
}
