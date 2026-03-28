import { supabase } from '@/integrations/supabase/client';

import type { EnrollmentStatus, RiskLevel, StudentListPage, StudentProfile, StudentRecord } from '../types';

interface StudentPaginatedRow extends StudentRecord {
  enrollment_status: EnrollmentStatus;
  total_count: number;
}

function mapPagedStudents(rows: StudentPaginatedRow[]): StudentListPage {
  if (rows.length === 0) {
    return {
      items: [],
      totalCount: 0,
    };
  }

  return {
    items: rows.map((row) => ({
      ...row,
      current_risk_level: row.current_risk_level as RiskLevel,
      enrollment_status: row.enrollment_status,
    })),
    totalCount: rows[0].total_count ?? 0,
  };
}

export async function listStudentsForUser(params: {
  courseId?: string;
  searchQuery?: string;
  riskFilter?: string;
  statusFilter?: string;
  page?: number;
  pageSize?: number;
}): Promise<StudentListPage> {
  const page = Math.max(params.page ?? 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 30, 1), 100);
  const offset = (page - 1) * pageSize;

  const { data, error } = await supabase.rpc('list_students_paginated' as never, {
    p_course_id: params.courseId ?? null,
    p_search: params.searchQuery?.trim() || null,
    p_risk_filter: params.riskFilter && params.riskFilter !== 'all' ? params.riskFilter : null,
    p_status_filter: params.statusFilter && params.statusFilter !== 'all' ? params.statusFilter : null,
    p_limit: pageSize,
    p_offset: offset,
  } as never);

  if (error) throw error;

  return mapPagedStudents((data || []) as StudentPaginatedRow[]);
}

export async function getStudentProfile(studentId: string): Promise<StudentProfile | null> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', studentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return {
    ...(data as StudentRecord),
    current_risk_level: data.current_risk_level as RiskLevel,
  };
}
