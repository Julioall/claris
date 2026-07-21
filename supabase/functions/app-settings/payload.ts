import {
  RequestBodyValidationError,
  expectBodyObject,
  readRequiredBoolean,
  readRequiredInteger,
  readRequiredLiteral,
  readRequiredObject,
  readRequiredString,
  readRequiredStringArray,
} from '../_shared/http/mod.ts'
import type {
  AiGradingAssociationWeightsDto,
  AiGradingSettingsDto,
  RiskThresholdDaysDto,
} from './contract.ts'

export interface ClarisSettingsInput {
  apiKey?: string
  baseUrl: string
  customInstructions: string
  model: string
  provider: string
}

export type AppSettingsPayload =
  | { action: 'get_public' }
  | { action: 'get_admin' }
  | { action: 'update_risk_thresholds'; riskThresholdDays: RiskThresholdDaysDto }
  | { action: 'update_claris'; settings: ClarisSettingsInput }
  | { action: 'update_ai_grading'; settings: AiGradingSettingsDto }

const ACTIONS = [
  'get_public',
  'get_admin',
  'update_risk_thresholds',
  'update_claris',
  'update_ai_grading',
] as const

const TOP_LEVEL_FIELDS: Record<AppSettingsPayload['action'], ReadonlySet<string>> = {
  get_public: new Set(['action']),
  get_admin: new Set(['action']),
  update_risk_thresholds: new Set(['action', 'riskThresholdDays']),
  update_claris: new Set(['action', 'settings']),
  update_ai_grading: new Set(['action', 'settings']),
}

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function assertExactFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  if (Object.keys(value).some((field) => !allowed.has(field))) {
    invalid(`Invalid ${label} fields`)
  }
}

function readRequiredNumber(
  value: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): number {
  const parsed = value[field]
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < min || parsed > max) {
    invalid(`Invalid ${field}`)
  }
  return parsed
}

function readStringAllowEmpty(
  value: Record<string, unknown>,
  field: string,
  maxLength: number,
): string {
  const parsed = value[field]
  if (typeof parsed !== 'string' || parsed.length > maxLength) invalid(`Invalid ${field}`)
  return parsed
}

function parseRiskThresholdDays(raw: unknown): RiskThresholdDaysDto {
  const value = readRequiredObject({ value: raw }, 'value')
  assertExactFields(value, new Set(['atencao', 'risco', 'critico']), 'riskThresholdDays')
  return {
    atencao: readRequiredInteger(value, 'atencao', 1, 3650),
    risco: readRequiredInteger(value, 'risco', 1, 3650),
    critico: readRequiredInteger(value, 'critico', 1, 3650),
  }
}

function parseClarisSettings(raw: unknown): ClarisSettingsInput {
  const value = readRequiredObject({ value: raw }, 'value')
  assertExactFields(
    value,
    new Set(['provider', 'model', 'baseUrl', 'apiKey', 'customInstructions']),
    'settings',
  )

  const apiKey = value.apiKey
  if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.length > 4096)) {
    invalid('Invalid apiKey')
  }

  return {
    provider: readRequiredString(value, 'provider', 120).trim(),
    model: readRequiredString(value, 'model', 200).trim(),
    baseUrl: readRequiredString(value, 'baseUrl', 2048).trim(),
    customInstructions: readStringAllowEmpty(value, 'customInstructions', 32000).trim(),
    ...(typeof apiKey === 'string' && apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
  }
}

function parseAssociationWeights(raw: unknown): AiGradingAssociationWeightsDto {
  const value = readRequiredObject({ value: raw }, 'value')
  assertExactFields(
    value,
    new Set(['sameSection', 'similarName', 'keywordMatch', 'temporalProximity', 'explicitLink']),
    'associationWeights',
  )
  return {
    sameSection: readRequiredNumber(value, 'sameSection', 0, 1),
    similarName: readRequiredNumber(value, 'similarName', 0, 1),
    keywordMatch: readRequiredNumber(value, 'keywordMatch', 0, 1),
    temporalProximity: readRequiredNumber(value, 'temporalProximity', 0, 1),
    explicitLink: readRequiredNumber(value, 'explicitLink', 0, 1),
  }
}

function parseAiGradingSettings(raw: unknown): AiGradingSettingsDto {
  const value = readRequiredObject({ value: raw }, 'value')
  assertExactFields(value, new Set([
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
  ]), 'settings')

  const supportedTypes = readRequiredStringArray(value, 'supportedTypes')
  const associationKeywords = readRequiredStringArray(value, 'associationKeywords')
  if (supportedTypes.length > 100 || associationKeywords.length > 200) {
    invalid('Invalid settings list size')
  }

  return {
    enabled: readRequiredBoolean(value, 'enabled'),
    timeoutMs: readRequiredInteger(value, 'timeoutMs', 1000, 300000),
    maxFileBytes: readRequiredInteger(value, 'maxFileBytes', 1024, 100 * 1024 * 1024),
    supportedTypes: supportedTypes.map((item) => item.trim().toLowerCase()),
    associationMinScore: readRequiredNumber(value, 'associationMinScore', 0, 1),
    associationWeights: parseAssociationWeights(value.associationWeights),
    associationKeywords: associationKeywords.map((item) => item.trim().toLowerCase()),
    minVisualTextChars: readRequiredInteger(value, 'minVisualTextChars', 1, 100000),
    minSubmissionTextChars: readRequiredInteger(value, 'minSubmissionTextChars', 1, 100000),
    maxStoredTextLength: readRequiredInteger(value, 'maxStoredTextLength', 500, 1000000),
    customInstructions: readStringAllowEmpty(value, 'customInstructions', 32000).trim(),
    feedbackSignature: readStringAllowEmpty(value, 'feedbackSignature', 5000).trim(),
    visionEnabled: readRequiredBoolean(value, 'visionEnabled'),
  }
}

export function parseAppSettingsPayload(rawBody: unknown): AppSettingsPayload {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', ACTIONS)
  assertExactFields(body, TOP_LEVEL_FIELDS[action], 'request')

  if (action === 'get_public' || action === 'get_admin') return { action }
  if (action === 'update_risk_thresholds') {
    return { action, riskThresholdDays: parseRiskThresholdDays(body.riskThresholdDays) }
  }
  if (action === 'update_claris') {
    return { action, settings: parseClarisSettings(body.settings) }
  }
  return { action, settings: parseAiGradingSettings(body.settings) }
}
