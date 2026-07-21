import { describe, expect, it, vi } from 'vitest';

import { mapAdminAppSettings, mapPublicAppSettings } from '../../../../supabase/functions/app-settings/mapper.ts';
import { parseAppSettingsPayload } from '../../../../supabase/functions/app-settings/payload.ts';
import type {
  AppSettingsRepository,
  AppSettingsState,
} from '../../../../supabase/functions/app-settings/repository.ts';
import { updateAppSettings } from '../../../../supabase/functions/app-settings/service.ts';
import { parseClarisLlmTestPayload } from '../../../../supabase/functions/claris-llm-test/payload.ts';

function v1Request(path = 'app-settings') {
  return new Request(`http://localhost/${path}`, {
    headers: { 'x-claris-api-version': '1' },
    method: 'POST',
  });
}

const initialState: AppSettingsState = {
  moodleConnectionUrl: 'https://ead.fieg.com.br',
  moodleConnectionService: 'moodle_mobile_app',
  riskThresholdDays: { atencao: 7, risco: 14, critico: 30 },
  clarisSettings: {
    provider: 'openai',
    model: 'gpt-5-mini',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'server-secret',
    customInstructions: '',
    configured: true,
  },
  aiGradingSettings: {},
};

function repository(): AppSettingsRepository & { state: AppSettingsState } {
  const repo = {
    state: structuredClone(initialState),
    isApplicationAdmin: vi.fn(async () => true),
    readAdminSettings: vi.fn(async () => repo.state),
    readPublicSettings: vi.fn(async () => ({
      moodleConnectionUrl: repo.state.moodleConnectionUrl,
      moodleConnectionService: repo.state.moodleConnectionService,
    })),
    updateRiskThresholdDays: vi.fn(async (settings: Record<string, number>) => {
      repo.state.riskThresholdDays = settings;
    }),
    updateClarisSettings: vi.fn(async (settings) => {
      const current = repo.state.clarisSettings as Record<string, unknown>;
      const apiKey = settings.apiKey || String(current.apiKey ?? '');
      repo.state.clarisSettings = {
        ...settings,
        apiKey,
        configured: Boolean(settings.provider && settings.model && settings.baseUrl && apiKey),
      };
    }),
    updateAiGradingSettings: vi.fn(async (settings: Record<string, unknown>) => {
      repo.state.aiGradingSettings = settings;
    }),
  };
  return repo;
}

describe('app-settings backend contract', () => {
  it('accepts explicit operations and rejects identity or raw database fields', () => {
    expect(parseAppSettingsPayload({ action: 'get_public' })).toEqual({ action: 'get_public' });
    expect(parseAppSettingsPayload({ action: 'get_admin' })).toEqual({ action: 'get_admin' });

    expect(() => parseAppSettingsPayload({ action: 'get_admin', userId: 'spoof' }))
      .toThrowError(expect.objectContaining({ status: 422 }));
    expect(() => parseAppSettingsPayload({
      action: 'update_claris',
      settings: {
        provider: 'openai',
        model: 'gpt-5-mini',
        baseUrl: 'https://api.openai.com/v1',
        customInstructions: '',
        configured: true,
      },
    })).toThrowError(expect.objectContaining({ status: 422 }));
  });

  it('maps public and administrative DTOs without returning the provider credential', () => {
    const publicDto = mapPublicAppSettings(initialState);
    const adminDto = mapAdminAppSettings(initialState);

    expect(publicDto).toEqual({
      contractVersion: 1,
      moodleConnectionUrl: 'https://ead.fieg.com.br',
      moodleConnectionService: 'moodle_mobile_app',
    });
    expect(adminDto.clarisSettings).toMatchObject({
      apiKeyConfigured: true,
      configured: true,
    });
    expect(JSON.stringify(adminDto)).not.toContain('server-secret');
    expect(adminDto.clarisSettings).not.toHaveProperty('apiKey');
  });

  it('preserves an existing provider key on the server when the admin leaves it blank', async () => {
    const repo = repository();
    const result = await updateAppSettings(repo, {
      action: 'update_claris',
      settings: {
        provider: 'openai',
        model: 'gpt-5.4-mini',
        baseUrl: 'https://api.openai.com/v1/',
        customInstructions: 'Seja objetivo.',
      },
    });

    expect(repo.updateClarisSettings).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.4-mini',
    }));
    expect(vi.mocked(repo.updateClarisSettings).mock.calls[0][0]).not.toHaveProperty('apiKey');
    expect(result.clarisSettings.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(result)).not.toContain('server-secret');
  });

  it('rejects invalid risk threshold ordering in the service', async () => {
    await expect(updateAppSettings(repository(), {
      action: 'update_risk_thresholds',
      riskThresholdDays: { atencao: 20, risco: 10, critico: 30 },
    })).rejects.toMatchObject({ status: 422 });
  });
});

describe('claris-llm-test V1 payload', () => {
  it('accepts only test intent and rejects client identity', () => {
    expect(parseClarisLlmTestPayload({
      action: 'test_connection',
      model: 'gpt-5-mini',
    }, v1Request('claris-llm-test'))).toEqual({
      requestVersion: 'v1',
      provider: undefined,
      model: 'gpt-5-mini',
      baseUrl: undefined,
      apiKey: undefined,
    });

    expect(() => parseClarisLlmTestPayload({
      action: 'test_connection',
      userId: 'spoof',
    }, v1Request('claris-llm-test'))).toThrowError(expect.objectContaining({ status: 422 }));
  });
});
