import {
  RequestBodyValidationError,
  expectBodyObject,
  readOptionalString,
  readRequiredBoolean,
  readRequiredLiteral,
  readRequiredString,
  readRequiredUuid,
} from '../_shared/http/mod.ts'

export type MoodleConnectionsPayload =
  | { action: 'list_sites' }
  | { action: 'list_connections' }
  | {
    action: 'create_connection'
    alias: string
    canWrite: false
    moodlePassword: string
    moodleUsername: string
    siteId: string
  }
  | { action: 'update_alias'; alias: string; connectionId: string }
  | {
    action: 'update_reauth'
    connectionId: string
    enabled: boolean
    moodlePassword?: string
    moodleUsername?: string
  }
  | { action: 'disconnect'; connectionId: string }

const ACTIONS = [
  'list_sites',
  'list_connections',
  'create_connection',
  'update_alias',
  'update_reauth',
  'disconnect',
] as const

const FIELDS: Record<MoodleConnectionsPayload['action'], ReadonlySet<string>> = {
  list_sites: new Set(['action']),
  list_connections: new Set(['action']),
  create_connection: new Set([
    'action',
    'alias',
    'canWrite',
    'moodlePassword',
    'moodleUsername',
    'siteId',
  ]),
  update_alias: new Set(['action', 'alias', 'connectionId']),
  update_reauth: new Set([
    'action',
    'connectionId',
    'enabled',
    'moodlePassword',
    'moodleUsername',
  ]),
  disconnect: new Set(['action', 'connectionId']),
}

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function assertExactFields(
  body: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    invalid('Invalid request fields')
  }
}

function readAlias(body: Record<string, unknown>): string {
  const alias = readRequiredString(body, 'alias', 80).trim().replace(/\s+/g, ' ')
  if (!alias) invalid('Invalid alias')
  return alias
}

function readCredential(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
  trim: boolean,
): string {
  const rawValue = readRequiredString(body, field, maxLength)
  const value = trim ? rawValue.trim() : rawValue
  if (!value) invalid(`Invalid ${field}`)
  return value
}

export function parseMoodleConnectionsPayload(rawBody: unknown): MoodleConnectionsPayload {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', ACTIONS)
  assertExactFields(body, FIELDS[action])

  if (action === 'list_sites' || action === 'list_connections') return { action }
  if (action === 'update_alias') {
    return {
      action,
      alias: readAlias(body),
      connectionId: readRequiredUuid(body, 'connectionId'),
    }
  }
  if (action === 'disconnect') {
    return { action, connectionId: readRequiredUuid(body, 'connectionId') }
  }
  if (action === 'create_connection') {
    const canWrite = readRequiredBoolean(body, 'canWrite')
    if (canWrite) invalid('New Moodle connections cannot enable writes')

    return {
      action,
      alias: readAlias(body),
      canWrite: false,
      moodlePassword: readCredential(body, 'moodlePassword', 1024, false),
      moodleUsername: readCredential(body, 'moodleUsername', 255, true),
      siteId: readRequiredUuid(body, 'siteId'),
    }
  }

  const enabled = readRequiredBoolean(body, 'enabled')
  const moodleUsername = readOptionalString(body, 'moodleUsername', 255)?.trim()
  const moodlePassword = readOptionalString(body, 'moodlePassword', 1024)
  if (enabled && (!moodleUsername || !moodlePassword)) {
    invalid('Moodle credentials are required to enable reauthorization')
  }
  if (!enabled && (moodleUsername || moodlePassword)) {
    invalid('Moodle credentials are not accepted when disabling reauthorization')
  }

  return {
    action,
    connectionId: readRequiredUuid(body, 'connectionId'),
    enabled,
    ...(moodleUsername ? { moodleUsername } : {}),
    ...(moodlePassword ? { moodlePassword } : {}),
  }
}
