import { ApiError } from '../_shared/http/mod.ts'
import {
  ACCESS_CONTROL_CONTRACT_VERSION,
  type AccessCollectionDto,
  type AccessGroupDeletionDto,
  type AccessGroupDto,
  type AccessGroupMutationDto,
  type AccessPermissionDefinitionDto,
  type AccessUserMutationDto,
  type AccessUserPageDto,
  type AuthorizationContextDto,
} from './contract.ts'
import { mapAccessGroup, mapAccessUser, mapAuthorizationContext, mapPermissionDefinition } from './mapper.ts'
import type { AccessControlPayload } from './payload.ts'
import type { AccessControlRepository } from './repository.ts'

export function authorizeAccessControl(
  repository: AccessControlRepository,
  actorId: string,
  payload: AccessControlPayload,
): boolean | Promise<boolean> {
  return payload.action === 'get_context' || repository.isApplicationAdmin(actorId)
}

export async function executeAccessControl(
  repository: AccessControlRepository,
  actorId: string,
  payload: AccessControlPayload,
): Promise<
  | AuthorizationContextDto
  | AccessCollectionDto<AccessPermissionDefinitionDto>
  | AccessCollectionDto<AccessGroupDto>
  | AccessUserPageDto
  | AccessGroupMutationDto
  | AccessGroupDeletionDto
  | AccessUserMutationDto
> {
  if (payload.action === 'get_context') {
    return mapAuthorizationContext(await repository.getAuthorizationContext(actorId))
  }

  if (payload.action === 'list_permission_definitions') {
    return {
      contractVersion: ACCESS_CONTROL_CONTRACT_VERSION,
      items: (await repository.listPermissionDefinitions(actorId)).map(mapPermissionDefinition),
    }
  }

  if (payload.action === 'list_groups') {
    return {
      contractVersion: ACCESS_CONTROL_CONTRACT_VERSION,
      items: (await repository.listGroups(actorId)).map(mapAccessGroup),
    }
  }

  if (payload.action === 'search_users') {
    const rows = await repository.searchUsers(actorId, {
      query: payload.query,
      limit: payload.pageSize,
      offset: (payload.page - 1) * payload.pageSize,
    })
    const totalCount = Number(rows[0]?.total_count) || 0
    return {
      contractVersion: ACCESS_CONTROL_CONTRACT_VERSION,
      items: rows.map(mapAccessUser),
      page: payload.page,
      pageSize: payload.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / payload.pageSize)),
    }
  }

  if (payload.action === 'upsert_group') {
    const result = await repository.saveGroup(actorId, {
      groupId: payload.groupId,
      name: payload.name,
      description: payload.description,
      permissionKeys: payload.permissionKeys,
    })
    if (result.kind === 'not_found') throw ApiError.notFound('Access group not found.')
    if (result.kind === 'conflict') throw ApiError.conflict('An access group with this name already exists.')
    if (result.kind === 'invalid_name') throw ApiError.unprocessable('Invalid access group name.')
    if (result.kind === 'invalid_permissions') throw ApiError.unprocessable('One or more permissions are invalid.')
    return {
      contractVersion: ACCESS_CONTROL_CONTRACT_VERSION,
      groupId: result.groupId,
      created: result.created,
    }
  }

  if (payload.action === 'delete_group') {
    const result = await repository.deleteGroup(actorId, payload.groupId, payload.reassignToGroupId)
    if (result.kind === 'not_found') throw ApiError.notFound('Access group not found.')
    if (result.kind === 'destination_not_found') throw ApiError.unprocessable('Reassignment group not found.')
    if (result.kind === 'invalid_reassignment') throw ApiError.unprocessable('Invalid group reassignment.')
    if (result.kind === 'group_has_users') {
      throw ApiError.conflict('Access group has active users.', { memberCount: result.memberCount })
    }
    return {
      contractVersion: ACCESS_CONTROL_CONTRACT_VERSION,
      groupId: result.groupId,
      reassignedUserCount: result.reassignedUserCount,
    }
  }

  const result = await repository.setUserAccess(actorId, {
    targetUserId: payload.targetUserId,
    isAdmin: payload.isAdmin,
    groupId: payload.groupId,
  })
  if (result.kind === 'not_found') throw ApiError.notFound('User not found.')
  if (result.kind === 'self_lockout') throw ApiError.conflict('You cannot remove your own administrator access.')
  if (result.kind === 'protected_admin') throw ApiError.conflict('This protected administrator cannot be demoted.')
  if (result.kind === 'group_not_found') throw ApiError.unprocessable('Access group not found.')
  if (result.kind === 'invalid_access') throw ApiError.unprocessable('Invalid user access assignment.')
  return {
    contractVersion: ACCESS_CONTROL_CONTRACT_VERSION,
    userId: result.userId,
    isAdmin: result.isAdmin,
    groupId: result.groupId,
  }
}
