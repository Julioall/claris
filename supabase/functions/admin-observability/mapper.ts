import { redactSensitiveObject } from '../_shared/security/redaction.ts'
import {
  ADMIN_OBSERVABILITY_CONTRACT_VERSION,
  type AdminClarisConversationDto,
  type AdminConversationMessageDto,
  type AdminErrorLogDto,
  type AdminMoodleSyncOperationalMetricDto,
  type AdminPageDto,
  type AdminUsageEventDto,
} from './contract.ts'
import type {
  AdminConversationRow,
  AdminErrorLogRow,
  MoodleSyncOperationalMetricRow,
  AdminUsageEventRow,
} from './repository.ts'

export function pageDto<TItem>(
  items: TItem[],
  page: number,
  pageSize: number,
  totalCount: number,
): AdminPageDto<TItem> {
  return {
    contractVersion: ADMIN_OBSERVABILITY_CONTRACT_VERSION,
    items,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  }
}

export function mapMoodleSyncOperationalMetric(
  row: MoodleSyncOperationalMetricRow,
): AdminMoodleSyncOperationalMetricDto {
  return {
    siteSlug: row.site_slug,
    connectionId: row.moodle_connection_id,
    window: {
      startedAt: row.window_started_at,
      endedAt: row.window_ended_at,
    },
    jobs: {
      started: row.jobs_started,
      completed: row.jobs_completed,
      failed: row.jobs_failed,
    },
    activeJobs: row.active_jobs,
    items: {
      completed: row.completed_items,
      failed: row.failed_items,
      stuck: row.stuck_items,
      oldestStuckAt: row.oldest_stuck_at,
    },
    retryAttempts: row.retry_attempts,
    transport: {
      apiCalls: row.moodle_api_calls,
      responseBytes: row.moodle_response_bytes,
    },
    durations: {
      averageJobMs: row.avg_job_duration_ms,
      p95JobMs: row.p95_job_duration_ms,
      averageItemMs: row.avg_item_duration_ms,
      p95ItemMs: row.p95_item_duration_ms,
    },
    circuit: {
      state: row.circuit_state === 'open' ? 'open' : 'closed',
      openUntil: row.circuit_open_until,
    },
  }
}

export function mapUsageEvent(row: AdminUsageEventRow): AdminUsageEventDto {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    route: row.route,
    resource: row.resource,
    metadata: redactSensitiveObject(row.metadata),
    createdAt: row.created_at,
  }
}

export function mapErrorLog(row: AdminErrorLogRow): AdminErrorLogDto {
  return {
    id: row.id,
    userId: row.user_id,
    severity: row.severity,
    category: row.category,
    message: row.message,
    payload: redactSensitiveObject(row.payload),
    context: redactSensitiveObject(row.context),
    resolved: row.resolved,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
  }
}

function messages(value: unknown): AdminConversationMessageDto[] {
  if (!Array.isArray(value)) return []
  return value.slice(-100).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const raw = item as Record<string, unknown>
    if (typeof raw.content !== 'string') return []
    return [{
      role: typeof raw.role === 'string' ? raw.role.slice(0, 40) : 'unknown',
      content: raw.content.slice(0, 32000),
    }]
  })
}

export function mapConversation(row: AdminConversationRow): AdminClarisConversationDto {
  const messageCount = Array.isArray(row.messages) ? row.messages.length : 0
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    messages: messages(row.messages),
    messageCount,
    messagesTruncated: messageCount > 100,
    lastContextRoute: row.last_context_route,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
