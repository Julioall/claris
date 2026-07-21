import { listAccessibleCourseIds, userHasPermission } from '../_shared/auth/mod.ts'
import type { AppSupabaseClient } from '../_shared/db/mod.ts'

export interface MoodleMessagingRepository {
  listAccessibleStudentIds(
    actorId: string,
    moodleUserIds: number[],
  ): Promise<Map<string, string>>
  userCanViewMessages(actorId: string): Promise<boolean>
}

export function createMoodleMessagingRepository(
  supabase: AppSupabaseClient,
): MoodleMessagingRepository {
  return {
    async listAccessibleStudentIds(actorId, moodleUserIds) {
      const uniqueMoodleUserIds = [...new Set(moodleUserIds.filter((id) => id > 0).map(String))]
      if (uniqueMoodleUserIds.length === 0) return new Map()

      const courseIds = await listAccessibleCourseIds(supabase, actorId, 'tutor')
      if (courseIds.length === 0) return new Map()

      const { data, error } = await supabase
        .from('student_courses')
        .select('student_id, students!inner(id, moodle_user_id)')
        .in('course_id', courseIds)
        .in('students.moodle_user_id', uniqueMoodleUserIds)

      if (error) throw error

      const mapped = new Map<string, string>()
      const rows = (data ?? []) as Array<{
        student_id: string
        students: { moodle_user_id: string } | { moodle_user_id: string }[]
      }>
      rows.forEach((row) => {
        const student = Array.isArray(row.students) ? row.students[0] : row.students
        if (student?.moodle_user_id && !mapped.has(student.moodle_user_id)) {
          mapped.set(student.moodle_user_id, row.student_id)
        }
      })

      return mapped
    },
    userCanViewMessages(actorId) {
      return userHasPermission(supabase, actorId, 'messages.view')
    },
  }
}
