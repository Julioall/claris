export const APP_TELEMETRY_MAX_BODY_BYTES = 64 * 1024

export const TELEMETRY_ERROR_CATEGORIES = [
  'ui',
  'import',
  'integration',
  'edge_function',
  'ai',
  'auth',
  'other',
] as const

export const TELEMETRY_ERROR_SEVERITIES = [
  'info',
  'warning',
  'error',
  'critical',
] as const

export type TelemetryErrorCategory = typeof TELEMETRY_ERROR_CATEGORIES[number]
export type TelemetryErrorSeverity = typeof TELEMETRY_ERROR_SEVERITIES[number]

export type TelemetryJson =
  | boolean
  | number
  | string
  | null
  | TelemetryJson[]
  | { [key: string]: TelemetryJson }

export type TelemetryAttributes = { [key: string]: TelemetryJson }

export interface TelemetryRecordedDto {
  recorded: true
}
