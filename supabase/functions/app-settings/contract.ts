export const APP_SETTINGS_CONTRACT_VERSION = 1 as const

export interface PublicAppSettingsDto {
  contractVersion: typeof APP_SETTINGS_CONTRACT_VERSION
}

export interface RiskThresholdDaysDto {
  atencao: number
  critico: number
  risco: number
}

export interface ClarisAdminSettingsDto {
  apiKeyConfigured: boolean
  baseUrl: string
  configured: boolean
  customInstructions: string
  model: string
  provider: string
  updatedAt: string | null
}

export interface AiGradingAssociationWeightsDto {
  explicitLink: number
  keywordMatch: number
  sameSection: number
  similarName: number
  temporalProximity: number
}

export interface AiGradingSettingsDto {
  associationKeywords: string[]
  associationMinScore: number
  associationWeights: AiGradingAssociationWeightsDto
  customInstructions: string
  enabled: boolean
  feedbackSignature: string
  maxFileBytes: number
  maxStoredTextLength: number
  minSubmissionTextChars: number
  minVisualTextChars: number
  supportedTypes: string[]
  timeoutMs: number
  visionEnabled: boolean
}

export interface AdminAppSettingsDto {
  aiGradingSettings: AiGradingSettingsDto
  clarisSettings: ClarisAdminSettingsDto
  contractVersion: typeof APP_SETTINGS_CONTRACT_VERSION
  publicSettings: PublicAppSettingsDto
  riskThresholdDays: RiskThresholdDaysDto
}
