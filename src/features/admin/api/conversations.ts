import { supabase } from '@/integrations/supabase/client';

export interface AdminConversationsFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedAdminConversations {
  items: unknown[];
  totalCount: number;
}

export async function listAdminConversations(filters: AdminConversationsFilters = {}) {
  const { page = 1, pageSize = 30, search } = filters;
  const normalizedPage = Math.max(page, 1);
  const normalizedPageSize = Math.min(Math.max(pageSize, 1), 100);
  const from = (normalizedPage - 1) * normalizedPageSize;
  const to = from + normalizedPageSize - 1;

  let query = supabase
    .from('claris_conversations')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (search?.trim()) {
    const normalizedSearch = search.trim();
    query = query.ilike('title', `%${normalizedSearch}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    items: data ?? [],
    totalCount: count ?? 0,
  };
}
