import {
  recordAdminOperationAudit,
  type AdminOperationAuditInput,
} from '../_shared/domain/admin-operation-audit.ts'
import type { AppSupabaseClient } from '../_shared/db/mod.ts'

export interface GradeDiagnosticCourseRow {
  id: string
  moodleCourseId: string
  name: string
}

export interface GradeDiagnosticStudentRow {
  fullName: string
  id: string
  moodleUserId: string
}

export interface GradeDiagnosticTarget {
  course: GradeDiagnosticCourseRow
  student: GradeDiagnosticStudentRow
}

export interface AdminDiagnosticsRepository {
  findGradeDiagnosticTarget(courseId: string, studentId: string): Promise<GradeDiagnosticTarget | null>
  listGradeCourses(): Promise<GradeDiagnosticCourseRow[]>
  listGradeStudents(courseId: string): Promise<GradeDiagnosticStudentRow[] | null>
  recordAudit(input: AdminOperationAuditInput): Promise<void>
}

interface StudentJoinRow {
  students: {
    full_name: string
    id: string
    moodle_user_id: string
  }
}

function mapStudent(row: StudentJoinRow): GradeDiagnosticStudentRow {
  return {
    fullName: row.students.full_name,
    id: row.students.id,
    moodleUserId: row.students.moodle_user_id,
  }
}

export function createAdminDiagnosticsRepository(
  supabase: AppSupabaseClient,
): AdminDiagnosticsRepository {
  async function findCourse(courseId: string): Promise<GradeDiagnosticCourseRow | null> {
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, moodle_course_id')
      .eq('id', courseId)
      .maybeSingle()

    if (error) throw error
    return data
      ? { id: data.id, name: data.name, moodleCourseId: data.moodle_course_id }
      : null
  }

  return {
    async findGradeDiagnosticTarget(courseId, studentId) {
      const course = await findCourse(courseId)
      if (!course) return null

      const { data, error } = await supabase
        .from('student_courses')
        .select('students!inner(id, full_name, moodle_user_id)')
        .eq('course_id', courseId)
        .eq('student_id', studentId)
        .maybeSingle()

      if (error) throw error
      if (!data) return null
      return { course, student: mapStudent(data as unknown as StudentJoinRow) }
    },

    async listGradeCourses() {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, moodle_course_id')
        .order('name')
        .limit(200)

      if (error) throw error
      return (data ?? []).map((course) => ({
        id: course.id,
        moodleCourseId: course.moodle_course_id,
        name: course.name,
      }))
    },

    async listGradeStudents(courseId) {
      if (!await findCourse(courseId)) return null

      const { data, error } = await supabase
        .from('student_courses')
        .select('students!inner(id, full_name, moodle_user_id)')
        .eq('course_id', courseId)
        .limit(200)

      if (error) throw error
      return (data ?? []).map((row) => mapStudent(row as unknown as StudentJoinRow))
    },

    recordAudit(input) {
      return recordAdminOperationAudit(supabase, input)
    },
  }
}
