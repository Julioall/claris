import {
  RequestBodyValidationError,
  expectBodyObject,
} from '../_shared/http/mod.ts'
import {
  BULK_JOB_STATUSES,
  SCHEDULED_MESSAGE_STATUSES,
  type BulkJobStatusDto,
  type ScheduledMessageStatusDto,
} from './contract.ts'

export interface CampaignRecipientSelection {
  personalizedMessage?: string
  studentId: string
}

export interface CampaignScheduleInput {
  endDate?: string
  monthlyDay?: number
  startDate?: string
  time?: string
  type: 'specific_date' | 'daily' | 'weekly' | 'biweekly' | 'monthly'
  weekday?: number
}

export interface ScheduledMessageInput {
  channel: 'moodle' | 'whatsapp'
  messageContent: string
  moodleConnectionId?: string
  notes?: string
  schedule: CampaignScheduleInput
  scheduledAt: string
  selectedRecipients: CampaignRecipientSelection[]
  templateId?: string
  title: string
  whatsappInstanceId?: string
}

export type CampaignsPayload =
  | {
      action: 'list_bulk_jobs'
      filters: { search?: string; statuses?: BulkJobStatusDto[] }
      order: 'createdAtDesc'
      page: number
      pageSize: number
    }
  | { action: 'get_bulk_job_detail'; jobId: string }
  | {
      action: 'list_bulk_job_recipients'
      jobId: string
      order: 'studentNameAsc'
      page: number
      pageSize: number
    }
  | {
      action: 'list_scheduled_messages'
      filters: { search?: string; statuses?: ScheduledMessageStatusDto[] }
      order: 'scheduledAtAsc'
      page: number
      pageSize: number
    }
  | { action: 'create_scheduled_message'; input: ScheduledMessageInput }
  | { action: 'update_scheduled_message'; input: ScheduledMessageInput; messageId: string }
  | {
      action: 'transition_scheduled_message'
      messageId: string
      transition: 'pause' | 'resume' | 'cancel'
    }
  | { action: 'delete_scheduled_message'; messageId: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_PAGE = 1_000_000
const MAX_PAGE_SIZE = 1_000
const MAX_RECIPIENTS = 1_000
const SCHEDULE_TYPES = ['specific_date', 'daily', 'weekly', 'biweekly', 'monthly'] as const

function invalid(field: string): never {
  throw new RequestBodyValidationError(`Invalid ${field}`, 422)
}

function exactFields(body: Record<string, unknown>, fields: string[]) {
  const allowed = new Set(fields)
  if (Object.keys(body).some((field) => !allowed.has(field))) invalid('request fields')
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field)
  return value as Record<string, unknown>
}

function string(value: unknown, field: string, maximum: number, required = false): string | undefined {
  if (value === undefined) {
    if (required) invalid(field)
    return undefined
  }
  if (typeof value !== 'string') invalid(field)
  const parsed = value.trim()
  if ((required && !parsed) || parsed.length > maximum) invalid(field)
  return parsed || undefined
}

function uuid(value: unknown, field: string, required = true): string | undefined {
  if (value === undefined && !required) return undefined
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) invalid(field)
  return value
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) invalid(field)
  return new Date(value).toISOString()
}

function date(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) invalid(field)
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) invalid(field)
  return value
}

function positiveInteger(value: unknown, field: string, fallback: number, maximum: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) invalid(field)
  return value as number
}

function statuses<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || !allowed.includes(entry as T))) {
    invalid(field)
  }
  return [...new Set(value as T[])]
}

function filters<T extends string>(
  value: unknown,
  allowedStatuses: readonly T[],
): { search?: string; statuses?: T[] } {
  if (value === undefined) return {}
  const parsed = object(value, 'filters')
  exactFields(parsed, ['search', 'statuses'])
  const search = string(parsed.search, 'filters.search', 200)
  const parsedStatuses = statuses(parsed.statuses, 'filters.statuses', allowedStatuses)
  return {
    ...(search ? { search } : {}),
    ...(parsedStatuses ? { statuses: parsedStatuses } : {}),
  }
}

function recipients(value: unknown): CampaignRecipientSelection[] {
  if (!Array.isArray(value) || value.length > MAX_RECIPIENTS) invalid('input.selectedRecipients')
  return value.map((raw, index) => {
    const recipient = object(raw, `input.selectedRecipients[${index}]`)
    exactFields(recipient, ['personalizedMessage', 'studentId'])
    const personalizedMessage = string(
      recipient.personalizedMessage,
      `input.selectedRecipients[${index}].personalizedMessage`,
      12_000,
    )
    return {
      ...(personalizedMessage ? { personalizedMessage } : {}),
      studentId: uuid(recipient.studentId, `input.selectedRecipients[${index}].studentId`) as string,
    }
  })
}

function schedule(value: unknown): CampaignScheduleInput {
  const parsed = object(value, 'input.schedule')
  exactFields(parsed, ['endDate', 'monthlyDay', 'startDate', 'time', 'type', 'weekday'])
  if (typeof parsed.type !== 'string' || !SCHEDULE_TYPES.includes(parsed.type as CampaignScheduleInput['type'])) {
    invalid('input.schedule.type')
  }
  const startDate = date(parsed.startDate, 'input.schedule.startDate')
  const endDate = date(parsed.endDate, 'input.schedule.endDate')
  if (startDate && endDate && startDate > endDate) invalid('input.schedule date range')
  const time = string(parsed.time, 'input.schedule.time', 5)
  if (time && !TIME_PATTERN.test(time)) invalid('input.schedule.time')
  const weekday = parsed.weekday
  if (weekday !== undefined && (!Number.isSafeInteger(weekday) || (weekday as number) < 0 || (weekday as number) > 6)) {
    invalid('input.schedule.weekday')
  }
  const monthlyDay = parsed.monthlyDay
  if (monthlyDay !== undefined && (!Number.isSafeInteger(monthlyDay) || (monthlyDay as number) < 1 || (monthlyDay as number) > 31)) {
    invalid('input.schedule.monthlyDay')
  }
  return {
    ...(endDate ? { endDate } : {}),
    ...(monthlyDay !== undefined ? { monthlyDay: monthlyDay as number } : {}),
    ...(startDate ? { startDate } : {}),
    ...(time ? { time } : {}),
    type: parsed.type as CampaignScheduleInput['type'],
    ...(weekday !== undefined ? { weekday: weekday as number } : {}),
  }
}

function scheduledInput(value: unknown): ScheduledMessageInput {
  const input = object(value, 'input')
  exactFields(input, [
    'channel',
    'messageContent',
    'moodleConnectionId',
    'notes',
    'schedule',
    'scheduledAt',
    'selectedRecipients',
    'templateId',
    'title',
    'whatsappInstanceId',
  ])
  if (input.channel !== 'moodle' && input.channel !== 'whatsapp') invalid('input.channel')
  const moodleConnectionId = uuid(input.moodleConnectionId, 'input.moodleConnectionId', false)
  return {
    channel: input.channel,
    messageContent: string(input.messageContent, 'input.messageContent', 12_000, true) as string,
    ...(moodleConnectionId ? { moodleConnectionId } : {}),
    ...(string(input.notes, 'input.notes', 4_000) ? { notes: string(input.notes, 'input.notes', 4_000) } : {}),
    schedule: schedule(input.schedule),
    scheduledAt: timestamp(input.scheduledAt, 'input.scheduledAt'),
    selectedRecipients: recipients(input.selectedRecipients),
    ...(uuid(input.templateId, 'input.templateId', false) ? { templateId: input.templateId as string } : {}),
    title: string(input.title, 'input.title', 240, true) as string,
    ...(uuid(input.whatsappInstanceId, 'input.whatsappInstanceId', false)
      ? { whatsappInstanceId: input.whatsappInstanceId as string }
      : {}),
  }
}

export function parseCampaignsPayload(rawBody: unknown): CampaignsPayload {
  const body = expectBodyObject(rawBody)
  switch (body.action) {
    case 'list_bulk_jobs':
      exactFields(body, ['action', 'filters', 'order', 'page', 'pageSize'])
      if (body.order !== undefined && body.order !== 'createdAtDesc') invalid('order')
      return {
        action: 'list_bulk_jobs',
        filters: filters(body.filters, BULK_JOB_STATUSES),
        order: 'createdAtDesc',
        page: positiveInteger(body.page, 'page', 1, MAX_PAGE),
        pageSize: positiveInteger(body.pageSize, 'pageSize', 30, MAX_PAGE_SIZE),
      }
    case 'get_bulk_job_detail':
      exactFields(body, ['action', 'jobId'])
      return { action: 'get_bulk_job_detail', jobId: uuid(body.jobId, 'jobId') as string }
    case 'list_bulk_job_recipients':
      exactFields(body, ['action', 'jobId', 'order', 'page', 'pageSize'])
      if (body.order !== undefined && body.order !== 'studentNameAsc') invalid('order')
      return {
        action: 'list_bulk_job_recipients',
        jobId: uuid(body.jobId, 'jobId') as string,
        order: 'studentNameAsc',
        page: positiveInteger(body.page, 'page', 1, MAX_PAGE),
        pageSize: positiveInteger(body.pageSize, 'pageSize', 1_000, MAX_PAGE_SIZE),
      }
    case 'list_scheduled_messages':
      exactFields(body, ['action', 'filters', 'order', 'page', 'pageSize'])
      if (body.order !== undefined && body.order !== 'scheduledAtAsc') invalid('order')
      return {
        action: 'list_scheduled_messages',
        filters: filters(body.filters, SCHEDULED_MESSAGE_STATUSES),
        order: 'scheduledAtAsc',
        page: positiveInteger(body.page, 'page', 1, MAX_PAGE),
        pageSize: positiveInteger(body.pageSize, 'pageSize', 30, MAX_PAGE_SIZE),
      }
    case 'create_scheduled_message':
      exactFields(body, ['action', 'input'])
      return { action: 'create_scheduled_message', input: scheduledInput(body.input) }
    case 'update_scheduled_message':
      exactFields(body, ['action', 'input', 'messageId'])
      return {
        action: 'update_scheduled_message',
        input: scheduledInput(body.input),
        messageId: uuid(body.messageId, 'messageId') as string,
      }
    case 'transition_scheduled_message':
      exactFields(body, ['action', 'messageId', 'transition'])
      if (!['pause', 'resume', 'cancel'].includes(String(body.transition))) invalid('transition')
      return {
        action: 'transition_scheduled_message',
        messageId: uuid(body.messageId, 'messageId') as string,
        transition: body.transition as 'pause' | 'resume' | 'cancel',
      }
    case 'delete_scheduled_message':
      exactFields(body, ['action', 'messageId'])
      return { action: 'delete_scheduled_message', messageId: uuid(body.messageId, 'messageId') as string }
    default:
      invalid('action')
  }
}
