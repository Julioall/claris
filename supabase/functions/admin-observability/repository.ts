import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
  type Tables,
} from '../_shared/db/mod.ts'

export type AdminErrorLogRow = Tables<'app_error_logs'>
export type AdminUsageEventRow = Tables<'app_usage_events'>
export type AdminConversationRow = Tables<'claris_conversations'>

/**
 * The database RPC returns only aggregated operational facts. Keep this
 * separate from Tables<> because it is a deliberately sanitised projection,
 * not a browsable persistence model.
 */
export interface MoodleSyncOperationalMetricRow {
  active_jobs: number
  avg_item_duration_ms: number
  avg_job_duration_ms: number
  circuit_open_until: string | null
  circuit_state: string
  completed_items: number
  failed_items: number
  jobs_completed: number
  jobs_failed: number
  jobs_started: number
  moodle_connection_id: string
  moodle_api_calls: number
  moodle_response_bytes: number
  oldest_stuck_at: string | null
  p95_item_duration_ms: number
  p95_job_duration_ms: number
  retry_attempts: number
  site_slug: string
  stuck_items: number
  window_ended_at: string
  window_started_at: string
}

interface PageResult<TRow> {
  rows: TRow[]
  totalCount: number
}

interface UsageFilters {
  dateFrom?: string
  dateTo?: string
  eventType?: string
  page: number
  pageSize: number
  search?: string
  userId?: string
}

interface ErrorLogFilters {
  category?: string
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
  resolved?: boolean
  search?: string
  severity?: string
}

export interface MoodleSyncOperationalMetricsFilters {
  stuckAfterSeconds: number
  windowHours: number
}

export interface AdminObservabilityRepository {
  countDashboard(): Promise<{
    clarisConversations: number
    openErrorLogs: number
    openSupportTickets: number
    usageEvents: number
    users: number
  }>
  isApplicationAdmin(actorId: string): Promise<boolean>
  listConversations(filters: { page: number; pageSize: number; search?: string }): Promise<PageResult<AdminConversationRow>>
  listErrorLogs(filters: ErrorLogFilters): Promise<PageResult<AdminErrorLogRow>>
  listMoodleSyncOperationalMetrics(
    filters: MoodleSyncOperationalMetricsFilters,
  ): Promise<MoodleSyncOperationalMetricRow[]>
  listRecentUsageEvents(sinceIso: string): Promise<Array<{ created_at: string }>>
  listUsageEvents(filters: UsageFilters): Promise<PageResult<AdminUsageEventRow>>
  resolveErrorLog(actorId: string, logId: string, resolvedAt: string): Promise<AdminErrorLogRow | null>
}

type MoodleObservabilityRpcClient = {
  rpc(
    name: 'backend_get_moodle_sync_operational_metrics',
    parameters: { p_stuck_after_seconds: number; p_window_hours: number },
  ): Promise<{ data: unknown; error: unknown }>
}

function range(page: number, pageSize: number) {
  const from = (page - 1) * pageSize
  return { from, to: from + pageSize - 1 }
}

function safeSearch(value: string | undefined): string | undefined {
  const normalized = value?.replace(/[\\%*,()."_]/g, ' ').replace(/\s+/g, ' ').trim()
  return normalized || undefined
}

function assertNoError(error: unknown): void {
  if (error) throw error
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid Moodle operational metric field: ${field}`)
  }
  return value
}

function requiredNumber(row: Record<string, unknown>, field: string): number {
  const value = row[field]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid Moodle operational metric field: ${field}`)
  }
  return value
}

function optionalIsoDate(row: Record<string, unknown>, field: string): string | null {
  const value = row[field]
  if (value === null) return null
  return requiredString(row, field)
}

function mapMoodleSyncOperationalMetricRow(value: unknown): MoodleSyncOperationalMetricRow {
  if (!isRecord(value)) throw new Error('Invalid Moodle operational metric response')
  return {
    site_slug: requiredString(value, 'site_slug'),
    moodle_connection_id: requiredString(value, 'moodle_connection_id'),
    moodle_api_calls: requiredNumber(value, 'moodle_api_calls'),
    moodle_response_bytes: requiredNumber(value, 'moodle_response_bytes'),
    window_started_at: requiredString(value, 'window_started_at'),
    window_ended_at: requiredString(value, 'window_ended_at'),
    jobs_started: requiredNumber(value, 'jobs_started'),
    jobs_completed: requiredNumber(value, 'jobs_completed'),
    jobs_failed: requiredNumber(value, 'jobs_failed'),
    active_jobs: requiredNumber(value, 'active_jobs'),
    completed_items: requiredNumber(value, 'completed_items'),
    failed_items: requiredNumber(value, 'failed_items'),
    retry_attempts: requiredNumber(value, 'retry_attempts'),
    stuck_items: requiredNumber(value, 'stuck_items'),
    oldest_stuck_at: optionalIsoDate(value, 'oldest_stuck_at'),
    avg_job_duration_ms: requiredNumber(value, 'avg_job_duration_ms'),
    p95_job_duration_ms: requiredNumber(value, 'p95_job_duration_ms'),
    avg_item_duration_ms: requiredNumber(value, 'avg_item_duration_ms'),
    p95_item_duration_ms: requiredNumber(value, 'p95_item_duration_ms'),
    circuit_state: requiredString(value, 'circuit_state'),
    circuit_open_until: optionalIsoDate(value, 'circuit_open_until'),
  }
}

export function createAdminObservabilityRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): AdminObservabilityRepository {
  return {
    isApplicationAdmin(actorId) {
      return isApplicationAdmin(supabase, actorId)
    },

    async countDashboard() {
      const [users, usage, errors, tickets, conversations] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('app_usage_events').select('*', { count: 'exact', head: true }),
        supabase.from('app_error_logs').select('*', { count: 'exact', head: true }).eq('resolved', false),
        supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'aberto'),
        supabase.from('claris_conversations').select('*', { count: 'exact', head: true }),
      ])
      for (const result of [users, usage, errors, tickets, conversations]) assertNoError(result.error)
      return {
        users: users.count ?? 0,
        usageEvents: usage.count ?? 0,
        openErrorLogs: errors.count ?? 0,
        openSupportTickets: tickets.count ?? 0,
        clarisConversations: conversations.count ?? 0,
      }
    },

    async listRecentUsageEvents(sinceIso) {
      const { data, error } = await supabase
        .from('app_usage_events')
        .select('created_at')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },

    async listMoodleSyncOperationalMetrics(filters) {
      const { data, error } = await (supabase as unknown as MoodleObservabilityRpcClient).rpc(
        'backend_get_moodle_sync_operational_metrics',
        {
          p_window_hours: filters.windowHours,
          p_stuck_after_seconds: filters.stuckAfterSeconds,
        },
      )
      if (error) throw error
      if (!Array.isArray(data)) throw new Error('Invalid Moodle operational metrics response')
      return data.map(mapMoodleSyncOperationalMetricRow)
    },

    async listUsageEvents(filters) {
      const bounds = range(filters.page, filters.pageSize)
      let query = supabase
        .from('app_usage_events')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(bounds.from, bounds.to)
      if (filters.eventType) query = query.eq('event_type', filters.eventType)
      if (filters.userId) query = query.eq('user_id', filters.userId)
      if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
      if (filters.dateTo) query = query.lte('created_at', filters.dateTo)
      const search = safeSearch(filters.search)
      if (search) query = query.or(`event_type.ilike.%${search}%,route.ilike.%${search}%`)
      const { data, error, count } = await query
      if (error) throw error
      return { rows: data ?? [], totalCount: count ?? 0 }
    },

    async listErrorLogs(filters) {
      const bounds = range(filters.page, filters.pageSize)
      let query = supabase
        .from('app_error_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(bounds.from, bounds.to)
      if (filters.severity) query = query.eq('severity', filters.severity)
      if (filters.category) query = query.eq('category', filters.category)
      if (typeof filters.resolved === 'boolean') query = query.eq('resolved', filters.resolved)
      if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
      if (filters.dateTo) query = query.lte('created_at', filters.dateTo)
      const search = safeSearch(filters.search)
      if (search) query = query.ilike('message', `%${search}%`)
      const { data, error, count } = await query
      if (error) throw error
      return { rows: data ?? [], totalCount: count ?? 0 }
    },

    async resolveErrorLog(actorId, logId, resolvedAt) {
      const { data, error } = await supabase
        .from('app_error_logs')
        .update({ resolved: true, resolved_at: resolvedAt, resolved_by: actorId })
        .eq('id', logId)
        .select('*')
        .maybeSingle()
      if (error) throw error
      return data
    },

    async listConversations(filters) {
      const bounds = range(filters.page, filters.pageSize)
      let query = supabase
        .from('claris_conversations')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(bounds.from, bounds.to)
      const search = safeSearch(filters.search)
      if (search) query = query.ilike('title', `%${search}%`)
      const { data, error, count } = await query
      if (error) throw error
      return { rows: data ?? [], totalCount: count ?? 0 }
    },
  }
}
