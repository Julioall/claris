// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../edge-runtime.d.ts" />

import {
  createHandler,
  expectBodyObject,
  jsonResponse,
  RequestBodyValidationError,
} from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import {
  disableMoodleReauthCredential,
  findMoodleReauthCredentialByUserId,
  upsertMoodleReauthCredential,
} from '../_shared/domain/moodle-reauth/repository.ts'

interface MoodleReauthSettingsPayload {
  enabled: boolean
}

function parseBody(rawBody: unknown): MoodleReauthSettingsPayload {
  const body = expectBodyObject(rawBody)

  if (typeof body.enabled !== 'boolean') {
    throw new RequestBodyValidationError('Invalid enabled')
  }

  return { enabled: body.enabled }
}

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()

  const { error: userUpdateError } = await supabase
    .from('users')
    .update({ background_reauth_enabled: body.enabled })
    .eq('id', user.id)

  if (userUpdateError) throw userUpdateError

  const existingCredential = await findMoodleReauthCredentialByUserId(supabase, user.id)

  if (!body.enabled) {
    if (existingCredential) {
      await disableMoodleReauthCredential(supabase, user.id)
    }

    return jsonResponse({
      credentialActive: false,
      message: 'Reautorizacao automatica desativada para esta conta.',
      preferenceEnabled: false,
      requiresLogin: false,
    })
  }

  if (!existingCredential?.credential_ciphertext) {
    return jsonResponse({
      credentialActive: false,
      message: 'Preferencia salva. Faca logout e login novamente para registrar a credencial do Moodle nesta conta.',
      preferenceEnabled: true,
      requiresLogin: true,
    })
  }

  await upsertMoodleReauthCredential(supabase, {
    userId: user.id,
    moodleService: existingCredential.moodle_service,
    moodleUrl: existingCredential.moodle_url,
    moodleUsername: existingCredential.moodle_username,
    credentialCiphertext: existingCredential.credential_ciphertext,
    reauthEnabled: true,
    lastError: null,
    lastReauthAt: existingCredential.last_reauth_at,
    lastTokenIssuedAt: existingCredential.last_token_issued_at,
  })

  return jsonResponse({
    credentialActive: true,
    message: 'Reautorizacao automatica ativada para esta conta.',
    preferenceEnabled: true,
    requiresLogin: false,
  })
}, {
  parseBody,
  requireAuth: true,
}))
