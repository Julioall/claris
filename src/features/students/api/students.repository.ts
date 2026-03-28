import { supabase } from '@/integrations/supabase/client';
import { listAccessibleCourseIds } from '@/lib/course-access';

import type { EnrollmentStatus, RiskLevel, StudentListItem, StudentProfile, StudentRecord } from '../types';

const RISK_ORDER: Record<RiskLevel, number> = {
  critico: 0,
  risco: 1,
  atencao: 2,
  normal: 3,
  inativo: 4,
};

interface StudentCourseRow {
  student_id: string;
  enrollment_status: string | null;
  courses: {
    start_date?: string | null;
  } | null;
  students: StudentRecord | null;
}

interface StudentAggregate {
  student: StudentRecord;
  allStatuses: Set<EnrollmentStatus>;
  validStatuses: Set<EnrollmentStatus>;
}

function normalizeEnrollmentStatus(status: string | null | undefined): EnrollmentStatus {
  const normalized = (status || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalized === 'ativo' || normalized === 'active') return 'ativo';
  if (normalized === 'suspenso' || normalized === 'suspended') return 'suspenso';
  if (normalized === 'concluido' || normalized === 'completed') return 'concluido';
  if (normalized === 'inativo' || normalized === 'inactive') return 'inativo';
  if (normalized === 'nao atualmente' || normalized === 'not current' || normalized === 'not_current' || normalized === 'notcurrently') {
    return 'inativo';
  }

  return 'ativo';
}

function resolveEnrollmentStatus(statuses: Set<EnrollmentStatus>): EnrollmentStatus {
  if (statuses.has('ativo')) return 'ativo';
  if (statuses.has('suspenso')) return 'suspenso';
  if (statuses.has('concluido')) return 'concluido';
  return 'inativo';
}

async function listTutorCourseIds(userId: string): Promise<string[]> {
  return listAccessibleCourseIds(userId, 'tutor');
}

function mapStudentEntries(studentCourses: StudentCourseRow[]): StudentListItem[] {
  const now = new Date();
  const aggregatedStudents = new Map<string, StudentAggregate>();

  studentCourses.forEach((studentCourse) => {
    const relatedStudent = studentCourse.students;
    if (!relatedStudent) return;

    const normalizedStatus = normalizeEnrollmentStatus(studentCourse.enrollment_status);
    const isValidCourse = !studentCourse.courses?.start_date || new Date(studentCourse.courses.start_date) <= now;
    const existing = aggregatedStudents.get(relatedStudent.id);

    if (!existing) {
      aggregatedStudents.set(relatedStudent.id, {
        student: relatedStudent,
        allStatuses: new Set([normalizedStatus]),
        validStatuses: isValidCourse ? new Set([normalizedStatus]) : new Set<EnrollmentStatus>(),
      });
      return;
    }

    existing.allStatuses.add(normalizedStatus);
    if (isValidCourse) {
      existing.validStatuses.add(normalizedStatus);
    }
  });

  return Array.from(aggregatedStudents.values())
    .map(({ student, allStatuses, validStatuses }) => ({
      ...student,
      current_risk_level: student.current_risk_level as RiskLevel,
      enrollment_status: resolveEnrollmentStatus(validStatuses.size > 0 ? validStatuses : allStatuses),
    }))
    .sort((left, right) => RISK_ORDER[left.current_risk_level] - RISK_ORDER[right.current_risk_level]);
}

export async function listStudentsForUser(params: {
  userId: string;
  courseId?: string;
}): Promise<StudentListItem[]> {
  const tutorCourseIds = await listTutorCourseIds(params.userId);
  if (tutorCourseIds.length === 0) {
    return [];
  }

  const courseIds = params.courseId ? [params.courseId] : tutorCourseIds;

  const { data, error } = await supabase
    .from('student_courses')
    .select(`
      student_id,
      enrollment_status,
      courses (start_date),
      students (*)
    `)
    .in('course_id', courseIds);

  if (error) throw error;

  return mapStudentEntries((data || []) as StudentCourseRow[]);
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
