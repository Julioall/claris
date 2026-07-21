import { parseAiGradingSettings } from '@/lib/ai-grading-settings';
import { normalizeRiskThresholdDays } from '@/lib/global-app-settings';

import type {
  AdminAppSettingsDto,
  ClarisAdminSettingsDto,
  PublicAppSettingsDto,
} from '../contracts/app-settings.contract';

const PUBLIC_FIELDS = new Set(['contractVersion', 'moodleConnectionUrl', 'moodleConnectionService']);
const ADMIN_FIELDS = new Set(['contractVersion', 'publicSettings', 'riskThresholdDays', 'clarisSettings', 'aiGradingSettings']);
const CLARIS_FIELDS = new Set([
  'provider',
  'model',
  'baseUrl',
  'customInstructions',
  'configured',
  'apiKeyConfigured',
  'updatedAt',
]);
const AI_GRADING_FIELDS = new Set([
  'enabled',
  'timeoutMs',
  'maxFileBytes',
  'supportedTypes',
  'associationMinScore',
  'associationWeights',
  'associationKeywords',
  'minVisualTextChars',
  'minSubmissionTextChars',
  'maxStoredTextLength',
  'customInstructions',
  'feedbackSignature',
  'visionEnabled',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyFields(value: Record<string, unknown>, fields: ReadonlySet<string>): boolean {
  return Object.keys(value).every((field) => fields.has(field));
}

function invalidResponse(): never {
  throw new Error('A API de configuracoes globais retornou uma resposta invalida.');
}

export function parsePublicAppSettingsDto(value: unknown): PublicAppSettingsDto {
  if (
    !isRecord(value)
    || !hasOnlyFields(value, PUBLIC_FIELDS)
    || value.contractVersion !== 1
    || typeof value.moodleConnectionUrl !== 'string'
    || typeof value.moodleConnectionService !== 'string'
  ) {
    invalidResponse();
  }

  return {
    contractVersion: 1,
    moodleConnectionUrl: value.moodleConnectionUrl,
    moodleConnectionService: value.moodleConnectionService,
  };
}

function parseClarisAdminSettings(value: unknown): ClarisAdminSettingsDto {
  if (
    !isRecord(value)
    || !hasOnlyFields(value, CLARIS_FIELDS)
    || typeof value.provider !== 'string'
    || typeof value.model !== 'string'
    || typeof value.baseUrl !== 'string'
    || typeof value.customInstructions !== 'string'
    || typeof value.configured !== 'boolean'
    || typeof value.apiKeyConfigured !== 'boolean'
    || (value.updatedAt !== null && typeof value.updatedAt !== 'string')
  ) {
    invalidResponse();
  }

  return {
    provider: value.provider,
    model: value.model,
    baseUrl: value.baseUrl,
    customInstructions: value.customInstructions,
    configured: value.configured,
    apiKeyConfigured: value.apiKeyConfigured,
    updatedAt: value.updatedAt,
  };
}

export function parseAdminAppSettingsDto(value: unknown): AdminAppSettingsDto {
  if (
    !isRecord(value)
    || !hasOnlyFields(value, ADMIN_FIELDS)
    || value.contractVersion !== 1
    || !isRecord(value.riskThresholdDays)
    || !isRecord(value.aiGradingSettings)
    || !hasOnlyFields(value.aiGradingSettings, AI_GRADING_FIELDS)
  ) {
    invalidResponse();
  }

  const publicSettings = parsePublicAppSettingsDto(value.publicSettings);
  const clarisSettings = parseClarisAdminSettings(value.clarisSettings);
  const riskThresholdDays = normalizeRiskThresholdDays({
    atencao: Number(value.riskThresholdDays.atencao),
    risco: Number(value.riskThresholdDays.risco),
    critico: Number(value.riskThresholdDays.critico),
  });
  const aiGradingSettings = parseAiGradingSettings(value.aiGradingSettings);

  if (
    !Number.isFinite(riskThresholdDays.atencao)
    || !Number.isFinite(riskThresholdDays.risco)
    || !Number.isFinite(riskThresholdDays.critico)
  ) {
    invalidResponse();
  }

  return {
    contractVersion: 1,
    publicSettings,
    riskThresholdDays,
    clarisSettings,
    aiGradingSettings,
  };
}
