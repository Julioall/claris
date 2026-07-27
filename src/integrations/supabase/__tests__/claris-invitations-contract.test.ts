import { describe, expect, it, vi } from 'vitest';

import { parseClarisInvitationsPayload } from '../../../../supabase/functions/claris-invitations/payload.ts';
import { normalizeClarisInviteRedirect } from '../../../../supabase/functions/claris-invitations/redirect.ts';
import { executeClarisInvitationAction } from '../../../../supabase/functions/claris-invitations/service.ts';

const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INVITATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('Claris invitation contract', () => {
  it('normalizes an administrator invitation without accepting arbitrary roles', () => {
    expect(parseClarisInvitationsPayload({
      action: 'create',
      appRole: 'tutor',
      email: ' Tutor@Example.com ',
      fullName: '  Tutor   Exemplo ',
    })).toEqual({
      action: 'create',
      appRole: 'tutor',
      email: 'tutor@example.com',
      fullName: 'Tutor Exemplo',
    });

    expect(() => parseClarisInvitationsPayload({
      action: 'create',
      appRole: 'admin',
      email: 'admin@example.com',
      fullName: 'Admin',
    })).toThrowError(expect.objectContaining({ status: 422 }));
  });

  it('accepts only exact management fields', () => {
    expect(parseClarisInvitationsPayload({
      action: 'revoke',
      invitationId: INVITATION_ID,
    })).toEqual({ action: 'revoke', invitationId: INVITATION_ID });
    expect(() => parseClarisInvitationsPayload({
      action: 'provision_account',
      appRole: 'admin',
    })).toThrowError(expect.objectContaining({ status: 422 }));
  });

  it('accepts only the configured HTTPS invitation callback path', () => {
    expect(normalizeClarisInviteRedirect('https://claris.example.test/auth/accept-invite'))
      .toBe('https://claris.example.test/auth/accept-invite');
    expect(() => normalizeClarisInviteRedirect('http://claris.example.test/auth/accept-invite')).toThrow();
    expect(() => normalizeClarisInviteRedirect('https://claris.example.test/reset-password')).toThrow();
    expect(() => normalizeClarisInviteRedirect('https://claris.example.test/auth/accept-invite?next=/')).toThrow();
    expect(() => normalizeClarisInviteRedirect('https://user:pass@claris.example.test/auth/accept-invite')).toThrow();
  });

  it('provisions from the confirmed authenticated email and ignores user metadata roles', async () => {
    const provision = vi.fn(async () => ({
      nextPath: '/onboarding/moodle',
      onboardingRequired: true,
      userId: ACTOR_ID,
    }));
    const repository = {
      create: vi.fn(),
      deletePending: vi.fn(),
      findPending: vi.fn(),
      list: vi.fn(),
      provision,
      revoke: vi.fn(),
    };

    await expect(executeClarisInvitationAction(
      repository as never,
      {} as never,
      { id: ACTOR_ID, email: 'Tutor@Example.com' },
      { action: 'provision_account' },
    )).resolves.toEqual({
      contractVersion: 1,
      nextPath: '/onboarding/moodle',
      onboardingRequired: true,
      userId: ACTOR_ID,
    });
    expect(provision).toHaveBeenCalledWith(ACTOR_ID, 'tutor@example.com');
  });
});
