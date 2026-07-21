import type { MoodleReauthSettingsDto, UpdateMoodleReauthSettingsDto } from './contract.ts'
import { mapMoodleReauthSettings, mapMoodleReauthUpdate } from './mapper.ts'
import type { MoodleReauthSettingsRepository } from './repository.ts'

export async function getMoodleReauthSettings(
  repository: MoodleReauthSettingsRepository,
  userId: string,
): Promise<MoodleReauthSettingsDto> {
  return mapMoodleReauthSettings(await repository.getSettings(userId))
}

export async function updateMoodleReauthSettings(
  repository: MoodleReauthSettingsRepository,
  userId: string,
  enabled: boolean,
): Promise<UpdateMoodleReauthSettingsDto> {
  await repository.setPreference(userId, enabled)
  const state = await repository.getSettings(userId)

  if (!enabled) {
    if (state.credential) await repository.disableCredential(userId)
    return mapMoodleReauthUpdate(
      false,
      false,
      false,
      'Reautorizacao automatica desativada para esta conta.',
    )
  }

  if (!state.credential?.credentialCiphertext) {
    return mapMoodleReauthUpdate(
      true,
      false,
      true,
      'Preferencia salva. Faca logout e login novamente para registrar a credencial do Moodle nesta conta.',
    )
  }

  await repository.enableCredential(userId, state.credential)
  return mapMoodleReauthUpdate(
    true,
    true,
    false,
    'Reautorizacao automatica ativada para esta conta.',
  )
}
