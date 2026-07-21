import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';
import type {
  AccessCollectionDto,
  AccessGroupDeletionDto,
  AccessGroupDto,
  AccessGroupMutationDto,
  AccessPermissionDefinitionDto,
  AccessUserDto,
  AccessUserMutationDto,
  AccessUserPageDto,
} from './contracts/access-control.contract';

export type AdminPermissionDefinition = AccessPermissionDefinitionDto;
export type AdminAccessGroup = AccessGroupDto;
export type AdminUserAccess = AccessUserDto;

export interface AdminUserSearchResult {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  users: AdminUserAccess[];
}

interface UpsertAccessGroupInput {
  groupId?: string;
  name: string;
  description?: string;
  permissionKeys: string[];
}

interface SearchAdminUsersInput {
  page?: number;
  pageSize?: number;
  query?: string;
}

interface SetUserAccessInput {
  groupId?: string | null;
  isAdmin: boolean;
  targetUserId: string;
}

export async function listPermissionDefinitions(): Promise<AdminPermissionDefinition[]> {
  const result = await invokeEdgeFunction<AccessCollectionDto<AccessPermissionDefinitionDto>>(
    'access-control',
    { body: { action: 'list_permission_definitions' } },
  );
  return result.items;
}

export async function listAccessGroups(): Promise<AdminAccessGroup[]> {
  const result = await invokeEdgeFunction<AccessCollectionDto<AccessGroupDto>>('access-control', {
    body: { action: 'list_groups' },
  });
  return result.items;
}

export async function searchAdminUsers({
  query,
  page = 1,
  pageSize = 25,
}: SearchAdminUsersInput = {}): Promise<AdminUserSearchResult> {
  const result = await invokeEdgeFunction<AccessUserPageDto>('access-control', {
    body: {
      action: 'search_users',
      page,
      pageSize,
      ...(query?.trim() ? { query: query.trim() } : {}),
    },
  });

  return {
    users: result.items,
    page: result.page,
    pageSize: result.pageSize,
    totalCount: result.totalCount,
    totalPages: result.totalPages,
  };
}

export function upsertAccessGroup(input: UpsertAccessGroupInput) {
  const description = input.description?.trim();
  return invokeEdgeFunction<AccessGroupMutationDto>('access-control', {
    body: {
      action: 'upsert_group',
      name: input.name.trim(),
      permissionKeys: input.permissionKeys,
      ...(input.groupId ? { groupId: input.groupId } : {}),
      ...(description ? { description } : {}),
    },
  });
}

export function deleteAccessGroup(groupId: string, reassignToGroupId?: string | null) {
  return invokeEdgeFunction<AccessGroupDeletionDto>('access-control', {
    body: {
      action: 'delete_group',
      groupId,
      ...(reassignToGroupId ? { reassignToGroupId } : {}),
    },
  });
}

export function setUserAccess(input: SetUserAccessInput) {
  return invokeEdgeFunction<AccessUserMutationDto>('access-control', {
    body: {
      action: 'set_user_access',
      targetUserId: input.targetUserId,
      isAdmin: input.isAdmin,
      groupId: input.isAdmin ? null : input.groupId ?? null,
    },
  });
}
