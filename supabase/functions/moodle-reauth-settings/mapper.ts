import type { MoodleReauthSettingsDto, UpdateMoodleReauthSettingsDto } from './contract.ts'
import type { MoodleReauthSettingsState } from './repository.ts'

export function mapMoodleReauthSettings(state: MoodleReauthSettingsState): MoodleReauthSettingsDto {
  return {
    credentialActive: Boolean(state.credential?.credentialCiphertext) && state.credential?.reauthEnabled === true,
    lastError: state.credential?.lastError ?? null,
    lastReauthAt: state.credential?.lastReauthAt ?? null,
    preferenceEnabled: state.preferenceEnabled,
  }
}

export function mapMoodleReauthUpdate(
  preferenceEnabled: boolean,
  credentialActive: boolean,
  requiresLogin: boolean,
  message: string,
): UpdateMoodleReauthSettingsDto {
  return { credentialActive, message, preferenceEnabled, requiresLogin }
}
