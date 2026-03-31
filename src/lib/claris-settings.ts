export const CLARIS_CONFIGURED_STORAGE_KEY = 'claris_llm_configured';

export interface ClarisLlmSettings {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  customInstructions: string;
  configured: boolean;
  updatedAt?: string;
}

export interface ClarisLlmModelPreset {
  id: string;
  label: string;
  provider: string;
  model: string;
  baseUrl: string;
  notes: string;
  recommended?: boolean;
}

export interface ClarisLlmProviderOption {
  value: string;
  label: string;
}

export const CLARIS_LLM_PROVIDER_OPTIONS: ClarisLlmProviderOption[] = [
  {
    value: 'openai',
    label: 'OpenAI',
  },
  {
    value: 'custom',
    label: 'Customizado',
  },
];

export const CLARIS_LLM_MODEL_PRESETS: ClarisLlmModelPreset[] = [
  {
    id: 'gpt-5-nano',
    label: 'GPT-5 Nano',
    provider: 'openai',
    model: 'gpt-5-nano',
    baseUrl: 'https://api.openai.com/v1',
    notes: 'Mais rapido e economico para validacoes e tarefas simples.',
  },
  {
    id: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    provider: 'openai',
    model: 'gpt-5-mini',
    baseUrl: 'https://api.openai.com/v1',
    notes: 'Equilibrio entre custo, velocidade e qualidade para uso geral.',
    recommended: true,
  },
  {
    id: 'gpt-5',
    label: 'GPT-5',
    provider: 'openai',
    model: 'gpt-5',
    baseUrl: 'https://api.openai.com/v1',
    notes: 'Maior qualidade para analises complexas e instrucoes detalhadas.',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    notes: 'Opcao legada estavel para compatibilidade com chamadas anteriores.',
  },
];

export const DEFAULT_CLARIS_LLM_SETTINGS: ClarisLlmSettings = {
  provider: 'openai',
  model: '',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  customInstructions: '',
  configured: false,
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, '');

export function findClarisModelPresetBySettings(settings: Pick<ClarisLlmSettings, 'provider' | 'model' | 'baseUrl'>): ClarisLlmModelPreset | undefined {
  const normalizedProvider = settings.provider.trim().toLowerCase();
  const normalizedModel = settings.model.trim().toLowerCase();
  const normalizedBaseUrl = normalizeBaseUrl(settings.baseUrl).toLowerCase();

  return CLARIS_LLM_MODEL_PRESETS.find((preset) => (
    preset.provider.toLowerCase() === normalizedProvider
    && preset.model.toLowerCase() === normalizedModel
    && normalizeBaseUrl(preset.baseUrl).toLowerCase() === normalizedBaseUrl
  ));
}

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
    customInstructions: typeof raw.customInstructions === 'string' ? raw.customInstructions.trim() : '',
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
