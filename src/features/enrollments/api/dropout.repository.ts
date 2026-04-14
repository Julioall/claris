/**
 * Dropout/Evasion KPI repository.
 *
 * Computes student dropout, retention, and engagement KPIs via a server-side
 * Supabase RPC (`get_uc_dropout_kpis`).
 *
 * All computation is performed in the database to avoid downloading the full
 * uc_enrollments dataset to the browser on every filter change.
 */

import { supabase } from '@/integrations/supabase/client';

export interface DropoutKpiFilters {
  startDate?: string;
  endDate?: string;
  tutor?: string;
  school?: string;
  category?: string;
  statusUc?: string;
  excludeSuspended?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public result types
// ─────────────────────────────────────────────────────────────────────────────

export interface DropoutGlobalStats {
  totalStudents: number;
  activeCount: number;
  evadedCount: number;
  activeRate: number;
  dropoutRate: number;
  /** Average days from enrollment to last UC access for evaded students. */
  avgDaysToDropout: number | null;
  /** Average days from enrollment date to UC end date (all students). */
  avgDaysInCourse: number | null;
}

export interface UcDropoutRow {
  ucId: string;
  ucName: string;
  totalStudents: number;
  activeCount: number;
  evadedCount: number;
  dropoutRate: number;
  neverAccessedCount: number;
  neverAccessRate: number;
}

export interface TutorDropoutRow {
  tutorName: string;
  totalStudents: number;
  activeCount: number;
  evadedCount: number;
  dropoutRate: number;
  activeRate: number;
  avgDaysToDropout: number | null;
}

export interface CategoryDropoutRow {
  category: string;
  ucCount: number;
  totalStudents: number;
  activeCount: number;
  evadedCount: number;
  dropoutRate: number;
  activeRate: number;
  accessRate: number;
  avgDaysInCourse: number | null;
}

export interface SchoolRetentionRow {
  school: string;
  totalStudents: number;
  activeCount: number;
  evadedCount: number;
  retentionRate: number;
  dropoutRate: number;
}

export interface DropoutKPIData {
  global: DropoutGlobalStats;
  topUcsByDropout: UcDropoutRow[];
  tutorDropout: TutorDropoutRow[];
  monitorDropout: TutorDropoutRow[];
  categoryDropout: CategoryDropoutRow[];
  schoolRetention: SchoolRetentionRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_DROPOUT: DropoutKPIData = {
  global: {
    totalStudents: 0,
    activeCount: 0,
    evadedCount: 0,
    activeRate: 0,
    dropoutRate: 0,
    avgDaysToDropout: null,
    avgDaysInCourse: null,
  },
  topUcsByDropout: [],
  tutorDropout: [],
  monitorDropout: [],
  categoryDropout: [],
  schoolRetention: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchDropoutKPIs(filters: DropoutKpiFilters = {}): Promise<DropoutKPIData> {
  const { data, error } = await supabase.rpc('get_uc_dropout_kpis', {
    p_start_date:        filters.startDate        || undefined,
    p_end_date:          filters.endDate          || undefined,
    p_tutor:             filters.tutor            || undefined,
    p_school:            filters.school           || undefined,
    p_category:          filters.category         || undefined,
    p_status_uc:         filters.statusUc         || undefined,
    p_exclude_suspended: filters.excludeSuspended ?? false,
  });

  if (error) {
    return { ...EMPTY_DROPOUT };
  }

  const result = (data ?? {}) as Partial<DropoutKPIData>;

  return {
    global: {
      totalStudents:    result.global?.totalStudents    ?? 0,
      activeCount:      result.global?.activeCount      ?? 0,
      evadedCount:      result.global?.evadedCount      ?? 0,
      activeRate:       result.global?.activeRate       ?? 0,
      dropoutRate:      result.global?.dropoutRate      ?? 0,
      avgDaysToDropout: result.global?.avgDaysToDropout ?? null,
      avgDaysInCourse:  result.global?.avgDaysInCourse  ?? null,
    },
    topUcsByDropout: result.topUcsByDropout ?? [],
    tutorDropout:    result.tutorDropout    ?? [],
    monitorDropout:  result.monitorDropout  ?? [],
    categoryDropout: result.categoryDropout ?? [],
    schoolRetention: result.schoolRetention ?? [],
  };
}

