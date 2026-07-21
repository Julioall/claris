export const ADMIN_OBSERVABILITY_CONTRACT_VERSION = 1 as const;

export interface AdminPageDto<TItem> {
  contractVersion: typeof ADMIN_OBSERVABILITY_CONTRACT_VERSION;
  items: TItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface AdminDashboardSummaryDto {
  contractVersion: typeof ADMIN_OBSERVABILITY_CONTRACT_VERSION;
  counts: {
    clarisConversations: number;
    openErrorLogs: number;
    openSupportTickets: number;
    usageEvents: number;
    users: number;
  };
  generatedAt: string;
  timeZone: 'America/Sao_Paulo';
  usageTrend: Array<{ count: number; day: string }>;
}

export interface AdminUsageEventDto {
  createdAt: string;
  eventType: string;
  id: string;
  metadata: Record<string, unknown>;
  resource: string | null;
  route: string | null;
  userId: string | null;
}

export interface AdminErrorLogDto {
  category: string;
  context: Record<string, unknown>;
  createdAt: string;
  id: string;
  message: string;
  payload: Record<string, unknown>;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  severity: string;
  userId: string | null;
}

export interface AdminConversationMessageDto {
  content: string;
  role: string;
}

export interface AdminClarisConversationDto {
  createdAt: string;
  id: string;
  lastContextRoute: string | null;
  messageCount: number;
  messages: AdminConversationMessageDto[];
  messagesTruncated: boolean;
  title: string;
  updatedAt: string;
  userId: string;
}

export interface ResolveAdminErrorLogDto {
  contractVersion: typeof ADMIN_OBSERVABILITY_CONTRACT_VERSION;
  log: AdminErrorLogDto;
}
