import { RequestBodyValidationError, expectBodyObject } from '../_shared/http/mod.ts'
import { validateUuid } from '../_shared/validation/mod.ts'
import type { BackgroundJobStatusDto } from './contract.ts'

const ACTIONS = ['list_active', 'admin_list', 'admin_get', 'admin_retry', 'admin_cancel'] as const
type Action = typeof ACTIONS[number]

export type BackgroundJobsPayload =
  | { action: 'list_active' }
  | {
      action: 'admin_list'
      filters: {
        jobType?: string
        search?: string
        source?: string
        status?: BackgroundJobStatusDto
      }
      page: number
      pageSize: number
    }
  | { action: 'admin_get'; jobId: string }
  | { action: 'admin_retry'; jobId: string }
  | { action: 'admin_cancel'; jobId: string }

function invalid(message: string): never {
  throw new RequestBodyValidationError(message, 422)
}

function exact(body: Record<string, unknown>, fields: string[]): void {
  const allowed = new Set(fields)
  if (Object.keys(body).some((field) => !allowed.has(field))) invalid('Invalid request fields')
}

function action(body: Record<string, unknown>): Action {
  if (typeof body.action !== 'string' || !ACTIONS.includes(body.action as Action)) invalid('Invalid action')
  return body.action as Action
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !validateUuid(value)) invalid(`Invalid ${field}`)
  return value.toLowerCase()
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) invalid(`Invalid ${field}`)
  return Number(value)
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '' || value === 'all') return undefined
  if (typeof value !== 'string' || value.trim().length > max) invalid(`Invalid ${field}`)
  const normalized = value.trim()
  return normalized || undefined
}

function filters(value: unknown): Extract<BackgroundJobsPayload, { action: 'admin_list' }>['filters'] {
  if (!value || !Object.keys(value as object).length) return {}
  if (typeof value !== 'object' || Array.isArray(value)) invalid('Invalid filters')
  const record = value as Record<string, unknown>
  exact(record, ['jobType', 'search', 'source', 'status'])
  const status = optionalText(record.status, 'status', 30)
  if (status && !['pending', 'processing', 'completed', 'failed', 'cancelled'].includes(status)) {
    invalid('Invalid status')
  }
  return {
    ...(optionalText(record.jobType, 'jobType', 100) ? { jobType: optionalText(record.jobType, 'jobType', 100) } : {}),
    ...(optionalText(record.search, 'search', 200) ? { search: optionalText(record.search, 'search', 200) } : {}),
    ...(optionalText(record.source, 'source', 100) ? { source: optionalText(record.source, 'source', 100) } : {}),
    ...(status ? { status: status as BackgroundJobStatusDto } : {}),
  }
}

export function parseBackgroundJobsPayload(raw: unknown): BackgroundJobsPayload {
  const body = expectBodyObject(raw)
  const selectedAction = action(body)
  if (selectedAction === 'list_active') {
    exact(body, ['action'])
    return { action: selectedAction }
  }
  if (selectedAction === 'admin_list') {
    exact(body, ['action', 'filters', 'page', 'pageSize'])
    return {
      action: selectedAction,
      filters: filters(body.filters),
      page: integer(body.page, 'page', 1, 100_000),
      pageSize: integer(body.pageSize, 'pageSize', 1, 100),
    }
  }
  exact(body, ['action', 'jobId'])
  return { action: selectedAction, jobId: uuid(body.jobId, 'jobId') }
}
