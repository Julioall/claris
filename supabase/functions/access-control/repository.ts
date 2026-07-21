import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import { createServiceClient, type AppSupabaseClient } from '../_shared/db/mod.ts'
import { ApiError } from '../_shared/http/mod.ts'

export interface AuthorizationContextRow {
  group_id?: unknown
  group_name?: unknown
  group_slug?: unknown
  is_admin?: unknown
  permissions?: unknown
}

export interface AccessPermissionDefinitionRow {
  category: string
  description: string | null
  key: string
  label: string
  sort_order: number
}

export interface AccessGroupRow {
  description: string | null
  id: string
  name: string
  permissions: string[]
  slug: string
  user_count: number | string
}

export interface AccessUserRow {
  email: string | null
  full_name: string
  group_id: string | null
  group_name: string | null
  group_slug: string | null
  is_admin: boolean
  moodle_username: string
  total_count: number | string
  user_id: string
}

export type SaveGroupResult =
  | { kind: 'saved'; created: boolean; groupId: string }
  | { kind: 'not_found' | 'conflict' | 'invalid_name' | 'invalid_permissions' }

export type DeleteGroupResult =
  | { kind: 'deleted'; groupId: string; reassignedUserCount: number }
  | {
      kind: 'not_found' | 'destination_not_found' | 'invalid_reassignment'
    }
  | { kind: 'group_has_users'; memberCount: number }

export type SetUserAccessResult =
  | { kind: 'saved'; groupId: string | null; isAdmin: boolean; userId: string }
  | {
      kind:
        | 'not_found'
        | 'self_lockout'
        | 'protected_admin'
        | 'group_not_found'
        | 'invalid_access'
    }

export interface AccessControlRepository {
  deleteGroup(actorId: string, groupId: string, reassignToGroupId?: string): Promise<DeleteGroupResult>
  getAuthorizationContext(actorId: string): Promise<AuthorizationContextRow>
  isApplicationAdmin(actorId: string): Promise<boolean>
  listGroups(actorId: string): Promise<AccessGroupRow[]>
  listPermissionDefinitions(actorId: string): Promise<AccessPermissionDefinitionRow[]>
  saveGroup(actorId: string, input: {
    description?: string
    groupId?: string
    name: string
    permissionKeys: string[]
  }): Promise<SaveGroupResult>
  searchUsers(actorId: string, input: {
    limit: number
    offset: number
    query?: string
  }): Promise<AccessUserRow[]>
  setUserAccess(actorId: string, input: {
    groupId?: string
    isAdmin: boolean
    targetUserId: string
  }): Promise<SetUserAccessResult>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function throwRpcError(error: unknown): void {
  if (!error) return
  const code = asRecord(error)?.code
  if (code === '42501') throw ApiError.forbidden('Admin access required.')
  throw error
}

function resultRecord(value: unknown): Record<string, unknown> {
  const result = asRecord(value)
  if (!result || typeof result.result !== 'string') {
    throw new Error('Invalid access-control command result')
  }
  return result
}

function parseSaveGroupResult(value: unknown): SaveGroupResult {
  const result = resultRecord(value)
  if (
    result.result === 'saved'
    && typeof result.group_id === 'string'
    && typeof result.created === 'boolean'
  ) {
    return { kind: 'saved', groupId: result.group_id, created: result.created }
  }
  if (
    result.result === 'not_found'
    || result.result === 'conflict'
    || result.result === 'invalid_name'
    || result.result === 'invalid_permissions'
  ) {
    return { kind: result.result }
  }
  throw new Error('Invalid access-control group save result')
}

function parseDeleteGroupResult(value: unknown): DeleteGroupResult {
  const result = resultRecord(value)
  if (
    result.result === 'deleted'
    && typeof result.group_id === 'string'
    && typeof result.reassigned_user_count === 'number'
  ) {
    return {
      kind: 'deleted',
      groupId: result.group_id,
      reassignedUserCount: result.reassigned_user_count,
    }
  }
  if (result.result === 'group_has_users' && typeof result.member_count === 'number') {
    return { kind: 'group_has_users', memberCount: result.member_count }
  }
  if (
    result.result === 'not_found'
    || result.result === 'destination_not_found'
    || result.result === 'invalid_reassignment'
  ) {
    return { kind: result.result }
  }
  throw new Error('Invalid access-control group deletion result')
}

function parseSetUserAccessResult(value: unknown): SetUserAccessResult {
  const result = resultRecord(value)
  if (
    result.result === 'saved'
    && typeof result.target_user_id === 'string'
    && typeof result.is_admin === 'boolean'
    && (result.group_id === null || typeof result.group_id === 'string')
  ) {
    return {
      kind: 'saved',
      userId: result.target_user_id,
      isAdmin: result.is_admin,
      groupId: result.group_id,
    }
  }
  if (
    result.result === 'not_found'
    || result.result === 'self_lockout'
    || result.result === 'protected_admin'
    || result.result === 'group_not_found'
    || result.result === 'invalid_access'
  ) {
    return { kind: result.result }
  }
  throw new Error('Invalid access-control user mutation result')
}

export function createAccessControlRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): AccessControlRepository {
  return {
    isApplicationAdmin(actorId) {
      return isApplicationAdmin(supabase, actorId)
    },

    async getAuthorizationContext(actorId) {
      const { data, error } = await supabase.rpc('backend_get_authorization_context' as never, {
        p_actor_id: actorId,
      } as never)
      throwRpcError(error)
      return (asRecord(data) ?? {}) as AuthorizationContextRow
    },

    async listPermissionDefinitions(actorId) {
      const { data, error } = await supabase.rpc('backend_list_permission_definitions' as never, {
        p_actor_id: actorId,
      } as never)
      throwRpcError(error)
      return (Array.isArray(data) ? data : []) as AccessPermissionDefinitionRow[]
    },

    async listGroups(actorId) {
      const { data, error } = await supabase.rpc('backend_list_access_groups' as never, {
        p_actor_id: actorId,
      } as never)
      throwRpcError(error)
      return (Array.isArray(data) ? data : []) as AccessGroupRow[]
    },

    async searchUsers(actorId, input) {
      const { data, error } = await supabase.rpc('backend_search_access_users' as never, {
        p_actor_id: actorId,
        p_query: input.query ?? null,
        p_limit: input.limit,
        p_offset: input.offset,
      } as never)
      throwRpcError(error)
      return (Array.isArray(data) ? data : []) as AccessUserRow[]
    },

    async saveGroup(actorId, input) {
      const { data, error } = await supabase.rpc('backend_upsert_access_group' as never, {
        p_actor_id: actorId,
        p_group_id: input.groupId ?? null,
        p_name: input.name,
        p_description: input.description ?? null,
        p_permission_keys: input.permissionKeys,
      } as never)
      throwRpcError(error)
      return parseSaveGroupResult(data)
    },

    async deleteGroup(actorId, groupId, reassignToGroupId) {
      const { data, error } = await supabase.rpc('backend_delete_access_group' as never, {
        p_actor_id: actorId,
        p_group_id: groupId,
        p_reassign_to_group_id: reassignToGroupId ?? null,
      } as never)
      throwRpcError(error)
      return parseDeleteGroupResult(data)
    },

    async setUserAccess(actorId, input) {
      const { data, error } = await supabase.rpc('backend_set_user_access' as never, {
        p_actor_id: actorId,
        p_target_user_id: input.targetUserId,
        p_is_admin: input.isAdmin,
        p_group_id: input.groupId ?? null,
      } as never)
      throwRpcError(error)
      return parseSetUserAccessResult(data)
    },
  }
}
