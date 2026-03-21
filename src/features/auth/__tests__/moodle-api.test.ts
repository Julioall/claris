import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authenticateMoodleUser,
  invokeMoodleFunctionWithTimeout,
} from '@/features/auth/infrastructure/moodle-api';

const invokeMock = vi.fn();
const getSessionMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
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
});
