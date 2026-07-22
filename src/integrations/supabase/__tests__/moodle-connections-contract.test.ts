import { describe, expect, it, vi } from 'vitest';

import { parseMoodleConnectionsPayload } from '../../../../supabase/functions/moodle-connections/payload.ts';
import type {
  MoodleConnectionRecord,
  MoodleConnectionsRepository,
  MoodleSiteRecord,
} from '../../../../supabase/functions/moodle-connections/repository.ts';
import {
  executeMoodleConnectionsAction,
  listMoodleConnections,
  listMoodleSites,
} from '../../../../supabase/functions/moodle-connections/service.ts';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FIEG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SENAI_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONNECTION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function site(overrides: Partial<MoodleSiteRecord> = {}): MoodleSiteRecord {
  return {
    base_url: 'https://ead.fieg.com.br',
    created_at: '2026-07-21T10:00:00.000Z',
    id: FIEG_ID,
    limits: {},
    name: 'FIEG Moodle',
    release: '5.1.2',
    service: 'moodle_mobile_app',
    slug: 'fieg',
    status: 'approved',
    updated_at: '2026-07-21T10:00:00.000Z',
    version: '2025100602',
    ...overrides,
  };
}

function connection(overrides: Partial<MoodleConnectionRecord> = {}): MoodleConnectionRecord {
  return {
    alias: 'FIEG principal',
    can_write: false,
    capabilities: { functions: ['core_webservice_get_site_info'] },
    created_at: '2026-07-21T10:00:00.000Z',
    credential_ciphertext: 'v1:not-exposed',
    id: CONNECTION_ID,
    last_error: null,
    last_reauth_at: '2026-07-21T10:00:00.000Z',
    last_token_issued_at: '2026-07-21T10:00:00.000Z',
    moodle_avatar_url: 'https://ead.fieg.com.br/avatar.jpg',
    moodle_email: 'private@example.test',
    moodle_full_name: 'Private Name',
    moodle_site_id: FIEG_ID,
    moodle_user_id: '42',
    moodle_username: '04112637225',
    reauth_enabled: true,
    status: 'active',
    updated_at: '2026-07-21T10:00:00.000Z',
    user_id: USER_ID,
    ...overrides,
  };
}

function repository(overrides: Partial<MoodleConnectionsRepository> = {}): MoodleConnectionsRepository {
  const fieg = site();
  const current = connection();
  return {
    beginDisconnect: vi.fn(async () => connection({ status: 'disconnecting' })),
    cancelConnectionJobs: vi.fn(async () => 0),
    createConnection: vi.fn(async (input) => connection({
      alias: input.alias,
      credential_ciphertext: input.credentialCiphertext,
      moodle_site_id: input.moodleSiteId,
      moodle_user_id: input.moodleUserId,
      moodle_username: input.moodleUsername,
    })),
    disableReauth: vi.fn(async () => connection({
      credential_ciphertext: null,
      reauth_enabled: false,
      status: 'reauth_required',
    })),
    finalizeDisconnect: vi.fn(async () => connection({
      credential_ciphertext: null,
      reauth_enabled: false,
      status: 'disabled',
    })),
    findApprovedSite: vi.fn(async (siteId) => siteId === FIEG_ID ? fieg : null),
    findOwnedConnection: vi.fn(async (_userId, id) => id === CONNECTION_ID ? current : null),
    findSite: vi.fn(async (siteId) => siteId === FIEG_ID ? fieg : null),
    listApprovedSites: vi.fn(async () => [fieg]),
    listOwnedConnections: vi.fn(async () => [current]),
    updateAlias: vi.fn(async (_userId, _connectionId, alias) => connection({ alias })),
    updateReauth: vi.fn(async (input) => connection({
      credential_ciphertext: input.credentialCiphertext,
      moodle_username: input.moodleUsername,
    })),
    updateSiteObservation: vi.fn(async () => undefined),
    ...overrides,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    encryptPassword: vi.fn(async () => 'v1:encrypted'),
    getSiteInfo: vi.fn(async () => ({
      email: 'moodle@example.test',
      firstname: 'Tutor',
      fullname: 'Tutor Moodle',
      functions: [{ name: 'core_webservice_get_site_info' }],
      id: 42,
      lastname: 'Moodle',
      release: '5.1.2',
      userid: 42,
      username: 'teacher',
      version: '2025100602',
    })),
    getToken: vi.fn(async () => ({ token: 'secret-token' })),
    now: () => new Date('2026-07-21T12:00:00.000Z'),
    ...overrides,
  } as never;
}

describe('moodle-connections payload', () => {
  it('accepts only an approved-site identifier and ephemeral credentials for creation', () => {
    expect(parseMoodleConnectionsPayload({
      action: 'create_connection',
      alias: '  SENAI   trabalho ',
      canWrite: false,
      moodlePassword: 'temporary-password',
      moodleUsername: ' teacher ',
      siteId: SENAI_ID,
    })).toEqual({
      action: 'create_connection',
      alias: 'SENAI trabalho',
      canWrite: false,
      moodlePassword: 'temporary-password',
      moodleUsername: 'teacher',
      siteId: SENAI_ID,
    });
  });

  it.each([
    { action: 'create_connection', alias: 'x', canWrite: true, moodlePassword: 'p', moodleUsername: 'u', siteId: FIEG_ID },
    { action: 'create_connection', alias: 'x', canWrite: false, moodlePassword: 'p', moodleUsername: 'u', siteId: FIEG_ID, moodleUrl: 'https://attacker.test' },
    { action: 'create_connection', alias: 'x', canWrite: false, moodlePassword: 'p', moodleUsername: 'u', siteId: FIEG_ID, token: 'spoofed' },
    { action: 'update_reauth', connectionId: CONNECTION_ID, enabled: true },
    { action: 'update_reauth', connectionId: CONNECTION_ID, enabled: false, moodlePassword: 'p', moodleUsername: 'u' },
    { action: 'disconnect', connectionId: CONNECTION_ID, userId: USER_ID },
  ])('rejects write enablement, browser routing and identity fields: %o', (payload) => {
    expect(() => parseMoodleConnectionsPayload(payload)).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });
});

describe('moodle-connections service', () => {
  it('returns a sanitized approved-site registry', async () => {
    const result = await listMoodleSites(repository());
    expect(result).toEqual({
      contractVersion: 2,
      sites: [{ id: FIEG_ID, name: 'FIEG Moodle', slug: 'fieg' }],
    });
    expect(JSON.stringify(result)).not.toContain('base_url');
    expect(JSON.stringify(result)).not.toContain('service');
  });

  it('returns owned connections without credentials, email, external id or full username', async () => {
    const result = await listMoodleConnections(repository(), USER_ID);
    expect(result.connections).toEqual([expect.objectContaining({
      alias: 'FIEG principal',
      canWrite: false,
      id: CONNECTION_ID,
      site: { id: FIEG_ID, name: 'FIEG Moodle', slug: 'fieg' },
      usernameMasked: '0********5',
    })]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('v1:not-exposed');
    expect(serialized).not.toContain('private@example.test');
    expect(serialized).not.toContain('04112637225');
    expect(serialized).not.toContain('moodle_user_id');
  });

  it('resolves the Moodle host and service exclusively from the selected registry row', async () => {
    const deps = dependencies();
    const repo = repository();
    const payload = parseMoodleConnectionsPayload({
      action: 'create_connection',
      alias: 'FIEG',
      canWrite: false,
      moodlePassword: 'password',
      moodleUsername: 'teacher',
      siteId: FIEG_ID,
    });

    const result = await executeMoodleConnectionsAction(repo, USER_ID, payload, deps);

    expect(deps.getToken).toHaveBeenCalledWith(
      'https://ead.fieg.com.br',
      'teacher',
      'password',
      'moodle_mobile_app',
    );
    expect(deps.getSiteInfo).toHaveBeenCalledWith('https://ead.fieg.com.br', 'secret-token');
    expect(result).toMatchObject({ contractVersion: 2, connection: { canWrite: false } });
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(JSON.stringify(result)).not.toContain('password');
  });

  it('does not send credentials when the selected registry site is absent or disabled', async () => {
    const deps = dependencies();
    const repo = repository({ findApprovedSite: vi.fn(async () => null) });

    await expect(executeMoodleConnectionsAction(repo, USER_ID, {
      action: 'create_connection',
      alias: 'Unavailable',
      canWrite: false,
      moodlePassword: 'password',
      moodleUsername: 'teacher',
      siteId: SENAI_ID,
    }, deps)).rejects.toMatchObject({ code: 'moodle_site_disabled', status: 422 });
    expect(deps.getToken).not.toHaveBeenCalled();
    expect(repo.createConnection).not.toHaveBeenCalled();
  });

  it('does not reauthorize a connection with credentials from another external account', async () => {
    const repo = repository();
    const deps = dependencies({
      getSiteInfo: vi.fn(async () => ({
        email: '', firstname: '', fullname: '', id: 99, lastname: '', userid: 99, username: 'other',
      })),
    });

    await expect(executeMoodleConnectionsAction(repo, USER_ID, {
      action: 'update_reauth',
      connectionId: CONNECTION_ID,
      enabled: true,
      moodlePassword: 'password',
      moodleUsername: 'other',
    }, deps)).rejects.toMatchObject({ code: 'conflict', status: 409 });
    expect(repo.updateReauth).not.toHaveBeenCalled();
  });

  it('finalizes disconnect only when no leased item is still processing', async () => {
    const repo = repository({ cancelConnectionJobs: vi.fn(async () => 0) });
    const result = await executeMoodleConnectionsAction(repo, USER_ID, {
      action: 'disconnect', connectionId: CONNECTION_ID,
    }, dependencies());

    expect(repo.beginDisconnect).toHaveBeenCalledWith(USER_ID, CONNECTION_ID);
    expect(repo.finalizeDisconnect).toHaveBeenCalledWith(USER_ID, CONNECTION_ID);
    expect(result).toMatchObject({ pendingLeases: 0, connection: { status: 'disabled' } });
  });

  it('keeps disconnecting state and the credential while an existing lease drains', async () => {
    const repo = repository({ cancelConnectionJobs: vi.fn(async () => 2) });
    const result = await executeMoodleConnectionsAction(repo, USER_ID, {
      action: 'disconnect', connectionId: CONNECTION_ID,
    }, dependencies());

    expect(repo.finalizeDisconnect).not.toHaveBeenCalled();
    expect(result).toMatchObject({ pendingLeases: 2, connection: { status: 'disconnecting' } });
  });

  it('treats repeated disconnect of an already disabled connection as idempotent', async () => {
    const disabled = connection({
      credential_ciphertext: null,
      reauth_enabled: false,
      status: 'disabled',
    });
    const repo = repository({ findOwnedConnection: vi.fn(async () => disabled) });

    const result = await executeMoodleConnectionsAction(repo, USER_ID, {
      action: 'disconnect', connectionId: CONNECTION_ID,
    }, dependencies());

    expect(repo.beginDisconnect).not.toHaveBeenCalled();
    expect(repo.cancelConnectionJobs).not.toHaveBeenCalled();
    expect(result).toMatchObject({ pendingLeases: 0, connection: { status: 'disabled' } });
  });
});
