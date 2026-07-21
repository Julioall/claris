import {
  RequestBodyValidationError,
  expectBodyObject,
  readOptionalInteger,
  readOptionalString,
  readOptionalUuid,
  readRequiredBoolean,
  readRequiredLiteral,
  readRequiredUuid,
} from '../_shared/http/mod.ts'

export type AccessControlPayload =
  | { action: 'get_context' }
  | { action: 'list_permission_definitions' }
  | { action: 'list_groups' }
  | { action: 'search_users'; page: number; pageSize: number; query?: string }
  | {
      action: 'upsert_group'
      description?: string
      groupId?: string
      name: string
      permissionKeys: string[]
    }
  | { action: 'delete_group'; groupId: string; reassignToGroupId?: string }
  | { action: 'set_user_access'; groupId?: string; isAdmin: boolean; targetUserId: string }

const ACTIONS = [
  'get_context',
  'list_permission_definitions',
  'list_groups',
  'search_users',
  'upsert_group',
  'delete_group',
  'set_user_access',
] as const

const ACTION_FIELDS: Record<AccessControlPayload['action'], ReadonlySet<string>> = {
  get_context: new Set(['action']),
  list_permission_definitions: new Set(['action']),
  list_groups: new Set(['action']),
  search_users: new Set(['action', 'page', 'pageSize', 'query']),
  upsert_group: new Set(['action', 'groupId', 'name', 'description', 'permissionKeys']),
  delete_group: new Set(['action', 'groupId', 'reassignToGroupId']),
  set_user_access: new Set(['action', 'targetUserId', 'isAdmin', 'groupId']),
}

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function assertExactFields(body: Record<string, unknown>, action: AccessControlPayload['action']) {
  if (Object.keys(body).some((field) => !ACTION_FIELDS[action].has(field))) {
    invalid('Invalid request fields')
  }
}

function requiredTrimmedString(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string {
  const value = body[field]
  if (typeof value !== 'string') invalid(`Invalid ${field}`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) invalid(`Invalid ${field}`)
  return normalized
}

function permissionKeys(body: Record<string, unknown>): string[] {
  const value = body.permissionKeys
  if (!Array.isArray(value) || value.length > 200) invalid('Invalid permissionKeys')

  const normalized = value.map((item) => {
    if (typeof item !== 'string') invalid('Invalid permissionKeys')
    const key = item.trim()
    if (!/^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(key)) invalid('Invalid permissionKeys')
    return key
  })
  return [...new Set(normalized)]
}

export function parseAccessControlPayload(rawBody: unknown): AccessControlPayload {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', ACTIONS)
  assertExactFields(body, action)

  if (action === 'get_context' || action === 'list_permission_definitions' || action === 'list_groups') {
    return { action }
  }

  if (action === 'search_users') {
    return {
      action,
      page: readOptionalInteger(body, 'page', 1) ?? 1,
      pageSize: readOptionalInteger(body, 'pageSize', 1, 100) ?? 25,
      query: readOptionalString(body, 'query', 200)?.trim() || undefined,
    }
  }

  if (action === 'upsert_group') {
    return {
      action,
      groupId: readOptionalUuid(body, 'groupId'),
      name: requiredTrimmedString(body, 'name', 120),
      description: readOptionalString(body, 'description', 1000)?.trim() || undefined,
      permissionKeys: permissionKeys(body),
    }
  }

  if (action === 'delete_group') {
    return {
      action,
      groupId: readRequiredUuid(body, 'groupId'),
      reassignToGroupId: readOptionalUuid(body, 'reassignToGroupId'),
    }
  }

  const isAdmin = readRequiredBoolean(body, 'isAdmin')
  const groupId = readOptionalUuid(body, 'groupId')
  if (isAdmin && groupId) invalid('Administrators cannot be assigned to an access group')
  return {
    action,
    targetUserId: readRequiredUuid(body, 'targetUserId'),
    isAdmin,
    groupId,
  }
}
