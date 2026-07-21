import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: invokeMock,
}));

import {
  deleteAccessGroup,
  listAccessGroups,
  listPermissionDefinitions,
  searchAdminUsers,
  setUserAccess,
  upsertAccessGroup,
} from '../access';

describe('access-control HTTP adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockImplementation(async (_functionName: string, options: { body: { action: string } }) => {
      if (options.body.action === 'search_users') {
        return {
          contractVersion: 1,
          items: [],
          page: 2,
          pageSize: 20,
          totalCount: 21,
          totalPages: 2,
        };
      }
      if (options.body.action === 'list_permission_definitions' || options.body.action === 'list_groups') {
        return { contractVersion: 1, items: [] };
      }
      return { contractVersion: 1 };
    });
  });

  it('exposes administrative collections as typed values instead of database responses', async () => {
    await expect(listPermissionDefinitions()).resolves.toEqual([]);
    await expect(listAccessGroups()).resolves.toEqual([]);
    expect(invokeMock.mock.calls.map(([, options]) => options.body.action)).toEqual([
      'list_permission_definitions',
      'list_groups',
    ]);
  });

  it('sends bounded search intent and maps the backend page', async () => {
    await expect(searchAdminUsers({ query: ' Maria ', page: 2, pageSize: 20 })).resolves.toEqual({
      users: [],
      page: 2,
      pageSize: 20,
      totalCount: 21,
      totalPages: 2,
    });
    expect(invokeMock).toHaveBeenCalledWith('access-control', {
      body: { action: 'search_users', query: 'Maria', page: 2, pageSize: 20 },
    });
  });

  it('updates a user role and group with one atomic backend command', async () => {
    await setUserAccess({
      targetUserId: '22222222-2222-4222-8222-222222222222',
      isAdmin: false,
      groupId: '33333333-3333-4333-8333-333333333333',
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('access-control', {
      body: {
        action: 'set_user_access',
        targetUserId: '22222222-2222-4222-8222-222222222222',
        isAdmin: false,
        groupId: '33333333-3333-4333-8333-333333333333',
      },
    });
    expect(JSON.stringify(invokeMock.mock.calls[0])).not.toMatch(/actor|grantedBy|updatedAt/i);
  });

  it('sends only group management intent', async () => {
    await upsertAccessGroup({
      name: ' Tutores ',
      description: ' Operacao ',
      permissionKeys: ['students.view'],
    });
    await deleteAccessGroup(
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    );

    expect(invokeMock.mock.calls.map(([, options]) => options.body)).toEqual([
      {
        action: 'upsert_group',
        name: 'Tutores',
        description: 'Operacao',
        permissionKeys: ['students.view'],
      },
      {
        action: 'delete_group',
        groupId: '33333333-3333-4333-8333-333333333333',
        reassignToGroupId: '44444444-4444-4444-8444-444444444444',
      },
    ]);
  });
});
