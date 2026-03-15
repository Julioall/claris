export const CLARIS_CONFIGURED_STORAGE_KEY = 'claris_llm_configured';

export interface ClarisLlmSettings {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  configured: boolean;
  updatedAt?: string;
}

export const DEFAULT_CLARIS_LLM_SETTINGS: ClarisLlmSettings = {
  provider: 'openai',
  model: '',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  configured: false,
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, '');

export function isClarisSettingsConfigured(settings: Pick<ClarisLlmSettings, 'provider' | 'model' | 'baseUrl' | 'apiKey'>) {
  return (
    settings.provider.trim().length > 0 &&
    settings.model.trim().length > 0 &&
    normalizeBaseUrl(settings.baseUrl).length > 0 &&
    settings.apiKey.trim().length > 0
  );
}

export function parseClarisLlmSettings(value: unknown): ClarisLlmSettings {
  const raw = asObject(value);

  const parsed: ClarisLlmSettings = {
    provider: String(raw.provider ?? DEFAULT_CLARIS_LLM_SETTINGS.provider),
    model: String(raw.model ?? ''),
    baseUrl: String(raw.baseUrl ?? DEFAULT_CLARIS_LLM_SETTINGS.baseUrl),
    apiKey: String(raw.apiKey ?? ''),
    configured: Boolean(raw.configured ?? false),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
  };

  const computedConfigured = isClarisSettingsConfigured(parsed);

  return {
    ...parsed,
    baseUrl: normalizeBaseUrl(parsed.baseUrl),
    configured: computedConfigured,
  };
}
