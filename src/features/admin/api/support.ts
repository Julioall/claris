import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';
import type {
  SupportTicketMutationDto,
  SupportTicketPageDto,
} from './contracts/support-tickets.contract';

export interface SupportTicketFilters {
  status?: string;
  type?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface SupportTicketUpdate {
  adminNotes: string;
  status: string;
}

export interface CreateSupportTicketInput {
  type: string;
  title: string;
  description: string;
  route: string;
}

export async function listSupportTickets(filters: SupportTicketFilters = {}) {
  return invokeEdgeFunction<SupportTicketPageDto>('support-tickets', {
    body: {
      action: 'list_tickets',
      status: filters.status,
      type: filters.type,
      search: filters.search,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 30,
    },
  });
}

export async function updateSupportTicket(ticketId: string, update: SupportTicketUpdate) {
  return invokeEdgeFunction<SupportTicketMutationDto>('support-tickets', {
    body: {
      action: 'update_ticket',
      ticketId,
      status: update.status,
      adminNotes: update.adminNotes,
    },
  });
}

export async function createSupportTicket(input: CreateSupportTicketInput) {
  return invokeEdgeFunction<SupportTicketMutationDto>('support-tickets', {
    body: {
      action: 'create_ticket',
      type: input.type,
      title: input.title,
      description: input.description,
      route: input.route,
    },
  });
}
