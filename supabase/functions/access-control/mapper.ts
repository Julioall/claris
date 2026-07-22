import {
  ACCESS_CONTROL_CONTRACT_VERSION,
  type AccessGroupDto,
  type AccessPermissionDefinitionDto,
  type AccessUserDto,
  type AuthorizationContextDto,
} from './contract.ts'
import type {
  AccessGroupRow,
  AccessPermissionDefinitionRow,
  AccessUserRow,
  AuthorizationContextRow,
} from './repository.ts'

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export function mapAuthorizationContext(row: AuthorizationContextRow): AuthorizationContextDto {
  const hasGroup = typeof row.group_id === 'string'
    && typeof row.group_name === 'string'
    && typeof row.group_slug === 'string'
  return {
    contractVersion: ACCESS_CONTROL_CONTRACT_VERSION,
    isAdmin: row.is_admin === true,
    group: hasGroup
      ? { id: row.group_id as string, name: row.group_name as string, slug: row.group_slug as string }
      : null,
    permissions: stringArray(row.permissions),
  }
}

export function mapPermissionDefinition(
  row: AccessPermissionDefinitionRow,
): AccessPermissionDefinitionDto {
  return {
    key: row.key,
    category: row.category,
    label: row.label,
    description: row.description,
    sortOrder: Number(row.sort_order) || 0,
  }
}

export function mapAccessGroup(row: AccessGroupRow): AccessGroupDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    userCount: Number(row.user_count) || 0,
    permissions: stringArray(row.permissions),
  }
}

export function mapAccessUser(row: AccessUserRow): AccessUserDto {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    isAdmin: row.is_admin === true,
    groupId: row.group_id,
    groupName: row.group_name,
    groupSlug: row.group_slug,
  }
}
