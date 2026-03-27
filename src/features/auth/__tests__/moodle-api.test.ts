import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authenticateMoodleUser,
  invokeMoodleFunctionWithTimeout,
} from '@/features/auth/infrastructure/moodle-api';

const invokeMock = vi.fn();
const getSessionMock = vi.fn();
const refreshSessionMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
      refreshSession: (...args: unknown[]) => refreshSessionMock(...args),
    },
  },
}));

describe('moodle-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);

    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'edge-token',
        },
      },
    });
    refreshSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'refreshed-edge-token',
        },
      },
      error: null,
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('authenticates and normalizes the Moodle URL once', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        user: { id: 'u-1', full_name: 'Julio Tutor', moodle_user_id: '10' },
        moodleToken: 'token-1',
        moodleUserId: 10,
      },
      error: null,
    });

    const result = await authenticateMoodleUser({
      username: 'julio',
      password: 'secret',
      moodleUrl: 'https://moodle.local/',
    });

    expect(invokeMock).toHaveBeenCalledWith('moodle-auth', {
      body: {
        moodleUrl: 'https://moodle.local',
        username: 'julio',
        password: 'secret',
        service: 'moodle_mobile_app',
      },
    });
    expect(result).toMatchObject({
      success: true,
      user: { id: 'u-1' },
      moodleSession: {
        moodleUrl: 'https://moodle.local',
        moodleToken: 'token-1',
        moodleUserId: 10,
      },
      offlineMode: false,
    });
  });

  it('calls edge functions with timeout-aware auth headers', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ activitiesCount: 3 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await invokeMoodleFunctionWithTimeout({
      functionName: 'moodle-sync-activities',
      body: { courseId: 42 },
      timeoutMs: 1000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/moodle-sync-activities$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          apikey: 'test-anon-key',
          Authorization: 'Bearer edge-token',
        }),
        body: JSON.stringify({ courseId: 42 }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result).toEqual({
      data: { activitiesCount: 3 },
      error: null,
    });
  });

  it('returns a friendly error when there is no valid Supabase session', async () => {
    getSessionMock.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    refreshSessionMock.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    const result = await invokeMoodleFunctionWithTimeout({
      functionName: 'moodle-grade-suggestions',
      body: { courseId: 42 },
      timeoutMs: 1000,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: null,
      error: { message: 'Sessao expirada. Faca login novamente.' },
    });
  });

  it('refreshes the session and retries when the first edge call returns invalid JWT', async () => {
    getSessionMock.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'stale-edge-token',
        },
      },
      error: null,
    });
    refreshSessionMock.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'fresh-edge-token',
        },
      },
      error: null,
    });

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Invalid JWT' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    const result = await invokeMoodleFunctionWithTimeout({
      functionName: 'moodle-grade-suggestions',
      body: { courseId: 42 },
      timeoutMs: 1000,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/moodle-grade-suggestions$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer stale-edge-token',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/moodle-grade-suggestions$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-edge-token',
        }),
      }),
    );
    expect(result).toEqual({
      data: { ok: true },
      error: null,
    });
    expect(refreshSessionMock).toHaveBeenCalled();
  });
});
