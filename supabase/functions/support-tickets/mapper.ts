import { redactSensitiveObject } from '../_shared/security/redaction.ts'
import {
  SUPPORT_TICKETS_CONTRACT_VERSION,
  type SupportTicketDto,
  type SupportTicketPageDto,
} from './contract.ts'
import type { SupportTicketRow } from './repository.ts'

export function mapSupportTicket(row: SupportTicketRow): SupportTicketDto {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description,
    route: row.route,
    context: redactSensitiveObject(row.context),
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to,
    adminNotes: row.admin_notes,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function supportTicketPageDto(
  rows: SupportTicketRow[],
  page: number,
  pageSize: number,
  totalCount: number,
): SupportTicketPageDto {
  return {
    contractVersion: SUPPORT_TICKETS_CONTRACT_VERSION,
    items: rows.map(mapSupportTicket),
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  }
}
