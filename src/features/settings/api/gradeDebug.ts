import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

const FUNCTION_NAME = 'admin-diagnostics';
export const ADMIN_DIAGNOSTICS_CONTRACT_VERSION = 1 as const;

export interface GradeDebugCourseOption {
  id: string;
  name: string;
}

export interface GradeDebugStudentOption {
  fullName: string;
  id: string;
}

export interface GradeDebugItem {
  activityId: string | null;
  gradeFormatted: string | null;
  gradeMax: number | string | null;
  gradeRaw: number | string | null;
  itemName: string | null;
  itemType: string | null;
  module: string | null;
  percentageFormatted: string | null;
}

interface GradeDebugCoursesResponse {
  contractVersion: typeof ADMIN_DIAGNOSTICS_CONTRACT_VERSION;
  items: GradeDebugCourseOption[];
}

interface GradeDebugStudentsResponse {
  contractVersion: typeof ADMIN_DIAGNOSTICS_CONTRACT_VERSION;
  items: GradeDebugStudentOption[];
}

export interface GradeDebugResult {
  contractVersion: typeof ADMIN_DIAGNOSTICS_CONTRACT_VERSION;
  course: GradeDebugCourseOption;
  courseGrade: GradeDebugItem | null;
  items: GradeDebugItem[];
  operationId: string;
  student: GradeDebugStudentOption;
  summary: {
    returnedItems: number;
    totalItems: number;
    truncated: boolean;
  };
}

function assertContract<T extends { contractVersion: number }>(response: T): T {
  if (
    !response
    || typeof response !== 'object'
    || response.contractVersion !== ADMIN_DIAGNOSTICS_CONTRACT_VERSION
  ) {
    throw new Error('Versão incompatível do contrato de diagnóstico.');
  }
  return response;
}

async function invoke<T extends { contractVersion: number }>(
  body: Record<string, unknown>,
): Promise<T> {
  return assertContract(await invokeEdgeFunction<T>(FUNCTION_NAME, { body }));
}

export async function listGradeDebugCourses(connectionId: string): Promise<GradeDebugCourseOption[]> {
  return (await invoke<GradeDebugCoursesResponse>({ action: 'list_grade_courses', connectionId })).items;
}

export async function listGradeDebugStudents(connectionId: string, courseId: string): Promise<GradeDebugStudentOption[]> {
  return (await invoke<GradeDebugStudentsResponse>({
    action: 'list_grade_students',
    connectionId,
    courseId,
  })).items;
}

export function debugStudentGrades(input: {
  connectionId: string;
  courseId: string;
  studentId: string;
}): Promise<GradeDebugResult> {
  return invoke({
    action: 'run_grade_diagnostic',
    connectionId: input.connectionId,
    courseId: input.courseId,
    studentId: input.studentId,
  });
}
