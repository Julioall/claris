import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeLegacyMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/integrations/http/edge-function-client')>(),
  invokeLegacyEdgeFunction: invokeLegacyMock,
}));

import { ApiClientError } from '@/integrations/http/edge-function-client';
import {
  authenticateMoodleUser,
  invokeMoodleFunctionWithTimeout,
} from '@/features/auth/infrastructure/moodle-api';

describe('moodle-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('authenticates through the shared transport and normalizes the Moodle URL once', async () => {
    invokeLegacyMock.mockResolvedValueOnce({
      user: { id: 'u-1', full_name: 'Julio Tutor', moodle_user_id: '10' },
      moodleToken: 'token-1',
      moodleUserId: 10,
      session: { access_token: 'access-1', refresh_token: 'refresh-1' },
    });

    const result = await authenticateMoodleUser({
      username: 'julio',
      password: 'secret',
      moodleUrl: 'https://moodle.local/',
    });

    expect(invokeLegacyMock).toHaveBeenCalledWith('moodle-auth', {
      auth: 'none',
      body: {
        moodleUrl: 'https://moodle.local',
        username: 'julio',
        password: 'secret',
        service: 'moodle_mobile_app',
      },
    });
    expect(result).toMatchObject({
      success: true,
      authSession: { accessToken: 'access-1', refreshToken: 'refresh-1' },
      user: { id: 'u-1' },
      moodleSession: {
        moodleUrl: 'https://moodle.local',
        moodleToken: 'token-1',
        moodleUserId: 10,
      },
      offlineMode: false,
    });
  });

  it('delegates authenticated legacy calls and their timeout to the shared transport', async () => {
    invokeLegacyMock.mockResolvedValueOnce({ activitiesCount: 3 });

    const result = await invokeMoodleFunctionWithTimeout({
      functionName: 'moodle-sync-activities',
      body: { courseId: 42 },
      timeoutMs: 1000,
    });

    expect(invokeLegacyMock).toHaveBeenCalledWith('moodle-sync-activities', {
      body: { courseId: 42 },
      timeoutMs: 1000,
    });
    expect(result).toEqual({
      data: { activitiesCount: 3 },
      error: null,
    });
  });

  it('preserves the compatibility error shape for an expired session', async () => {
    invokeLegacyMock.mockRejectedValueOnce(new ApiClientError({
      code: 'session_expired',
      message: 'Sessao expirada. Faca login novamente.',
    }));

    await expect(invokeMoodleFunctionWithTimeout({
      functionName: 'moodle-grade-suggestions',
      body: { courseId: 42 },
      timeoutMs: 1000,
    })).resolves.toEqual({
      data: null,
      error: { message: 'Sessao expirada. Faca login novamente.' },
    });
  });

  it('maps login transport failures to the existing authentication result', async () => {
    invokeLegacyMock.mockRejectedValueOnce(new ApiClientError({
      code: 'network_error',
      message: 'Failed to fetch',
    }));

    await expect(authenticateMoodleUser({
      username: 'julio',
      password: 'secret',
      moodleUrl: 'https://moodle.local',
    })).resolves.toEqual({
      success: false,
      error: 'Nao foi possivel conectar ao Moodle. Verifique a URL informada e se o servidor esta acessivel.',
    });
  });

  it('rejects a malformed legacy login response without leaking transport details', async () => {
    invokeLegacyMock.mockResolvedValueOnce(null);

    await expect(authenticateMoodleUser({
      username: 'julio',
      password: 'secret',
      moodleUrl: 'https://moodle.local',
    })).resolves.toEqual({
      success: false,
      error: 'O servidor retornou uma resposta de autenticacao invalida.',
    });
  });
});
