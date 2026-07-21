import { createServiceClient } from '../_shared/db/mod.ts'
import {
  disableMoodleReauthCredential,
  findMoodleReauthCredentialByUserId,
  upsertMoodleReauthCredential,
} from '../_shared/domain/moodle-reauth/repository.ts'

export interface MoodleReauthCredentialState {
  credentialCiphertext: string | null
  lastError: string | null
  lastReauthAt: string | null
  lastTokenIssuedAt: string | null
  moodleService: string
  moodleUrl: string
  moodleUsername: string
  reauthEnabled: boolean
}

export interface MoodleReauthSettingsState {
  credential: MoodleReauthCredentialState | null
  preferenceEnabled: boolean
}

export interface MoodleReauthSettingsRepository {
  disableCredential(userId: string): Promise<void>
  enableCredential(userId: string, credential: MoodleReauthCredentialState): Promise<void>
  getSettings(userId: string): Promise<MoodleReauthSettingsState>
  setPreference(userId: string, enabled: boolean): Promise<void>
}

export function createMoodleReauthSettingsRepository(): MoodleReauthSettingsRepository {
  const supabase = createServiceClient()

  return {
    async disableCredential(userId) {
      await disableMoodleReauthCredential(supabase, userId)
    },

    async enableCredential(userId, credential) {
      await upsertMoodleReauthCredential(supabase, {
        userId,
        moodleService: credential.moodleService,
        moodleUrl: credential.moodleUrl,
        moodleUsername: credential.moodleUsername,
        credentialCiphertext: credential.credentialCiphertext,
        reauthEnabled: true,
        lastError: null,
        lastReauthAt: credential.lastReauthAt,
        lastTokenIssuedAt: credential.lastTokenIssuedAt,
      })
    },

    async getSettings(userId) {
      const [{ data: user, error: userError }, credential] = await Promise.all([
        supabase
          .from('users')
          .select('background_reauth_enabled')
          .eq('id', userId)
          .maybeSingle(),
        findMoodleReauthCredentialByUserId(supabase, userId),
      ])

      if (userError) throw userError

      return {
        preferenceEnabled: user?.background_reauth_enabled ?? true,
        credential: credential
          ? {
              credentialCiphertext: credential.credential_ciphertext,
              lastError: credential.last_error,
              lastReauthAt: credential.last_reauth_at,
              lastTokenIssuedAt: credential.last_token_issued_at,
              moodleService: credential.moodle_service,
              moodleUrl: credential.moodle_url,
              moodleUsername: credential.moodle_username,
              reauthEnabled: credential.reauth_enabled,
            }
          : null,
      }
    },

    async setPreference(userId, enabled) {
      const { error } = await supabase
        .from('users')
        .update({ background_reauth_enabled: enabled })
        .eq('id', userId)

      if (error) throw error
    },
  }
}
