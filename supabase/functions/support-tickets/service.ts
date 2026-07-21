import { ApiError } from '../_shared/http/mod.ts'
import { SUPPORT_TICKETS_CONTRACT_VERSION } from './contract.ts'
import { mapSupportTicket, supportTicketPageDto } from './mapper.ts'
import type { SupportTicketsPayload } from './payload.ts'
import type { SupportTicketsRepository } from './repository.ts'

export async function executeSupportTickets(
  repository: SupportTicketsRepository,
  actorId: string,
  payload: SupportTicketsPayload,
  requestContext: { correlationId: string; userAgent: string | null },
) {
  if (payload.action === 'create_ticket') {
    const row = await repository.createTicket({
      actorId,
      type: payload.type,
      title: payload.title,
      description: payload.description,
      route: payload.route,
      context: {
        correlationId: requestContext.correlationId,
        ...(requestContext.userAgent ? { userAgent: requestContext.userAgent.slice(0, 1000) } : {}),
      },
    })
    return { contractVersion: SUPPORT_TICKETS_CONTRACT_VERSION, ticket: mapSupportTicket(row) }
  }

  if (payload.action === 'list_tickets') {
    const result = await repository.listTickets(payload)
    return supportTicketPageDto(result.rows, payload.page, payload.pageSize, result.totalCount)
  }

  const resolvedAt = payload.status === 'resolvido' || payload.status === 'fechado'
    ? new Date().toISOString()
    : null
  const row = await repository.updateTicket({
    actorId,
    ticketId: payload.ticketId,
    status: payload.status,
    adminNotes: payload.adminNotes,
    resolvedAt,
  })
  if (!row) throw ApiError.notFound('Support ticket not found.')
  return { contractVersion: SUPPORT_TICKETS_CONTRACT_VERSION, ticket: mapSupportTicket(row) }
}
