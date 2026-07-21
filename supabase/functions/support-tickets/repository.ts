import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
  type Tables,
} from '../_shared/db/mod.ts'
import type { SupportTicketsPayload } from './payload.ts'

export type SupportTicketRow = Tables<'support_tickets'>

export interface SupportTicketsRepository {
  createTicket(input: {
    actorId: string
    context: Record<string, unknown>
    description: string
    route: string
    title: string
    type: Extract<SupportTicketsPayload, { action: 'create_ticket' }>['type']
  }): Promise<SupportTicketRow>
  isApplicationAdmin(actorId: string): Promise<boolean>
  listTickets(filters: Extract<SupportTicketsPayload, { action: 'list_tickets' }>): Promise<{
    rows: SupportTicketRow[]
    totalCount: number
  }>
  updateTicket(input: {
    actorId: string
    adminNotes: string
    resolvedAt: string | null
    status: Extract<SupportTicketsPayload, { action: 'update_ticket' }>['status']
    ticketId: string
  }): Promise<SupportTicketRow | null>
}

function safeSearch(value: string | undefined): string | undefined {
  const normalized = value?.replace(/[\\%*,()."_]/g, ' ').replace(/\s+/g, ' ').trim()
  return normalized || undefined
}

export function createSupportTicketsRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): SupportTicketsRepository {
  return {
    isApplicationAdmin(actorId) {
      return isApplicationAdmin(supabase, actorId)
    },

    async createTicket(input) {
      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          user_id: input.actorId,
          type: input.type,
          title: input.title,
          description: input.description,
          route: input.route,
          context: input.context,
          status: 'aberto',
          priority: 'normal',
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },

    async listTickets(filters) {
      const from = (filters.page - 1) * filters.pageSize
      let query = supabase
        .from('support_tickets')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, from + filters.pageSize - 1)
      if (filters.status) query = query.eq('status', filters.status)
      if (filters.type) query = query.eq('type', filters.type)
      const search = safeSearch(filters.search)
      if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
      const { data, error, count } = await query
      if (error) throw error
      return { rows: data ?? [], totalCount: count ?? 0 }
    },

    async updateTicket(input) {
      const { data, error } = await supabase
        .from('support_tickets')
        .update({
          status: input.status,
          admin_notes: input.adminNotes || null,
          assigned_to: input.actorId,
          resolved_at: input.resolvedAt,
        })
        .eq('id', input.ticketId)
        .select('*')
        .maybeSingle()
      if (error) throw error
      return data
    },
  }
}
