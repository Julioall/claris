import {
  userHasCourseAccess,
  userHasPermission,
} from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
} from '../_shared/db/mod.ts'
import type { GradeSuggestionJobStatusDto } from './contract.ts'

export interface GradeSuggestionJobSummaryRecord {
  activityName: string
  courseId: string
  createdAt: string
  errorCount: number
  errorMessage: string | null
  jobId: string
  moodleActivityId: string
  processedItems: number
  status: GradeSuggestionJobStatusDto
  successCount: number
  totalItems: number
}

export interface GradeSuggestionJobsRepository {
  findLatestRelevant(input: {
    courseId: string
    moodleActivityId: string
    userId: string
  }): Promise<GradeSuggestionJobSummaryRecord | null>
  findMoodleActivityId(input: {
    activityId: string
    courseId: string
  }): Promise<string | null>
  userCanAccessCourse(userId: string, courseId: string): Promise<boolean>
  userCanManageGradeSuggestions(userId: string): Promise<boolean>
}

interface JobQueryRow {
  activity_name: string
  course_id: string
  created_at: string
  error_count: number
  error_message: string | null
  id: string
  moodle_activity_id: string
  processed_items: number
  status: GradeSuggestionJobStatusDto
  success_count: number
  total_items: number
}

function mapJob(row: JobQueryRow): GradeSuggestionJobSummaryRecord {
  return {
    activityName: row.activity_name,
    courseId: row.course_id,
    createdAt: row.created_at,
    errorCount: row.error_count,
    errorMessage: row.error_message,
    jobId: row.id,
    moodleActivityId: row.moodle_activity_id,
    processedItems: row.processed_items,
    status: row.status,
    successCount: row.success_count,
    totalItems: row.total_items,
  }
}

export function createGradeSuggestionJobsRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): GradeSuggestionJobsRepository {
  return {
    async userCanAccessCourse(userId, courseId) {
      return userHasCourseAccess(supabase, userId, courseId)
    },

    async userCanManageGradeSuggestions(userId) {
      return userHasPermission(supabase, userId, 'grades.suggestions.manage')
    },

    async findMoodleActivityId({ activityId, courseId }) {
      const { data, error } = await supabase
        .from('student_activities')
        .select('moodle_activity_id')
        .eq('id', activityId)
        .eq('course_id', courseId)
        .maybeSingle()

      if (error) throw error
      return data?.moodle_activity_id ?? null
    },

    async findLatestRelevant({ courseId, moodleActivityId, userId }) {
      const { data, error } = await supabase
        .from('ai_grade_suggestion_jobs')
        .select('id, activity_name, course_id, moodle_activity_id, status, total_items, processed_items, success_count, error_count, error_message, created_at')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .eq('moodle_activity_id', moodleActivityId)
        .in('status', ['pending', 'processing', 'failed', 'completed'])
        .or('status.in.(pending,processing),processed_items.gt.0')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data ? mapJob(data as JobQueryRow) : null
    },
  }
}
