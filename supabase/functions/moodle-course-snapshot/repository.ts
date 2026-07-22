import type { AppSupabaseClient } from '../_shared/db/mod.ts'
import type { MoodleSnapshotEntity } from './contract.ts'

export interface RefreshRequestResult {
  accepted_entities: string[]
  job_id: string | null
  moodle_site_id: string
  refresh_status: 'queued' | 'deduplicated' | 'cooldown'
  requested_at: string
  retry_after_seconds: number | null
}

export interface SnapshotRepository {
  getSnapshot(connectionId: string, courseId: string, entities: MoodleSnapshotEntity[]): Promise<{
    activeJobs: Array<{ id: string; entities: MoodleSnapshotEntity[] }>
    connection: { moodle_site_id: string } | null
    counts: { activities: number; grades: number; students: number }
    course: {
      category: string | null
      end_date: string | null
      moodle_site_id: string
      name: string
      observed_at: string | null
      short_name: string | null
      source_updated_at: string | null
      start_date: string | null
    } | null
    errorCodes: Record<string, string>
    policies: Array<{ entity: string; stale_after_seconds: number }>
    watermarks: Array<{ entity: string; last_successful_sync_at: string | null }>
  }>
  reclassify(connectionId: string, courseId: string): Promise<void>
  requestRefresh(
    actorId: string,
    connectionId: string,
    courseId: string,
    entities: MoodleSnapshotEntity[],
    trigger: 'manual' | 'stale_read',
  ): Promise<RefreshRequestResult>
}

function asEntities(value: unknown): MoodleSnapshotEntity[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is MoodleSnapshotEntity => (
    entry === 'students' || entry === 'activities' || entry === 'grades'
  ))
}

export function createSnapshotRepository(supabase: AppSupabaseClient): SnapshotRepository {
  return {
    async getSnapshot(connectionId, courseId, entities) {
      const connectionResult = await supabase
        .from('user_moodle_connections')
        .select('moodle_site_id')
        .eq('id', connectionId)
        .maybeSingle()
      if (connectionResult.error) throw connectionResult.error
      const connection = connectionResult.data
      if (!connection) {
        return {
          activeJobs: [], connection: null,
          counts: { activities: 0, grades: 0, students: 0 }, course: null,
          errorCodes: {}, policies: [], watermarks: [],
        }
      }

      const [courseResult, stateResult, watermarkResult, policyResult, jobsResult, students, activities, grades] =
        await Promise.all([
          supabase.from('courses')
            .select('name, short_name, category, start_date, end_date, moodle_site_id, observed_at, source_updated_at')
            .eq('id', courseId).maybeSingle(),
          supabase.from('moodle_course_sync_state')
            .select('temperature, last_error_codes')
            .eq('moodle_connection_id', connectionId).eq('course_id', courseId).maybeSingle(),
          supabase.from('moodle_sync_watermarks')
            .select('entity, last_successful_sync_at')
            .eq('moodle_connection_id', connectionId).eq('course_id', courseId).in('entity', entities),
          supabase.from('moodle_sync_policies')
            .select('entity, stale_after_seconds, moodle_site_id, temperature')
            .in('entity', entities).or(`moodle_site_id.is.null,moodle_site_id.eq.${connection.moodle_site_id}`),
          supabase.from('background_jobs')
            .select('id, metadata')
            .eq('user_id', (await supabase.from('user_moodle_connections').select('user_id').eq('id', connectionId).single()).data?.user_id ?? '')
            .eq('course_id', courseId).eq('job_type', 'moodle_sync').in('status', ['pending', 'processing']),
          supabase.from('student_courses').select('*', { count: 'exact', head: true }).eq('course_id', courseId),
          supabase.from('student_activities').select('*', { count: 'exact', head: true }).eq('course_id', courseId),
          supabase.from('student_course_grades').select('*', { count: 'exact', head: true }).eq('course_id', courseId),
        ])

      for (const result of [courseResult, stateResult, watermarkResult, policyResult, jobsResult, students, activities, grades]) {
        if (result.error) throw result.error
      }

      const temperature = stateResult.data?.temperature ?? 'cold'
      const selectedPolicies = new Map<string, { entity: string; stale_after_seconds: number; site: boolean }>()
      for (const policy of policyResult.data ?? []) {
        if (policy.temperature !== temperature) continue
        const existing = selectedPolicies.get(policy.entity)
        const isSite = policy.moodle_site_id === connection.moodle_site_id
        if (!existing || isSite) {
          selectedPolicies.set(policy.entity, {
            entity: policy.entity,
            stale_after_seconds: policy.stale_after_seconds,
            site: isSite,
          })
        }
      }

      const errorCodes = stateResult.data?.last_error_codes
      const safeErrors = errorCodes && typeof errorCodes === 'object' && !Array.isArray(errorCodes)
        ? Object.fromEntries(Object.entries(errorCodes).filter(([, value]) => typeof value === 'string')) as Record<string, string>
        : {}

      return {
        activeJobs: (jobsResult.data ?? []).map((job) => ({
          id: job.id,
          entities: asEntities(job.metadata && typeof job.metadata === 'object' && !Array.isArray(job.metadata)
            ? job.metadata.entities
            : []),
        })),
        connection,
        counts: { activities: activities.count ?? 0, grades: grades.count ?? 0, students: students.count ?? 0 },
        course: courseResult.data,
        errorCodes: safeErrors,
        policies: [...selectedPolicies.values()].map(({ entity, stale_after_seconds }) => ({ entity, stale_after_seconds })),
        watermarks: watermarkResult.data ?? [],
      }
    },

    async reclassify(connectionId, courseId) {
      const { error } = await supabase.rpc('backend_reclassify_moodle_course_sync_state', {
        p_moodle_connection_id: connectionId,
        p_course_id: courseId,
      } as never)
      if (error) throw error
    },

    async requestRefresh(actorId, connectionId, courseId, entities, trigger) {
      const { data, error } = await supabase.rpc('backend_request_course_refresh', {
        p_user_id: actorId,
        p_moodle_connection_id: connectionId,
        p_course_id: courseId,
        p_entities: entities,
        p_trigger: trigger,
      } as never)
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      if (!row || typeof row !== 'object') throw new Error('Refresh RPC returned no result')
      return row as unknown as RefreshRequestResult
    },
  }
}

