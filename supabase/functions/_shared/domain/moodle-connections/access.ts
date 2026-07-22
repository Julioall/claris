import type { AppSupabaseClient } from '../../db/mod.ts'
import { getMoodleToken, normalizeApprovedMoodleBaseUrl } from '../../moodle/mod.ts'
import { decryptMoodleReauthPayload } from '../../security/moodle-reauth-crypto.ts'
import {
  findMoodleSiteById,
  findOwnedMoodleConnection,
  markMoodleConnectionReauthRequired,
  markMoodleConnectionTokenIssued,
} from './repository.ts'

export type MoodleConnectionErrorCode =
  | 'connection_not_found'
  | 'connection_inactive'
  | 'site_not_approved'
  | 'reauth_not_configured'
  | 'reauth_failed'

export class MoodleConnectionError extends Error {
  readonly code: MoodleConnectionErrorCode

  constructor(code: MoodleConnectionErrorCode, message: string) {
    super(message)
    this.name = 'MoodleConnectionError'
    this.code = code
  }
}

export interface MoodleAccess {
  connectionId: string
  moodleSiteId: string
  moodleUserId: string
  moodleUrl: string
  service: string
  siteSlug: string
  token: string
  userId: string
}

interface ResolveMoodleAccessDependencies {
  decrypt: typeof decryptMoodleReauthPayload
  getToken: typeof getMoodleToken
  now: () => Date
}

const defaultDependencies: ResolveMoodleAccessDependencies = {
  decrypt: decryptMoodleReauthPayload,
  getToken: getMoodleToken,
  now: () => new Date(),
}

export async function resolveMoodleAccess(
  supabase: AppSupabaseClient,
  userId: string,
  connectionId: string,
  dependencies: ResolveMoodleAccessDependencies = defaultDependencies,
): Promise<MoodleAccess> {
  const connection = await findOwnedMoodleConnection(supabase, userId, connectionId)
  if (!connection) {
    throw new MoodleConnectionError('connection_not_found', 'Moodle connection was not found.')
  }
  if (connection.status !== 'active' && connection.status !== 'reauth_required') {
    throw new MoodleConnectionError('connection_inactive', 'Moodle connection is not active.')
  }

  const site = await findMoodleSiteById(supabase, connection.moodle_site_id)
  if (!site || site.status !== 'approved') {
    throw new MoodleConnectionError('site_not_approved', 'Moodle site is not approved.')
  }
  const moodleUrl = normalizeApprovedMoodleBaseUrl(site.base_url)
  if (!connection.reauth_enabled || !connection.credential_ciphertext || !connection.moodle_username) {
    throw new MoodleConnectionError(
      'reauth_not_configured',
      'Moodle connection requires reauthorization.',
    )
  }

  try {
    const { password } = await dependencies.decrypt(connection.credential_ciphertext)
    const tokenResponse = await dependencies.getToken(
      moodleUrl,
      connection.moodle_username,
      password,
      site.service,
    )

    if (!tokenResponse.token || tokenResponse.error) {
      const errorCode = tokenResponse.errorcode || 'token_error'
      await markMoodleConnectionReauthRequired(supabase, connection.id, errorCode)
      throw new MoodleConnectionError('reauth_failed', 'Moodle connection reauthorization failed.')
    }

    const timestamp = dependencies.now().toISOString()
    await markMoodleConnectionTokenIssued(supabase, connection.id, timestamp)
    return {
      connectionId: connection.id,
      moodleSiteId: site.id,
      moodleUserId: connection.moodle_user_id,
      moodleUrl,
      service: site.service,
      siteSlug: site.slug,
      token: tokenResponse.token,
      userId,
    }
  } catch (error) {
    if (error instanceof MoodleConnectionError) throw error
    await markMoodleConnectionReauthRequired(supabase, connection.id, 'reauth_failed')
      .catch(() => undefined)
    throw new MoodleConnectionError('reauth_failed', 'Moodle connection reauthorization failed.')
  }
}
