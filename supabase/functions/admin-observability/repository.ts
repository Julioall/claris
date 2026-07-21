import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
  type Tables,
} from '../_shared/db/mod.ts'

export type AdminErrorLogRow = Tables<'app_error_logs'>
export type AdminUsageEventRow = Tables<'app_usage_events'>
export type AdminConversationRow = Tables<'claris_conversations'>

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
  listRecentUsageEvents(sinceIso: string): Promise<Array<{ created_at: string }>>
  listUsageEvents(filters: UsageFilters): Promise<PageResult<AdminUsageEventRow>>
  resolveErrorLog(actorId: string, logId: string, resolvedAt: string): Promise<AdminErrorLogRow | null>
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
