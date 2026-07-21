import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';
import type { AiGradingSettings } from '@/lib/ai-grading-settings';
import type { GlobalRiskThresholdDays } from '@/lib/global-app-settings';
import type { ClarisLlmSettings } from '@/lib/claris-settings';
import type { ClarisLlmTestDto } from '@/features/settings/api/contracts/app-settings.contract';
import { parseAdminAppSettingsDto } from '@/features/settings/api/mappers/app-settings.mapper';

type ClarisConnectionInput = Pick<ClarisLlmSettings, 'provider' | 'model' | 'baseUrl'> & {
  apiKey?: string;
};

type ClarisSettingsUpdateInput = Pick<
  ClarisLlmSettings,
  'provider' | 'model' | 'baseUrl' | 'customInstructions'
> & { apiKey?: string };

async function invokeAdminSettings(body: Record<string, unknown>) {
  const response = await invokeEdgeFunction<unknown>('app-settings', { body });
  return parseAdminAppSettingsDto(response);
}

export async function fetchAdminSettings() {
  return invokeAdminSettings({ action: 'get_admin' });
}

export async function saveRiskThresholdSettings(riskThresholdDays: GlobalRiskThresholdDays) {
  return invokeAdminSettings({
    action: 'update_risk_thresholds',
    riskThresholdDays,
  });
}

export async function saveClarisConnectionSettings(settings: ClarisSettingsUpdateInput) {
  return invokeAdminSettings({
    action: 'update_claris',
    settings,
  });
}

export async function saveAiGradingSettings(settings: AiGradingSettings) {
  return invokeAdminSettings({
    action: 'update_ai_grading',
    settings,
  });
}

export async function testClarisLLM(input: ClarisConnectionInput) {
  const result = await invokeEdgeFunction<unknown>('claris-llm-test', {
    body: {
      action: 'test_connection',
      provider: input.provider,
      model: input.model,
      baseUrl: input.baseUrl,
      ...(input.apiKey ? { apiKey: input.apiKey } : {}),
    },
  });

  if (
    !result
    || typeof result !== 'object'
    || Array.isArray(result)
    || (result as Record<string, unknown>).contractVersion !== 1
    || typeof (result as Record<string, unknown>).latencyMs !== 'number'
  ) {
    throw new Error('A API de teste da Claris retornou uma resposta invalida.');
  }

  return result as ClarisLlmTestDto;
}
