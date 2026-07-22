import {
  listAccessibleCourseIds,
  userHasPermission as checkPermission,
} from '../_shared/auth/mod.ts'
import { createServiceClient, type AppSupabaseClient, type Json } from '../_shared/db/mod.ts'
import {
  findActiveBackgroundJobBySourceRecord,
  findBackgroundJobById,
  findOwnedBackgroundJobById,
  listBackgroundJobItems,
  type BackgroundJobItemRecord,
  type BackgroundJobRecord,
} from '../_shared/domain/background-jobs/repository.ts'
import {
  cancelMoodleSyncJob,
  createMoodleSyncJobV2,
  retryMoodleSyncJob,
} from '../_shared/domain/moodle-sync/worker-repository.ts'
import { linkEligibleUserCourses } from '../_shared/domain/moodle-sync/repository.ts'

export interface SyncPreferencesRecord {
  includeEmptyCourses: boolean
  includeFinished: boolean
  selectedKeys: string[]
}

export interface MoodleSyncJobsRepository {
  cancelOwnedJob(actorId: string, jobId: string): Promise<BackgroundJobRecord | null>
  createJob(input: {
    actorId: string
    connectionId: string
    courseIds: string[]
    entities: Array<'students' | 'activities' | 'grades'>
    itemDefinitions: Array<{ itemKey: string; label: string; metadata: Json }>
    kind: 'initial' | 'incremental'
    sourceRecordId: string
    trigger: 'initial' | 'manual'
  }): Promise<BackgroundJobRecord>
  findActiveJob(actorId: string, sourceRecordId: string): Promise<BackgroundJobRecord | null>
  getCourseStudentCounts(courseIds: string[]): Promise<Map<string, number>>
  getJob(actorId: string, jobId: string): Promise<BackgroundJobRecord | null>
  getJobItems(jobId: string): Promise<BackgroundJobItemRecord[]>
  listActiveJobs(actorId: string): Promise<BackgroundJobRecord[]>
  linkEligibleCourses(actorId: string, connectionId: string, courseIds: string[]): Promise<number>
  getPreferences(actorId: string, connectionId: string): Promise<SyncPreferencesRecord | null>
  hasCourseScope(actorId: string, connectionId: string, courseIds: string[], kind: 'initial' | 'incremental'): Promise<boolean>
  hasPermission(actorId: string, permission: string): Promise<boolean>
  resetOwnedJob(actorId: string, jobId: string): Promise<BackgroundJobRecord | null>
  savePreferences(actorId: string, connectionId: string, preferences: SyncPreferencesRecord): Promise<SyncPreferencesRecord>
}

export function createMoodleSyncJobsRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): MoodleSyncJobsRepository {
  return {
    hasPermission(actorId, permission) {
      return checkPermission(supabase, actorId, permission)
    },

    async hasCourseScope(actorId, connectionId, courseIds, kind) {
      const { data: connection, error: connectionError } = await supabase
        .from('user_moodle_connections')
        .select('moodle_site_id')
        .eq('id', connectionId)
        .eq('user_id', actorId)
        .in('status', ['active', 'reauth_required'])
        .maybeSingle()
      if (connectionError) throw connectionError
      if (!connection) return false

      const { data: scopedCourses, error: courseError } = await supabase
        .from('courses')
        .select('id')
        .eq('moodle_site_id', connection.moodle_site_id)
        .in('id', courseIds)
      if (courseError) throw courseError
      if (new Set((scopedCourses ?? []).map((course) => course.id)).size !== courseIds.length) {
        return false
      }

      if (kind === 'incremental') {
        const accessible = new Set(await listAccessibleCourseIds(supabase, actorId))
        return courseIds.every((courseId) => accessible.has(courseId))
      }
      // The connection-scoped eligibility RPC invoked immediately before job
      // creation is the atomic authority for initial selections.
      return true
    },

    findActiveJob(actorId, sourceRecordId) {
      return findActiveBackgroundJobBySourceRecord(
        supabase,
        actorId,
        'moodle_sync',
        sourceRecordId,
      )
    },

    async createJob(input) {
      const jobId = await createMoodleSyncJobV2(supabase, {
        connectionId: input.connectionId,
        courseIds: input.courseIds,
        entities: input.entities,
        items: input.itemDefinitions,
        sourceRecordId: input.sourceRecordId,
        syncKind: input.kind,
        trigger: input.trigger,
        userId: input.actorId,
      })
      const job = await findBackgroundJobById(supabase, jobId)
      if (!job) throw new Error('Schema-v2 Moodle job was not persisted')
      return job
    },

    linkEligibleCourses(actorId, connectionId, courseIds) {
      return linkEligibleUserCourses(supabase, actorId, connectionId, courseIds)
    },

    getJob(actorId, jobId) {
      return findOwnedBackgroundJobById(supabase, actorId, jobId)
    },

    getJobItems(jobId) {
      return listBackgroundJobItems(supabase, jobId)
    },

    async listActiveJobs(actorId) {
      const { data, error } = await supabase
        .from('background_jobs')
        .select('*')
        .eq('user_id', actorId)
        .eq('job_type', 'moodle_sync')
        .eq('source', 'sync')
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as BackgroundJobRecord[]
    },

    async cancelOwnedJob(actorId, jobId) {
      const job = await findOwnedBackgroundJobById(supabase, actorId, jobId)
      if (!job || job.job_type !== 'moodle_sync' || job.source !== 'sync') return null
      if (!await cancelMoodleSyncJob(supabase, jobId, actorId)) return null
      return await findOwnedBackgroundJobById(supabase, actorId, jobId)
    },

    async resetOwnedJob(actorId, jobId) {
      const job = await findOwnedBackgroundJobById(supabase, actorId, jobId)
      if (!job || job.job_type !== 'moodle_sync' || job.source !== 'sync') return null
      if (!await retryMoodleSyncJob(supabase, jobId, actorId)) return null
      return await findOwnedBackgroundJobById(supabase, actorId, jobId)
    },

    async getCourseStudentCounts(courseIds) {
      const counts = new Map(courseIds.map((courseId) => [courseId, 0]))
      const { data, error } = await supabase
        .from('student_courses')
        .select('course_id')
        .in('course_id', courseIds)
      if (error) throw error
      for (const row of data ?? []) {
        counts.set(row.course_id, (counts.get(row.course_id) ?? 0) + 1)
      }
      return counts
    },

    async getPreferences(actorId, connectionId) {
      const { data, error } = await supabase
        .from('user_moodle_sync_preferences')
        .select('selected_keys, include_empty_courses, include_finished_courses')
        .eq('user_id', actorId)
        .eq('moodle_connection_id', connectionId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        includeEmptyCourses: data.include_empty_courses,
        includeFinished: data.include_finished_courses,
        selectedKeys: Array.isArray(data.selected_keys)
          ? data.selected_keys.filter((item): item is string => typeof item === 'string')
          : [],
      }
    },

    async savePreferences(actorId, connectionId, preferences) {
      const { data, error } = await supabase
        .from('user_moodle_sync_preferences')
        .upsert({
          user_id: actorId,
          moodle_connection_id: connectionId,
          selected_keys: preferences.selectedKeys,
          include_empty_courses: preferences.includeEmptyCourses,
          include_finished_courses: preferences.includeFinished,
        }, { onConflict: 'user_id,moodle_connection_id' })
        .select('selected_keys, include_empty_courses, include_finished_courses')
        .single()
      if (error || !data) throw error ?? new Error('Failed to persist sync preferences')
      return {
        includeEmptyCourses: data.include_empty_courses,
        includeFinished: data.include_finished_courses,
        selectedKeys: Array.isArray(data.selected_keys)
          ? data.selected_keys.filter((item): item is string => typeof item === 'string')
          : [],
      }
    },
  }
}
