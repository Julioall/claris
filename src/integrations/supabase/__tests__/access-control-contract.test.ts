import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { mapAuthorizationContext } from '../../../../supabase/functions/access-control/mapper.ts';
import { parseAccessControlPayload } from '../../../../supabase/functions/access-control/payload.ts';
import type {
  AccessControlRepository,
  AccessGroupRow,
  AccessPermissionDefinitionRow,
  AccessUserRow,
} from '../../../../supabase/functions/access-control/repository.ts';
import {
  authorizeAccessControl,
  executeAccessControl,
} from '../../../../supabase/functions/access-control/service.ts';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';

const permissionRow: AccessPermissionDefinitionRow = {
  key: 'students.view',
  category: 'Alunos',
  label: 'Alunos',
  description: null,
  sort_order: 10,
};

const groupRow: AccessGroupRow = {
  id: GROUP_ID,
  slug: 'tutor',
  name: 'Tutor',
  description: null,
  user_count: 3,
  permissions: ['students.view'],
};

const userRow: AccessUserRow = {
  user_id: USER_ID,
  full_name: 'Maria Tutor',
  moodle_username: 'maria',
  email: 'maria@example.com',
  is_admin: false,
  group_id: GROUP_ID,
  group_name: 'Tutor',
  group_slug: 'tutor',
  total_count: 1,
};

function repository(overrides: Partial<AccessControlRepository> = {}): AccessControlRepository {
  return {
    deleteGroup: vi.fn(async () => ({ kind: 'deleted', groupId: GROUP_ID, reassignedUserCount: 0 })),
    getAuthorizationContext: vi.fn(async () => ({
      is_admin: false,
      group_id: GROUP_ID,
      group_name: 'Tutor',
      group_slug: 'tutor',
      permissions: ['students.view'],
    })),
    isApplicationAdmin: vi.fn(async () => true),
    listGroups: vi.fn(async () => [groupRow]),
    listPermissionDefinitions: vi.fn(async () => [permissionRow]),
    saveGroup: vi.fn(async () => ({ kind: 'saved', created: false, groupId: GROUP_ID })),
    searchUsers: vi.fn(async () => [userRow]),
    setUserAccess: vi.fn(async () => ({
      kind: 'saved',
      userId: USER_ID,
      isAdmin: false,
      groupId: GROUP_ID,
    })),
    ...overrides,
  };
}

describe('access-control backend contract', () => {
  it('accepts bounded use-case intents and rejects identity spoofing or raw persistence fields', () => {
    expect(parseAccessControlPayload({ action: 'get_context' })).toEqual({ action: 'get_context' });
    expect(parseAccessControlPayload({
      action: 'search_users',
      query: ' Maria ',
      page: 2,
      pageSize: 20,
    })).toEqual({ action: 'search_users', query: 'Maria', page: 2, pageSize: 20 });

    for (const payload of [
      { action: 'get_context', actorId: ACTOR_ID },
      { action: 'list_groups', userId: ACTOR_ID },
      { action: 'search_users', pageSize: 101 },
      { action: 'upsert_group', name: 'Grupo', permissionKeys: ['invalid key'] },
      { action: 'delete_group', groupId: GROUP_ID, deletedBy: ACTOR_ID },
      { action: 'set_user_access', targetUserId: USER_ID, isAdmin: true, groupId: GROUP_ID },
      { action: 'set_user_access', targetUserId: USER_ID, isAdmin: false, grantedBy: ACTOR_ID },
    ]) {
      expect(() => parseAccessControlPayload(payload)).toThrowError(
        expect.objectContaining({ status: 422 }),
      );
    }
  });

  it('maps authorization data to an explicit versioned DTO', () => {
    expect(mapAuthorizationContext({
      is_admin: true,
      group_id: GROUP_ID,
      group_name: 'Tutor',
      group_slug: 'tutor',
      permissions: ['students.view', 42],
    })).toEqual({
      contractVersion: 1,
      isAdmin: true,
      group: { id: GROUP_ID, name: 'Tutor', slug: 'tutor' },
      permissions: ['students.view'],
    });
  });

  it('derives context from the authenticated actor and reserves admin actions for admins', async () => {
    const accessRepository = repository();
    await executeAccessControl(accessRepository, ACTOR_ID, { action: 'get_context' });
    expect(accessRepository.getAuthorizationContext).toHaveBeenCalledWith(ACTOR_ID);
    expect(authorizeAccessControl(accessRepository, ACTOR_ID, { action: 'get_context' })).toBe(true);

    await expect(authorizeAccessControl(
      repository({ isApplicationAdmin: vi.fn(async () => false) }),
      ACTOR_ID,
      { action: 'list_groups' },
    )).resolves.toBe(false);
  });

  it('delegates role and group changes to one atomic repository operation', async () => {
    const accessRepository = repository();
    const result = await executeAccessControl(accessRepository, ACTOR_ID, {
      action: 'set_user_access',
      targetUserId: USER_ID,
      isAdmin: false,
      groupId: GROUP_ID,
    });

    expect(accessRepository.setUserAccess).toHaveBeenCalledTimes(1);
    expect(accessRepository.setUserAccess).toHaveBeenCalledWith(ACTOR_ID, {
      targetUserId: USER_ID,
      isAdmin: false,
      groupId: GROUP_ID,
    });
    expect(result).toMatchObject({ contractVersion: 1, userId: USER_ID, groupId: GROUP_ID });
  });

  it('surfaces self-lockout and groups with members as conflicts', async () => {
    await expect(executeAccessControl(repository({
      setUserAccess: vi.fn(async () => ({ kind: 'self_lockout' })),
    }), ACTOR_ID, {
      action: 'set_user_access',
      targetUserId: ACTOR_ID,
      isAdmin: false,
    })).rejects.toMatchObject({ status: 409, code: 'conflict' });

    await expect(executeAccessControl(repository({
      deleteGroup: vi.fn(async () => ({ kind: 'group_has_users', memberCount: 3 })),
    }), ACTOR_ID, {
      action: 'delete_group',
      groupId: GROUP_ID,
    })).rejects.toMatchObject({ status: 409, details: { memberCount: 3 } });
  });
});

describe('access-control database boundary', () => {
  const migration = readFileSync(resolve(
    process.cwd(),
    'supabase/migrations/20260721240000_secure_access_control.sql',
  ), 'utf8');

  it('makes access tables and legacy RPCs unavailable to browser roles', () => {
    for (const table of [
      'app_permission_definitions',
      'app_groups',
      'app_group_permissions',
      'user_group_memberships',
      'admin_user_roles',
    ]) {
      expect(migration).toMatch(new RegExp(
        `REVOKE ALL PRIVILEGES ON TABLE public\\.${table}[\\s\\S]*?FROM PUBLIC, anon, authenticated`,
        'i',
      ));
    }

    for (const functionName of [
      'get_current_user_authorization_context',
      'admin_list_permission_definitions',
      'admin_list_groups',
      'admin_search_users',
      'admin_upsert_group',
      'admin_delete_group',
      'admin_set_user_group',
      'admin_set_user_admin',
    ]) {
      expect(migration).toMatch(new RegExp(
        `REVOKE EXECUTE ON FUNCTION public\\.${functionName}`,
        'i',
      ));
    }
  });

  it('uses explicit actors, immutable audit and an atomic self-lockout guard', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.app_access_audit_log/i);
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON public\.app_access_audit_log/i);
    expect(migration).toMatch(/backend_set_user_access\([\s\S]*p_actor_id UUID[\s\S]*p_target_user_id UUID/i);
    expect(migration).toMatch(/p_actor_id = p_target_user_id AND NOT p_is_admin/i);
    expect(migration).toMatch(/INSERT INTO public\.app_access_audit_log[\s\S]*'user_access_updated'/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.backend_set_user_access[\s\S]*TO service_role/i);
  });
});
