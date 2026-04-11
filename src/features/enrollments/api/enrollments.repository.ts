/**
 * Enrollments repository — all Supabase data access for the management panel.
 *
 * Reads exclusively from the `uc_enrollments` table (populated via JSON import).
 * No Moodle calls are made here.
 */

import { supabase } from '@/integrations/supabase/client';
import type { EnrollmentFilters, EnrollmentListPage, EnrollmentSummary } from '../types';
import { mapDbRowToEnrollment } from '../lib/mappers';

export const ENROLLMENTS_PAGE_SIZE = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Paginated list
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchEnrollmentsPage(
  filters: EnrollmentFilters,
  page: number,
  pageSize = ENROLLMENTS_PAGE_SIZE,
): Promise<EnrollmentListPage> {
  const { data, error } = await supabase.rpc('list_uc_enrollments_paginated', {
    p_search:    filters.search    || undefined,
    p_papel:     filters.papel     || undefined,
    p_status_uc: filters.statusUc  || undefined,
    p_categoria: filters.categoria || undefined,
    p_nome_uc:   filters.nomeUc    || undefined,
    p_page:      page,
    p_page_size: pageSize,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = data as { total: number; items: Record<string, unknown>[] };

  return {
    totalCount: result.total ?? 0,
    items: (result.items ?? []).map((row) =>
      mapDbRowToEnrollment(row as Parameters<typeof mapDbRowToEnrollment>[0])
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Distinct filter values (for dropdown options)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchDistinctEnrollmentValues(
  column: 'papel' | 'status_uc' | 'categoria' | 'nome_uc',
): Promise<string[]> {
  const { data, error } = await supabase
    .from('uc_enrollments')
    .select(column)
    .not(column, 'is', null)
    .order(column);

  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of data ?? []) {
    const val = (row as Record<string, unknown>)[column];
    if (typeof val === 'string' && val && !seen.has(val)) {
      seen.add(val);
      result.push(val);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary indicators
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchEnrollmentSummary(): Promise<EnrollmentSummary> {
  const { data, error } = await supabase
    .from('uc_enrollments')
    .select('papel, status_uc');

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const byRole: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const row of rows) {
    const role = row.papel ?? 'Desconhecido';
    byRole[role] = (byRole[role] ?? 0) + 1;

    const status = row.status_uc ?? 'Desconhecido';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return {
    total: rows.length,
    byRole,
    byStatus,
  };
}
