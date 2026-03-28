import { supabase } from '@/integrations/supabase/client';

export interface AdminPermissionDefinition {
  key: string;
  category: string;
  label: string;
  description: string | null;
  sort_order: number;
}

export interface AdminAccessGroup {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  user_count: number;
  permissions: string[];
}

export interface AdminUserAccess {
  user_id: string;
  full_name: string;
  moodle_username: string;
  email: string | null;
  is_admin: boolean;
  group_id: string | null;
  group_name: string | null;
  group_slug: string | null;
  total_count: number;
}

export interface AdminUserSearchResult {
  users: AdminUserAccess[];
  totalCount: number;
}

interface UpsertAccessGroupInput {
  groupId?: string;
  name: string;
  description?: string;
  permissionKeys: string[];
}

interface SearchAdminUsersInput {
  query?: string;
  limit?: number;
  offset?: number;
}

export async function listPermissionDefinitions() {
  return supabase.rpc('admin_list_permission_definitions' as never);
}

export async function listAccessGroups() {
  return supabase.rpc('admin_list_groups' as never);
}

export async function searchAdminUsers({
  query,
  limit = 25,
  offset = 0,
}: SearchAdminUsersInput = {}): Promise<AdminUserSearchResult> {
  const { data, error } = await supabase.rpc('admin_search_users' as never, {
    p_query: query?.trim() || null,
    p_limit: limit,
    p_offset: offset,
  } as never);

  if (error) throw error;

  const users = ((data ?? []) as AdminUserAccess[]).map((user) => ({
    ...user,
    total_count: Number(user.total_count || 0),
  }));

  return {
    users,
    totalCount: users[0]?.total_count ?? 0,
  };
}

export async function upsertAccessGroup(input: UpsertAccessGroupInput) {
  return supabase.rpc('admin_upsert_group' as never, {
    p_group_id: input.groupId ?? null,
    p_name: input.name,
    p_description: input.description?.trim() || null,
    p_permission_keys: input.permissionKeys,
  } as never);
}

export async function deleteAccessGroup(groupId: string, reassignToGroupId?: string | null) {
  return supabase.rpc('admin_delete_group' as never, {
    p_group_id: groupId,
    p_reassign_to_group_id: reassignToGroupId ?? null,
  } as never);
}

export async function setUserAccessGroup(userId: string, groupId?: string | null) {
  return supabase.rpc('admin_set_user_group' as never, {
    p_target_user_id: userId,
    p_group_id: groupId ?? null,
  } as never);
}

export async function setUserAdminAccess(userId: string, isAdmin: boolean) {
  return supabase.rpc('admin_set_user_admin' as never, {
    p_target_user_id: userId,
    p_is_admin: isAdmin,
  } as never);
}
