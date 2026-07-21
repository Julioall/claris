import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';
import type {
  AdminClarisConversationDto,
  AdminPageDto,
} from './contracts/admin-observability.contract';

export interface AdminConversationsFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listAdminConversations(filters: AdminConversationsFilters = {}) {
  return invokeEdgeFunction<AdminPageDto<AdminClarisConversationDto>>('admin-observability', {
    body: {
      action: 'list_claris_conversations',
      search: filters.search,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 30,
    },
  });
}
