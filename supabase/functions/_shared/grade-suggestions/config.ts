import { DEFAULT_ASSOCIATION_CONFIG } from './heuristics.ts'
import { DEFAULT_GRADE_SUGGESTION_CUSTOM_INSTRUCTIONS } from './prompt.ts'

export interface GradeSuggestionRuntimeConfig {
  enabled: boolean
  llmConfigured: boolean
  provider: string
  model: string
  baseUrl: string
  apiKey: string
  timeoutMs: number
  maxFileBytes: number
  supportedTypes: string[]
  associationMinScore: number
  associationWeights: typeof DEFAULT_ASSOCIATION_CONFIG.weights
  associationKeywords: string[]
  minVisualTextChars: number
  minSubmissionTextChars: number
  maxStoredTextLength: number
  customInstructions: string
  visionEnabled: boolean
}

interface StoredLlmSettings {
  provider?: string
  model?: string
  baseUrl?: string
  apiKey?: string
  configured?: boolean
}

interface StoredAiGradingSettings {
  enabled?: unknown
  timeoutMs?: unknown
  maxFileBytes?: unknown
  supportedTypes?: unknown
  associationMinScore?: unknown
  associationWeights?: unknown
  associationKeywords?: unknown
  minVisualTextChars?: unknown
  minSubmissionTextChars?: unknown
  maxStoredTextLength?: unknown
  customInstructions?: unknown
  visionEnabled?: unknown
}

const DEFAULT_PROVIDER = 'openai'
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

const LEGACY_DEFAULT_SUPPORTED_TYPES = ['docx', 'pdf', 'txt', 'html', 'csv', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg']
const DEFAULT_SUPPORTED_TYPES = [...LEGACY_DEFAULT_SUPPORTED_TYPES, 'md', 'htm', 'gif', 'bmp', 'webp', 'svg']

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readPositiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback
  }

  return Math.max(1, Math.round(numeric))
}

function readUnitInterval(value: unknown, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return Number(Math.min(1, Math.max(0, numeric)).toFixed(2))
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []

  const normalized = items
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean)

  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...fallback]
}

function matchesLegacyDefaultSupportedTypes(values: string[]): boolean {
  if (values.length !== LEGACY_DEFAULT_SUPPORTED_TYPES.length) {
    return false
  }

  const current = new Set(values)
  return LEGACY_DEFAULT_SUPPORTED_TYPES.every((item) => current.has(item))
}

function readSupportedTypes(value: unknown): string[] {
  const normalized = readStringArray(value, DEFAULT_SUPPORTED_TYPES)

  return matchesLegacyDefaultSupportedTypes(normalized)
    ? [...DEFAULT_SUPPORTED_TYPES]
    : normalized
}

function readCustomInstructions(value: unknown, hasStoredValue: boolean): string {
  if (!hasStoredValue) {
    return DEFAULT_GRADE_SUGGESTION_CUSTOM_INSTRUCTIONS
  }

  return typeof value === 'string' ? value.trim() : ''
}

export function resolveGradeSuggestionRuntimeConfig(
  storedLlmSettings: StoredLlmSettings = {},
  storedAiGradingSettings: StoredAiGradingSettings = {},
): GradeSuggestionRuntimeConfig {
  const provider = (storedLlmSettings.provider?.trim() || DEFAULT_PROVIDER).toLowerCase()
  const model = storedLlmSettings.model?.trim() || ''
  const baseUrl = (storedLlmSettings.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const apiKey = storedLlmSettings.apiKey?.trim() || ''
  const llmConfigured =
    Boolean(storedLlmSettings.configured) &&
    Boolean(provider) &&
    Boolean(model) &&
    Boolean(baseUrl) &&
    Boolean(apiKey)
  const weights = asObject(storedAiGradingSettings.associationWeights)
  const hasStoredCustomInstructions = Object.prototype.hasOwnProperty.call(
    storedAiGradingSettings,
    'customInstructions',
  )

  return {
    enabled: readBoolean(storedAiGradingSettings.enabled, true),
    llmConfigured,
    provider,
    model,
    baseUrl,
    apiKey,
    timeoutMs: readPositiveInteger(storedAiGradingSettings.timeoutMs, 45000),
    maxFileBytes: readPositiveInteger(storedAiGradingSettings.maxFileBytes, 8 * 1024 * 1024),
    supportedTypes: readSupportedTypes(storedAiGradingSettings.supportedTypes),
    associationMinScore: readUnitInterval(
      storedAiGradingSettings.associationMinScore,
      DEFAULT_ASSOCIATION_CONFIG.minScore,
    ),
    associationWeights: {
      sameSection: readUnitInterval(
        weights.sameSection,
        DEFAULT_ASSOCIATION_CONFIG.weights.sameSection,
      ),
      similarName: readUnitInterval(
        weights.similarName,
        DEFAULT_ASSOCIATION_CONFIG.weights.similarName,
      ),
      keywordMatch: readUnitInterval(
        weights.keywordMatch,
        DEFAULT_ASSOCIATION_CONFIG.weights.keywordMatch,
      ),
      temporalProximity: readUnitInterval(
        weights.temporalProximity,
        DEFAULT_ASSOCIATION_CONFIG.weights.temporalProximity,
      ),
      explicitLink: readUnitInterval(
        weights.explicitLink,
        DEFAULT_ASSOCIATION_CONFIG.weights.explicitLink,
      ),
    },
    associationKeywords: readStringArray(
      storedAiGradingSettings.associationKeywords,
      [...DEFAULT_ASSOCIATION_CONFIG.keywords],
    ),
    minVisualTextChars: readPositiveInteger(storedAiGradingSettings.minVisualTextChars, 80),
    minSubmissionTextChars: readPositiveInteger(storedAiGradingSettings.minSubmissionTextChars, 40),
    maxStoredTextLength: readPositiveInteger(storedAiGradingSettings.maxStoredTextLength, 12000),
    customInstructions: readCustomInstructions(
      storedAiGradingSettings.customInstructions,
      hasStoredCustomInstructions,
    ),
    visionEnabled: readBoolean(storedAiGradingSettings.visionEnabled, false),
  }
}
