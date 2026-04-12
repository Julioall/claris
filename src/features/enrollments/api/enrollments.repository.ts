/**
 * Enrollments repository — all Supabase data access for the management panel.
 *
 * Reads exclusively from the `uc_enrollments` table (populated via JSON import).
 * No Moodle calls are made here.
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  EnrollmentDashboardData,
  EnrollmentDashboardFilters,
  EnrollmentDashboardOptions,
  EnrollmentFilters,
  EnrollmentListPage,
  EnrollmentSummary,
} from '../types';
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

export async function fetchEnrollmentDashboard(
  filters: EnrollmentDashboardFilters,
): Promise<EnrollmentDashboardData> {
  const { data, error } = await supabase.rpc('get_uc_enrollments_dashboard', {
    p_start_date: filters.startDate || undefined,
    p_end_date: filters.endDate || undefined,
    p_tutor: filters.tutor || undefined,
    p_school: filters.school || undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = (data ?? {}) as Partial<EnrollmentDashboardData>;

  return {
    overview: {
      rows: result.overview?.rows ?? 0,
      students: result.overview?.students ?? 0,
      tutors: result.overview?.tutors ?? 0,
      schools: result.overview?.schools ?? 0,
      courses: result.overview?.courses ?? 0,
      units: result.overview?.units ?? 0,
      activeStudents: result.overview?.activeStudents ?? 0,
      suspendedStudents: result.overview?.suspendedStudents ?? 0,
      completedStudents: result.overview?.completedStudents ?? 0,
      neverAccessedStudents: result.overview?.neverAccessedStudents ?? 0,
      averageGrade: result.overview?.averageGrade ?? null,
      activeRate: result.overview?.activeRate ?? null,
      neverAccessRate: result.overview?.neverAccessRate ?? null,
    },
    roleBreakdown: result.roleBreakdown ?? [],
    statusBreakdown: result.statusBreakdown ?? [],
    accessBreakdown: result.accessBreakdown ?? [],
    monthlyTrend: result.monthlyTrend ?? [],
    topSchools: result.topSchools ?? [],
    topTutors: result.topTutors ?? [],
    topMonitors: result.topMonitors ?? [],
    topCourses: result.topCourses ?? [],
  };
}

export async function fetchEnrollmentDashboardOptions(): Promise<EnrollmentDashboardOptions> {
  const normalize = (value: string | null | undefined) => (
    (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
  );

  const loadTutorsFallback = async () => {
    const { data, error } = await supabase
      .from('uc_enrollments')
      .select('nome_pessoa, papel')
      .not('nome_pessoa', 'is', null);

    if (error) return [];

    const uniqueTutors = new Set<string>();

    (data ?? []).forEach((row) => {
      const role = normalize((row as { papel?: string | null }).papel);
      const name = (row as { nome_pessoa?: string | null }).nome_pessoa?.trim();
      if (!name) return;

      if (role === 'tutor' || role.includes('tutor')) {
        uniqueTutors.add(name);
      }
    });

    return Array.from(uniqueTutors).sort((left, right) => left.localeCompare(right, 'pt-BR'));
  };

  const { data, error } = await supabase.rpc('get_uc_enrollments_dashboard_options');

  if (error) {
    const tutors = await loadTutorsFallback();

    return {
      schools: [],
      tutors,
      dateRange: {
        min: null,
        max: null,
      },
    };
  }

  const result = (data ?? {}) as Partial<EnrollmentDashboardOptions>;
  const rpcTutors = (result.tutors ?? []).filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const tutors = rpcTutors.length > 0 ? rpcTutors : await loadTutorsFallback();

  return {
    schools: result.schools ?? [],
    tutors,
    dateRange: {
      min: result.dateRange?.min ?? null,
      max: result.dateRange?.max ?? null,
    },
  };
}
