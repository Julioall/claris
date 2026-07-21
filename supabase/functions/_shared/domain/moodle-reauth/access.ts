import type { AppSupabaseClient } from '../../db/mod.ts'
import { getMoodleToken } from '../../moodle/mod.ts'
import { decryptMoodleReauthPayload } from '../../security/moodle-reauth-crypto.ts'
import {
  findMoodleReauthCredentialByUserId,
  markMoodleReauthFailure,
  markMoodleReauthSuccess,
} from './repository.ts'

export interface MoodleAccess {
  moodleUrl: string
  token: string
}

export async function resolveMoodleAccess(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<MoodleAccess> {
  const credential = await findMoodleReauthCredentialByUserId(supabase, userId)
  if (!credential?.reauth_enabled || !credential.credential_ciphertext) {
    throw new Error(
      'A reautorizacao automatica do Moodle precisa estar ativa. Faca login novamente para registrar a credencial no servidor.',
    )
  }

  try {
    const { password } = await decryptMoodleReauthPayload(credential.credential_ciphertext)
    const tokenResponse = await getMoodleToken(
      credential.moodle_url,
      credential.moodle_username,
      password,
      credential.moodle_service,
    )

    if (!tokenResponse.token || tokenResponse.error) {
      throw new Error(tokenResponse.error || 'Nao foi possivel reautorizar a sessao do Moodle')
    }

    await markMoodleReauthSuccess(supabase, userId, new Date().toISOString())
    return { moodleUrl: credential.moodle_url, token: tokenResponse.token }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao reautorizar a sessao do Moodle'
    await markMoodleReauthFailure(supabase, userId, message).catch(() => undefined)
    throw new Error(message)
  }
}
