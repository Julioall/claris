import { describe, expect, it, vi } from 'vitest';

import { resolveMoodleAccess } from '../../../../supabase/functions/_shared/domain/moodle-connections/access.ts';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONNECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SITE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function createClient(siteUrl: string, ownerId = USER_ID) {
  const updates: Array<Record<string, unknown>> = [];
  const connection = {
    id: CONNECTION_ID,
    user_id: ownerId,
    moodle_site_id: SITE_ID,
    moodle_user_id: '42',
    moodle_username: 'tutor',
    credential_ciphertext: 'ciphertext',
    reauth_enabled: true,
    status: 'active',
  };
  const site = {
    id: SITE_ID,
    slug: siteUrl.includes('senai') ? 'senai' : 'fieg',
    base_url: siteUrl,
    service: 'moodle_mobile_app',
    status: 'approved',
  };

  const from = vi.fn((table: string) => {
    const result = table === 'user_moodle_connections'
      ? (ownerId === USER_ID ? connection : null)
      : site;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: result, error: null });
    chain.update = (payload: Record<string, unknown>) => {
      updates.push(payload);
      return chain;
    };
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
    return chain;
  });

  return { client: { from } as never, updates };
}

describe('Moodle connection access isolation', () => {
  it.each([
    ['https://ead.fieg.com.br', 'fieg'],
    ['https://ead.senai.br', 'senai'],
  ])('resolves credentials only against the registered %s host', async (siteUrl, siteSlug) => {
    const { client, updates } = createClient(siteUrl);
    const getToken = vi.fn(async () => ({ token: 'server-token' }));

    const access = await resolveMoodleAccess(client, USER_ID, CONNECTION_ID, {
      decrypt: vi.fn(async () => ({ password: 'secret' })),
      getToken,
      now: () => new Date('2026-07-21T20:00:00.000Z'),
    });

    expect(getToken).toHaveBeenCalledWith(siteUrl, 'tutor', 'secret', 'moodle_mobile_app');
    expect(access).toMatchObject({
      connectionId: CONNECTION_ID,
      moodleSiteId: SITE_ID,
      moodleUrl: siteUrl,
      siteSlug,
      token: 'server-token',
      userId: USER_ID,
    });
    expect(updates).toContainEqual(expect.objectContaining({
      last_error: null,
      status: 'active',
    }));
  });

  it('does not expose a connection owned by another Claris account', async () => {
    const { client } = createClient('https://ead.fieg.com.br', 'other-user');
    const getToken = vi.fn();

    await expect(resolveMoodleAccess(client, USER_ID, CONNECTION_ID, {
      decrypt: vi.fn(),
      getToken,
      now: () => new Date(),
    })).rejects.toMatchObject({ code: 'connection_not_found' });
    expect(getToken).not.toHaveBeenCalled();
  });
});
