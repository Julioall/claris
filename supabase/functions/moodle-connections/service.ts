import { ApiError } from '../_shared/http/mod.ts'
import type { Json } from '../_shared/db/mod.ts'
import { getMoodleToken, getSiteInfo } from '../_shared/moodle/mod.ts'
import type { MoodleSiteInfo, MoodleTokenResponse } from '../_shared/moodle/mod.ts'
import { encryptMoodleReauthPayload } from '../_shared/security/moodle-reauth-crypto.ts'
import {
  MOODLE_CONNECTIONS_CONTRACT_VERSION,
  type MoodleConnectionDto,
  type MoodleConnectionStatusDto,
  type MoodleConnectionsResponseDto,
  type MoodleConnectionResponseDto,
  type MoodleDisconnectResponseDto,
  type MoodleSiteOptionDto,
  type MoodleSitesResponseDto,
} from './contract.ts'
import type { MoodleConnectionsPayload } from './payload.ts'
import type {
  MoodleConnectionRecord,
  MoodleConnectionsRepository,
  MoodleSiteRecord,
} from './repository.ts'

interface MoodleConnectionsDependencies {
  encryptPassword: typeof encryptMoodleReauthPayload
  getSiteInfo: typeof getSiteInfo
  getToken: typeof getMoodleToken
  now: () => Date
}

const defaultDependencies: MoodleConnectionsDependencies = {
  encryptPassword: encryptMoodleReauthPayload,
  getSiteInfo,
  getToken: getMoodleToken,
  now: () => new Date(),
}

function toSiteDto(site: MoodleSiteRecord): MoodleSiteOptionDto {
  return { id: site.id, name: site.name, slug: site.slug }
}

function maskUsername(value: string | null): string | null {
  if (!value) return null
  const characters = Array.from(value)
  if (characters.length <= 2) return '*'.repeat(characters.length)
  return `${characters[0]}${'*'.repeat(Math.min(characters.length - 2, 8))}${characters.at(-1)}`
}

function sanitizeStatus(value: string): MoodleConnectionStatusDto {
  if (value === 'active' || value === 'reauth_required' || value === 'disconnecting') return value
  return 'disabled'
}

function toConnectionDto(
  connection: MoodleConnectionRecord,
  site: MoodleSiteRecord,
): MoodleConnectionDto {
  return {
    alias: connection.alias,
    canWrite: connection.can_write,
    id: connection.id,
    lastValidatedAt: connection.last_token_issued_at,
    reauthEnabled: connection.reauth_enabled,
    site: toSiteDto(site),
    status: sanitizeStatus(connection.status),
    usernameMasked: maskUsername(connection.moodle_username),
  }
}

function isConstraintViolation(error: unknown): boolean {
  return !!error && typeof error === 'object'
    && String((error as { code?: unknown }).code ?? '') === '23505'
}

function mapPersistenceError(error: unknown): never {
  if (isConstraintViolation(error)) {
    throw ApiError.conflict('This alias or Moodle account is already connected.')
  }
  throw error
}

function authenticationFailed(): ApiError {
  return new ApiError(
    'moodle_authentication_failed',
    'The Moodle credentials could not be validated.',
    422,
  )
}

async function authenticate(
  site: MoodleSiteRecord,
  username: string,
  password: string,
  dependencies: MoodleConnectionsDependencies,
): Promise<MoodleSiteInfo> {
  let tokenResponse: MoodleTokenResponse
  try {
    tokenResponse = await dependencies.getToken(site.base_url, username, password, site.service)
  } catch {
    throw authenticationFailed()
  }

  if (!tokenResponse.token || tokenResponse.error) throw authenticationFailed()

  try {
    const siteInfo = await dependencies.getSiteInfo(site.base_url, tokenResponse.token)
    if (!Number.isSafeInteger(siteInfo.userid) || siteInfo.userid <= 0) {
      throw authenticationFailed()
    }
    return siteInfo
  } catch {
    throw authenticationFailed()
  }
}

function capabilities(siteInfo: MoodleSiteInfo): Json {
  const functions = Array.from(new Set(
    (siteInfo.functions ?? [])
      .map((entry) => entry.name?.trim())
      .filter((name): name is string => !!name),
  )).sort()

  return {
    functions,
    observedRelease: siteInfo.release ?? null,
    observedVersion: siteInfo.version ?? null,
  }
}

async function requireSite(
  repository: MoodleConnectionsRepository,
  siteId: string,
): Promise<MoodleSiteRecord> {
  const site = await repository.findApprovedSite(siteId)
  if (!site) {
    throw new ApiError('moodle_site_disabled', 'The Moodle site is not available.', 422)
  }
  return site
}

async function requireConnection(
  repository: MoodleConnectionsRepository,
  userId: string,
  connectionId: string,
): Promise<MoodleConnectionRecord> {
  const connection = await repository.findOwnedConnection(userId, connectionId)
  if (!connection) {
    throw new ApiError('moodle_connection_not_found', 'Moodle connection was not found.', 404)
  }
  return connection
}

async function connectionResponse(
  repository: MoodleConnectionsRepository,
  connection: MoodleConnectionRecord,
): Promise<MoodleConnectionResponseDto> {
  const site = await repository.findSite(connection.moodle_site_id)
  if (!site) throw new ApiError('moodle_site_disabled', 'The Moodle site is not available.', 422)
  return {
    connection: toConnectionDto(connection, site),
    contractVersion: MOODLE_CONNECTIONS_CONTRACT_VERSION,
  }
}

export async function listMoodleSites(
  repository: MoodleConnectionsRepository,
): Promise<MoodleSitesResponseDto> {
  return {
    contractVersion: MOODLE_CONNECTIONS_CONTRACT_VERSION,
    sites: (await repository.listApprovedSites()).map(toSiteDto),
  }
}

export async function listMoodleConnections(
  repository: MoodleConnectionsRepository,
  userId: string,
): Promise<MoodleConnectionsResponseDto> {
  const connections = await repository.listOwnedConnections(userId)
  const sites = await Promise.all(
    Array.from(new Set(connections.map((connection) => connection.moodle_site_id)))
      .map((siteId) => repository.findSite(siteId)),
  )
  const sitesById = new Map(
    sites.filter((site): site is MoodleSiteRecord => !!site).map((site) => [site.id, site]),
  )

  return {
    connections: connections.flatMap((connection) => {
      const site = sitesById.get(connection.moodle_site_id)
      return site ? [toConnectionDto(connection, site)] : []
    }),
    contractVersion: MOODLE_CONNECTIONS_CONTRACT_VERSION,
  }
}

export async function executeMoodleConnectionsAction(
  repository: MoodleConnectionsRepository,
  userId: string,
  payload: MoodleConnectionsPayload,
  dependencies: MoodleConnectionsDependencies = defaultDependencies,
): Promise<
  | MoodleSitesResponseDto
  | MoodleConnectionsResponseDto
  | MoodleConnectionResponseDto
  | MoodleDisconnectResponseDto
> {
  if (payload.action === 'list_sites') return await listMoodleSites(repository)
  if (payload.action === 'list_connections') {
    return await listMoodleConnections(repository, userId)
  }

  if (payload.action === 'create_connection') {
    const site = await requireSite(repository, payload.siteId)
    const siteInfo = await authenticate(
      site,
      payload.moodleUsername,
      payload.moodlePassword,
      dependencies,
    )
    const timestamp = dependencies.now().toISOString()
    const credentialCiphertext = await dependencies.encryptPassword({
      password: payload.moodlePassword,
    })

    let connection: MoodleConnectionRecord
    try {
      connection = await repository.createConnection({
        alias: payload.alias,
        capabilities: capabilities(siteInfo),
        credentialCiphertext,
        moodleAvatarUrl: siteInfo.profileimageurl ?? null,
        moodleEmail: siteInfo.email || null,
        moodleFullName: siteInfo.fullname || null,
        moodleSiteId: site.id,
        moodleUserId: String(siteInfo.userid),
        moodleUsername: siteInfo.username || payload.moodleUsername,
        timestamp,
        userId,
      })
    } catch (error) {
      mapPersistenceError(error)
    }

    await repository.updateSiteObservation(
      site.id,
      siteInfo.release ?? site.release,
      siteInfo.version ?? site.version,
    ).catch(() => undefined)
    return await connectionResponse(repository, connection)
  }

  if (payload.action === 'update_alias') {
    await requireConnection(repository, userId, payload.connectionId)
    try {
      const connection = await repository.updateAlias(userId, payload.connectionId, payload.alias)
      if (!connection) {
        throw new ApiError('moodle_connection_not_found', 'Moodle connection was not found.', 404)
      }
      return await connectionResponse(repository, connection)
    } catch (error) {
      if (error instanceof ApiError) throw error
      mapPersistenceError(error)
    }
  }

  if (payload.action === 'update_reauth') {
    const existing = await requireConnection(repository, userId, payload.connectionId)
    if (existing.status === 'disconnecting' || existing.status === 'disabled') {
      throw ApiError.conflict('A disconnected Moodle connection cannot be reauthorized.')
    }

    if (!payload.enabled) {
      const connection = await repository.disableReauth(userId, payload.connectionId)
      if (!connection) {
        throw new ApiError('moodle_connection_not_found', 'Moodle connection was not found.', 404)
      }
      return await connectionResponse(repository, connection)
    }

    const site = await requireSite(repository, existing.moodle_site_id)
    const siteInfo = await authenticate(
      site,
      payload.moodleUsername!,
      payload.moodlePassword!,
      dependencies,
    )
    if (String(siteInfo.userid) !== existing.moodle_user_id) {
      throw ApiError.conflict('The credentials belong to a different Moodle account.')
    }

    const timestamp = dependencies.now().toISOString()
    const credentialCiphertext = await dependencies.encryptPassword({
      password: payload.moodlePassword!,
    })
    const connection = await repository.updateReauth({
      capabilities: capabilities(siteInfo),
      connectionId: existing.id,
      credentialCiphertext,
      moodleAvatarUrl: siteInfo.profileimageurl ?? null,
      moodleEmail: siteInfo.email || null,
      moodleFullName: siteInfo.fullname || null,
      moodleUsername: siteInfo.username || payload.moodleUsername!,
      timestamp,
      userId,
    })
    if (!connection) {
      throw new ApiError('moodle_connection_not_found', 'Moodle connection was not found.', 404)
    }
    await repository.updateSiteObservation(
      site.id,
      siteInfo.release ?? site.release,
      siteInfo.version ?? site.version,
    ).catch(() => undefined)
    return await connectionResponse(repository, connection)
  }

  const existing = await requireConnection(repository, userId, payload.connectionId)
  if (existing.status === 'disabled') {
    return {
      ...await connectionResponse(repository, existing),
      pendingLeases: 0,
    }
  }
  const disconnecting = await repository.beginDisconnect(userId, payload.connectionId)
  if (!disconnecting) {
    throw new ApiError('moodle_connection_not_found', 'Moodle connection was not found.', 404)
  }
  const pendingLeases = await repository.cancelConnectionJobs(
    userId,
    payload.connectionId,
  )
  const connection = pendingLeases === 0
    ? await repository.finalizeDisconnect(userId, payload.connectionId)
    : disconnecting
  if (!connection) throw ApiError.conflict('Moodle connection disconnect could not be finalized.')

  return {
    ...await connectionResponse(repository, connection),
    pendingLeases,
  }
}
