import type {
  AdminAppSettingsDto,
  AiGradingSettingsDto,
  ClarisAdminSettingsDto,
  PublicAppSettingsDto,
  RiskThresholdDaysDto,
} from './contract.ts'
import { APP_SETTINGS_CONTRACT_VERSION } from './contract.ts'
import type { AppSettingsState, PublicAppSettingsState } from './repository.ts'
import { resolveGradeSuggestionRuntimeConfig } from '../_shared/grade-suggestions/config.ts'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

const DEFAULT_RISK_THRESHOLDS: RiskThresholdDaysDto = {
  atencao: 7,
  risco: 14,
  critico: 30,
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const positiveInteger = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback

export function mapPublicAppSettings(state?: PublicAppSettingsState | null): PublicAppSettingsDto {
  void state
  return {
    contractVersion: APP_SETTINGS_CONTRACT_VERSION,
  }
}

export function parseRiskThresholdDays(value: unknown): RiskThresholdDaysDto {
  const raw = asObject(value)
  return {
    atencao: positiveInteger(raw.atencao, DEFAULT_RISK_THRESHOLDS.atencao),
    risco: positiveInteger(raw.risco, DEFAULT_RISK_THRESHOLDS.risco),
    critico: positiveInteger(raw.critico, DEFAULT_RISK_THRESHOLDS.critico),
  }
}

export interface StoredClarisSettings {
  apiKey: string
  baseUrl: string
  configured: boolean
  customInstructions: string
  model: string
  provider: string
  updatedAt: string | null
}

export function parseStoredClarisSettings(value: unknown): StoredClarisSettings {
  const raw = asObject(value)
  const provider = asTrimmedString(raw.provider) || 'openai'
  const model = asTrimmedString(raw.model)
  const baseUrl = asTrimmedString(raw.baseUrl).replace(/\/+$/, '') || DEFAULT_BASE_URL
  const apiKey = asTrimmedString(raw.apiKey)
  return {
    provider,
    model,
    baseUrl,
    apiKey,
    customInstructions: asTrimmedString(raw.customInstructions),
    configured: Boolean(provider && model && baseUrl && apiKey),
    updatedAt: asTrimmedString(raw.updatedAt) || null,
  }
}

export function mapClarisAdminSettings(value: unknown): ClarisAdminSettingsDto {
  const settings = parseStoredClarisSettings(value)
  return {
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    customInstructions: settings.customInstructions,
    configured: settings.configured,
    apiKeyConfigured: Boolean(settings.apiKey),
    updatedAt: settings.updatedAt,
  }
}

export function parseAiGradingSettings(value: unknown): AiGradingSettingsDto {
  const settings = resolveGradeSuggestionRuntimeConfig({}, asObject(value))
  return {
    enabled: settings.enabled,
    timeoutMs: settings.timeoutMs,
    maxFileBytes: settings.maxFileBytes,
    supportedTypes: settings.supportedTypes,
    associationMinScore: settings.associationMinScore,
    associationWeights: settings.associationWeights,
    associationKeywords: settings.associationKeywords,
    minVisualTextChars: settings.minVisualTextChars,
    minSubmissionTextChars: settings.minSubmissionTextChars,
    maxStoredTextLength: settings.maxStoredTextLength,
    customInstructions: settings.customInstructions,
    feedbackSignature: settings.feedbackSignature,
    visionEnabled: settings.visionEnabled,
  }
}

export function mapAdminAppSettings(state: AppSettingsState | null): AdminAppSettingsDto {
  return {
    contractVersion: APP_SETTINGS_CONTRACT_VERSION,
    publicSettings: mapPublicAppSettings(state),
    riskThresholdDays: parseRiskThresholdDays(state?.riskThresholdDays),
    clarisSettings: mapClarisAdminSettings(state?.clarisSettings),
    aiGradingSettings: parseAiGradingSettings(state?.aiGradingSettings),
  }
}
