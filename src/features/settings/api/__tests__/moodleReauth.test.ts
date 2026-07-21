import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: invokeMock,
}));

import {
  fetchMoodleReauthSettings,
  updateMoodleReauthSettings,
} from '../moodleReauth';

describe('moodleReauth API client', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps the read DTO without sending the caller user ID', async () => {
    invokeMock.mockResolvedValue({
      credentialActive: true,
      lastError: null,
      lastReauthAt: '2026-07-21T13:00:00.000Z',
      preferenceEnabled: true,
    });

    await expect(fetchMoodleReauthSettings('browser-controlled-user-id')).resolves.toEqual({
      credentialActive: true,
      lastError: null,
      lastReauthAt: '2026-07-21T13:00:00.000Z',
      preferenceEnabled: true,
    });
    expect(invokeMock).toHaveBeenCalledWith('moodle-reauth-settings', {
      body: { action: 'get_settings' },
    });
  });

  it('maps the update DTO to the feature result', async () => {
    invokeMock.mockResolvedValue({
      credentialActive: false,
      message: '',
      preferenceEnabled: false,
      requiresLogin: false,
    });

    await expect(updateMoodleReauthSettings(false)).resolves.toEqual({
      credentialActive: false,
      message: undefined,
      preferenceEnabled: false,
      requiresLogin: false,
    });
  });
});
