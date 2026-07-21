import {
  userHasCourseAccess,
  userHasPermission,
} from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
  type Json,
} from '../_shared/db/mod.ts'
import type { AttendanceStatusDto } from './contract.ts'
import {
  parseAttendanceDateSummaries,
  type AttendanceDateSummaryRecord,
} from './date-summary.ts'

export type { AttendanceDateSummaryRecord } from './date-summary.ts'

export interface AttendanceHistoryRecord {
  date: string
  id: string
  notes: string | null
  status: AttendanceStatusDto
  studentId: string
  studentName: string
  updatedAt: string | null
}

export interface AttendanceStudentRecord {
  email: string | null
  id: string
  name: string
}

export interface AttendanceSheetRecord {
  notes: string | null
  status: AttendanceStatusDto
  studentId: string
  updatedAt: string | null
}

export interface CourseAttendanceRepository {
  listDateSummaries(input: {
    courseId: string
    userId: string
  }): Promise<AttendanceDateSummaryRecord[]>
  listHistory(input: {
    courseId: string
    limit: number
    offset: number
    userId: string
  }): Promise<AttendanceHistoryRecord[]>
  listSheet(input: {
    courseId: string
    date: string
    userId: string
  }): Promise<AttendanceSheetRecord[]>
  listStudents(courseId: string): Promise<AttendanceStudentRecord[]>
  saveSheet(input: {
    courseId: string
    date: string
    entries: Array<{ notes: string | null; status: AttendanceStatusDto; studentId: string }>
    userId: string
  }): Promise<number>
  userCanAccessCourse(userId: string, courseId: string): Promise<boolean>
  userCanManageAttendance(userId: string): Promise<boolean>
  userCanViewPanel(userId: string): Promise<boolean>
}

const PAGE_SIZE = 1000
const BATCH_SIZE = 100

function chunks<T>(values: T[], size = BATCH_SIZE): T[][] {
  const unique = [...new Set(values)]
  const result: T[][] = []
  for (let index = 0; index < unique.length; index += size) {
    result.push(unique.slice(index, index + size))
  }
  return result
}

async function paginate<T>(
  fetchPage: (page: number) => Promise<{ data: T[] | null; error: unknown | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; ; page += 1) {
    const { data, error } = await fetchPage(page)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

export function createCourseAttendanceRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): CourseAttendanceRepository {
  return {
    async userCanViewPanel(userId) {
      return userHasPermission(supabase, userId, 'courses.panel.view')
    },

    async userCanManageAttendance(userId) {
      return userHasPermission(supabase, userId, 'courses.attendance.manage')
    },

    async userCanAccessCourse(userId, courseId) {
      return userHasCourseAccess(supabase, userId, courseId)
    },

    async listDateSummaries({ courseId, userId }) {
      const { data, error } = await supabase.rpc(
        'backend_get_attendance_date_summaries',
        {
          p_course_id: courseId,
          p_user_id: userId,
        },
      )
      if (error) throw error
      return parseAttendanceDateSummaries(data)
    },

    async listHistory({ courseId, limit, offset, userId }) {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, attendance_date, status, notes, updated_at, student_id, students(id, full_name)')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .order('attendance_date', { ascending: false })
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + limit)
      if (error) throw error

      return ((data ?? []) as unknown as Array<{
        attendance_date: string
        id: string
        notes: string | null
        status: AttendanceStatusDto
        student_id: string
        students: { full_name: string; id: string } | null
        updated_at: string | null
      }>).map((row) => ({
        date: row.attendance_date,
        id: row.id,
        notes: row.notes,
        status: row.status,
        studentId: row.student_id,
        studentName: row.students?.full_name ?? 'Aluno sem nome',
        updatedAt: row.updated_at,
      }))
    },

    async listStudents(courseId) {
      const enrollmentRows = await paginate<{ student_id: string }>(async (page) => {
        const { data, error } = await supabase
          .from('student_courses')
          .select('student_id')
          .eq('course_id', courseId)
          .order('student_id', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        return { data, error }
      })
      const studentIds = [...new Set(enrollmentRows.map((row) => row.student_id))]

      const students = (await Promise.all(chunks(studentIds).map(async (batch) => {
        const { data, error } = await supabase
          .from('students')
          .select('id, full_name, email')
          .in('id', batch)
        if (error) throw error
        return data ?? []
      }))).flat()

      return students
        .map((student) => ({
          email: student.email,
          id: student.id,
          name: student.full_name,
        }))
        .sort((left, right) => (
          left.name.localeCompare(right.name, 'pt-BR')
          || left.id.localeCompare(right.id)
        ))
    },

    async listSheet({ courseId, date, userId }) {
      const rows = await paginate<{
        notes: string | null
        status: AttendanceStatusDto
        student_id: string
        updated_at: string | null
      }>(async (page) => {
        const { data, error } = await supabase
          .from('attendance_records')
          .select('student_id, status, notes, updated_at')
          .eq('user_id', userId)
          .eq('course_id', courseId)
          .eq('attendance_date', date)
          .order('updated_at', { ascending: false })
          .order('student_id', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        return { data, error }
      })

      return rows.map((row) => ({
        notes: row.notes,
        status: row.status,
        studentId: row.student_id,
        updatedAt: row.updated_at,
      }))
    },

    async saveSheet({ courseId, date, entries, userId }) {
      const { data, error } = await supabase.rpc(
        'backend_save_attendance_sheet',
        {
          p_attendance_date: date,
          p_course_id: courseId,
          p_entries: entries.map((entry) => ({
            notes: entry.notes,
            status: entry.status,
            student_id: entry.studentId,
          })) as Json,
          p_user_id: userId,
        },
      )
      if (error) throw error
      return Number(data ?? entries.length)
    },
  }
}
