import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_AI_GRADING_SETTINGS } from '@/lib/ai-grading-settings';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: invokeMock,
}));

import {
  fetchAdminSettings,
  saveClarisConnectionSettings,
  testClarisLLM,
} from '../settings';

const response = {
  contractVersion: 1,
  publicSettings: {
    contractVersion: 1,
    moodleConnectionUrl: 'https://ead.fieg.com.br',
    moodleConnectionService: 'moodle_mobile_app',
  },
  riskThresholdDays: { atencao: 7, risco: 14, critico: 30 },
  clarisSettings: {
    provider: 'openai',
    model: 'gpt-5-mini',
    baseUrl: 'https://api.openai.com/v1',
    customInstructions: '',
    configured: true,
    apiKeyConfigured: true,
    updatedAt: '2026-07-21T13:00:00.000Z',
  },
  aiGradingSettings: DEFAULT_AI_GRADING_SETTINGS,
};

describe('admin settings API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockResolvedValue(response);
  });

  it('reads the safe administrative DTO without browser identity', async () => {
    await expect(fetchAdminSettings()).resolves.toMatchObject({
      clarisSettings: { apiKeyConfigured: true, configured: true },
    });
    expect(invokeMock).toHaveBeenCalledWith('app-settings', {
      body: { action: 'get_admin' },
    });
    expect(invokeMock.mock.calls[0][1].body).not.toHaveProperty('userId');
  });

  it('sends only editable Claris settings and an optional replacement key', async () => {
    await saveClarisConnectionSettings({
      provider: 'openai',
      model: 'gpt-5-mini',
      baseUrl: 'https://api.openai.com/v1',
      customInstructions: 'Seja objetivo.',
      apiKey: 'replacement-key',
    });

    expect(invokeMock).toHaveBeenCalledWith('app-settings', {
      body: {
        action: 'update_claris',
        settings: {
          provider: 'openai',
          model: 'gpt-5-mini',
          baseUrl: 'https://api.openai.com/v1',
          customInstructions: 'Seja objetivo.',
          apiKey: 'replacement-key',
        },
      },
    });
    expect(invokeMock.mock.calls[0][1].body.settings).not.toHaveProperty('configured');
    expect(invokeMock.mock.calls[0][1].body.settings).not.toHaveProperty('updatedAt');
  });

  it('rejects any administrative response that contains the stored provider key', async () => {
    invokeMock.mockResolvedValue({
      ...response,
      clarisSettings: { ...response.clarisSettings, apiKey: 'server-secret' },
    });

    await expect(fetchAdminSettings()).rejects.toThrow('resposta invalida');
  });

  it('uses the V1 LLM test contract and accepts a server-managed stored key', async () => {
    invokeMock.mockResolvedValue({ contractVersion: 1, latencyMs: 123 });

    await expect(testClarisLLM({
      provider: 'openai',
      model: 'gpt-5-mini',
      baseUrl: 'https://api.openai.com/v1',
    })).resolves.toEqual({ contractVersion: 1, latencyMs: 123 });
    expect(invokeMock).toHaveBeenCalledWith('claris-llm-test', {
      body: {
        action: 'test_connection',
        provider: 'openai',
        model: 'gpt-5-mini',
        baseUrl: 'https://api.openai.com/v1',
      },
    });
  });
});
