import { ApiError } from '../_shared/http/mod.ts'
import {
  ADMIN_OBSERVABILITY_CONTRACT_VERSION,
  type AdminDashboardSummaryDto,
  type AdminMoodleSyncOperationalMetricsDto,
} from './contract.ts'
import {
  mapConversation,
  mapErrorLog,
  mapMoodleSyncOperationalMetric,
  mapUsageEvent,
  pageDto,
} from './mapper.ts'
import type { AdminObservabilityPayload } from './payload.ts'
import type { AdminObservabilityRepository } from './repository.ts'

const TIME_ZONE = 'America/Sao_Paulo' as const
const DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function dayKey(value: Date | string): string {
  return DAY_FORMATTER.format(typeof value === 'string' ? new Date(value) : value)
}

export async function getAdminDashboardSummary(
  repository: AdminObservabilityRepository,
  now = new Date(),
): Promise<AdminDashboardSummaryDto> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const [counts, recentEvents] = await Promise.all([
    repository.countDashboard(),
    repository.listRecentUsageEvents(since.toISOString()),
  ])
  const countsByDay = new Map<string, number>()
  for (const event of recentEvents) {
    const key = dayKey(event.created_at)
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1)
  }
  const usageTrend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getTime() - (6 - index) * 24 * 60 * 60 * 1000)
    const day = dayKey(date)
    return { day, count: countsByDay.get(day) ?? 0 }
  })

  return {
    contractVersion: ADMIN_OBSERVABILITY_CONTRACT_VERSION,
    counts,
    generatedAt: now.toISOString(),
    timeZone: TIME_ZONE,
    usageTrend,
  }
}

export async function getMoodleSyncOperationalMetrics(
  repository: AdminObservabilityRepository,
  input: { stuckAfterSeconds: number; windowHours: number },
  now = new Date(),
): Promise<AdminMoodleSyncOperationalMetricsDto> {
  const rows = await repository.listMoodleSyncOperationalMetrics(input)
  return {
    contractVersion: ADMIN_OBSERVABILITY_CONTRACT_VERSION,
    generatedAt: now.toISOString(),
    windowHours: input.windowHours,
    stuckAfterSeconds: input.stuckAfterSeconds,
    items: rows.map(mapMoodleSyncOperationalMetric),
  }
}

export async function executeAdminObservability(
  repository: AdminObservabilityRepository,
  actorId: string,
  payload: Exclude<AdminObservabilityPayload, { action: 'get_dashboard' }>,
) {
  if (payload.action === 'get_moodle_sync_metrics') {
    return getMoodleSyncOperationalMetrics(repository, {
      windowHours: payload.windowHours,
      stuckAfterSeconds: payload.stuckAfterSeconds,
    })
  }
  if (payload.action === 'resolve_error_log') {
    const row = await repository.resolveErrorLog(actorId, payload.logId, new Date().toISOString())
    if (!row) throw ApiError.notFound('Error log not found.')
    return { contractVersion: ADMIN_OBSERVABILITY_CONTRACT_VERSION, log: mapErrorLog(row) }
  }
  if (payload.action === 'list_usage_events') {
    const result = await repository.listUsageEvents(payload)
    return pageDto(result.rows.map(mapUsageEvent), payload.page, payload.pageSize, result.totalCount)
  }
  if (payload.action === 'list_error_logs') {
    const result = await repository.listErrorLogs(payload)
    return pageDto(result.rows.map(mapErrorLog), payload.page, payload.pageSize, result.totalCount)
  }
  const result = await repository.listConversations(payload)
  return pageDto(result.rows.map(mapConversation), payload.page, payload.pageSize, result.totalCount)
}
