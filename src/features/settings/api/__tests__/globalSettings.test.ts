import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: invokeMock,
}));

import { fetchGlobalSettings } from '../globalSettings';

describe('global settings API client', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads only the authenticated public configuration DTO', async () => {
    invokeMock.mockResolvedValue({
      contractVersion: 1,
      moodleConnectionUrl: 'https://ead.fieg.com.br',
      moodleConnectionService: 'moodle_mobile_app',
    });

    await expect(fetchGlobalSettings()).resolves.toEqual({
      contractVersion: 1,
      moodleConnectionUrl: 'https://ead.fieg.com.br',
      moodleConnectionService: 'moodle_mobile_app',
    });
    expect(invokeMock).toHaveBeenCalledWith('app-settings', {
      body: { action: 'get_public' },
    });
  });

  it('rejects unexpected fields in the public response', async () => {
    invokeMock.mockResolvedValue({
      contractVersion: 1,
      moodleConnectionUrl: 'https://ead.fieg.com.br',
      moodleConnectionService: 'moodle_mobile_app',
      clarisSettings: { apiKey: 'server-secret' },
    });

    await expect(fetchGlobalSettings()).rejects.toThrow('resposta invalida');
  });
});
