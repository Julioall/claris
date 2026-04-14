/**
 * Workload repository — computes tutor/monitor workload KPIs via a server-side
 * Supabase RPC (`get_uc_workload_kpis`).
 *
 * All computation is performed in the database to avoid downloading the full
 * uc_enrollments dataset to the browser on every filter change.
 */

import { supabase } from '@/integrations/supabase/client';

export interface WorkloadKpiFilters {
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

export interface TutorWorkloadRow {
  tutorName: string;
  totalUcs: number;
  totalStudents: number;
  averageGrade: number | null;
  accessRate: number;
  neverAccessRate: number;
  activeRate: number;
  completionRate: number;
}

export interface WorkloadCategoryBreakdown {
  category: string;
  ucCount: number;
  tutorCount: number;
  studentCount: number;
  completionRate: number;
  accessRate: number;
  averageGrade: number | null;
}

export interface WorkloadKPIData {
  tutors: TutorWorkloadRow[];
  monitors: TutorWorkloadRow[];
  categoryBreakdown: WorkloadCategoryBreakdown[];
  monitorCategoryBreakdown: WorkloadCategoryBreakdown[];
  totalUcs: number;
  totalStudents: number;
  totalTutors: number;
  totalMonitors: number;
  totalTutorUcs: number;
  totalMonitorUcs: number;
  totalTutorStudents: number;
  totalMonitorStudents: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_WORKLOAD: WorkloadKPIData = {
  tutors: [],
  monitors: [],
  categoryBreakdown: [],
  monitorCategoryBreakdown: [],
  totalUcs: 0,
  totalStudents: 0,
  totalTutors: 0,
  totalMonitors: 0,
  totalTutorUcs: 0,
  totalMonitorUcs: 0,
  totalTutorStudents: 0,
  totalMonitorStudents: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Public repository function
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchTutorWorkloadKPIs(filters: WorkloadKpiFilters = {}): Promise<WorkloadKPIData> {
  const { data, error } = await supabase.rpc('get_uc_workload_kpis', {
    p_start_date:        filters.startDate        || undefined,
    p_end_date:          filters.endDate          || undefined,
    p_tutor:             filters.tutor            || undefined,
    p_school:            filters.school           || undefined,
    p_category:          filters.category         || undefined,
    p_status_uc:         filters.statusUc         || undefined,
    p_exclude_suspended: filters.excludeSuspended ?? false,
  });

  if (error) {
    return { ...EMPTY_WORKLOAD };
  }

  const result = (data ?? {}) as Partial<WorkloadKPIData>;

  return {
    tutors:                   result.tutors                   ?? [],
    monitors:                 result.monitors                 ?? [],
    categoryBreakdown:        result.categoryBreakdown        ?? [],
    monitorCategoryBreakdown: result.monitorCategoryBreakdown ?? [],
    totalUcs:                 result.totalUcs                 ?? 0,
    totalStudents:            result.totalStudents            ?? 0,
    totalTutors:              result.totalTutors              ?? 0,
    totalMonitors:            result.totalMonitors            ?? 0,
    totalTutorUcs:            result.totalTutorUcs            ?? 0,
    totalMonitorUcs:          result.totalMonitorUcs          ?? 0,
    totalTutorStudents:       result.totalTutorStudents       ?? 0,
    totalMonitorStudents:     result.totalMonitorStudents     ?? 0,
  };
}
