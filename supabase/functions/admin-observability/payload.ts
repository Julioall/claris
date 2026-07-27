import {
  RequestBodyValidationError,
  expectBodyObject,
  readOptionalBoolean,
  readOptionalInteger,
  readOptionalIsoDate,
  readOptionalLiteral,
  readOptionalString,
  readOptionalUuid,
  readRequiredLiteral,
  readRequiredUuid,
} from '../_shared/http/mod.ts'

export type AdminObservabilityPayload =
  | { action: 'get_dashboard' }
  | { action: 'get_moodle_sync_metrics'; stuckAfterSeconds: number; windowHours: number }
  | {
      action: 'list_usage_events'
      dateFrom?: string
      dateTo?: string
      eventType?: string
      page: number
      pageSize: number
      search?: string
      userId?: string
    }
  | {
      action: 'list_error_logs'
      category?: string
      dateFrom?: string
      dateTo?: string
      page: number
      pageSize: number
      resolved?: boolean
      search?: string
      severity?: string
    }
  | { action: 'resolve_error_log'; logId: string }
  | { action: 'list_claris_conversations'; page: number; pageSize: number; search?: string }

const ACTIONS = [
  'get_dashboard',
  'get_moodle_sync_metrics',
  'list_usage_events',
  'list_error_logs',
  'resolve_error_log',
  'list_claris_conversations',
] as const

const ACTION_FIELDS: Record<AdminObservabilityPayload['action'], ReadonlySet<string>> = {
  get_dashboard: new Set(['action']),
  get_moodle_sync_metrics: new Set(['action', 'windowHours', 'stuckAfterSeconds']),
  list_usage_events: new Set(['action', 'page', 'pageSize', 'eventType', 'userId', 'dateFrom', 'dateTo', 'search']),
  list_error_logs: new Set(['action', 'page', 'pageSize', 'severity', 'category', 'resolved', 'dateFrom', 'dateTo', 'search']),
  resolve_error_log: new Set(['action', 'logId']),
  list_claris_conversations: new Set(['action', 'page', 'pageSize', 'search']),
}

const SEVERITIES = ['info', 'warning', 'error', 'critical'] as const
const CATEGORIES = ['ui', 'import', 'integration', 'edge_function', 'ai', 'auth', 'other'] as const

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function assertExactFields(body: Record<string, unknown>, action: AdminObservabilityPayload['action']) {
  if (Object.keys(body).some((field) => !ACTION_FIELDS[action].has(field))) {
    invalid('Invalid request fields')
  }
}

function page(body: Record<string, unknown>, maxPageSize: number, defaultPageSize: number) {
  return {
    page: readOptionalInteger(body, 'page', 1) ?? 1,
    pageSize: readOptionalInteger(body, 'pageSize', 1, maxPageSize) ?? defaultPageSize,
  }
}

function validateDateRange(dateFrom?: string, dateTo?: string) {
  if (dateFrom && dateTo && Date.parse(dateFrom) > Date.parse(dateTo)) invalid('Invalid date range')
}

export function parseAdminObservabilityPayload(rawBody: unknown): AdminObservabilityPayload {
  const body = expectBodyObject(rawBody)
  const action = readRequiredLiteral(body, 'action', ACTIONS)
  assertExactFields(body, action)

  if (action === 'get_dashboard') return { action }
  if (action === 'get_moodle_sync_metrics') {
    return {
      action,
      windowHours: readOptionalInteger(body, 'windowHours', 1, 24 * 90) ?? 168,
      stuckAfterSeconds: readOptionalInteger(body, 'stuckAfterSeconds', 60, 3600) ?? 300,
    }
  }
  if (action === 'resolve_error_log') {
    return { action, logId: readRequiredUuid(body, 'logId') }
  }
  if (action === 'list_claris_conversations') {
    return {
      action,
      ...page(body, 100, 30),
      search: readOptionalString(body, 'search', 200)?.trim(),
    }
  }

  const dateFrom = readOptionalIsoDate(body, 'dateFrom')
  const dateTo = readOptionalIsoDate(body, 'dateTo')
  validateDateRange(dateFrom, dateTo)

  if (action === 'list_usage_events') {
    return {
      action,
      ...page(body, 200, 50),
      eventType: readOptionalString(body, 'eventType', 160)?.trim(),
      userId: readOptionalUuid(body, 'userId'),
      dateFrom,
      dateTo,
      search: readOptionalString(body, 'search', 200)?.trim(),
    }
  }

  return {
    action,
    ...page(body, 100, 30),
    severity: readOptionalLiteral(body, 'severity', SEVERITIES),
    category: readOptionalLiteral(body, 'category', CATEGORIES),
    resolved: readOptionalBoolean(body, 'resolved'),
    dateFrom,
    dateTo,
    search: readOptionalString(body, 'search', 500)?.trim(),
  }
}
