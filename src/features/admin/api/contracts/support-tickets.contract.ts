export const SUPPORT_TICKETS_CONTRACT_VERSION = 1 as const;

export interface SupportTicketDto {
  adminNotes: string | null;
  assignedTo: string | null;
  context: Record<string, unknown>;
  createdAt: string;
  description: string;
  id: string;
  priority: string;
  resolvedAt: string | null;
  route: string | null;
  status: string;
  title: string;
  type: string;
  updatedAt: string;
  userId: string | null;
}

export interface SupportTicketPageDto {
  contractVersion: typeof SUPPORT_TICKETS_CONTRACT_VERSION;
  items: SupportTicketDto[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface SupportTicketMutationDto {
  contractVersion: typeof SUPPORT_TICKETS_CONTRACT_VERSION;
  ticket: SupportTicketDto;
}
