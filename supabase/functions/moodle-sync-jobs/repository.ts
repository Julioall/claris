import {
  listAccessibleCourseIds,
  userHasPermission as checkPermission,
} from '../_shared/auth/mod.ts'
import { createServiceClient, type AppSupabaseClient, type Json } from '../_shared/db/mod.ts'
import {
  createBackgroundJobItems,
  findActiveBackgroundJobBySourceRecord,
  findOwnedBackgroundJobById,
  listBackgroundJobItems,
  updateBackgroundJobWhenStatus,
  upsertBackgroundJob,
  type BackgroundJobItemRecord,
  type BackgroundJobRecord,
  type BackgroundJobStatus,
} from '../_shared/domain/background-jobs/repository.ts'

export interface SyncPreferencesRecord {
  includeEmptyCourses: boolean
  includeFinished: boolean
  selectedKeys: string[]
}

export interface MoodleSyncJobsRepository {
  cancelOwnedJob(actorId: string, jobId: string): Promise<BackgroundJobRecord | null>
  createJob(input: {
    actorId: string
    courseIds: string[]
    entities: string[]
    itemDefinitions: Array<{ itemKey: string; label: string; metadata: Json }>
    kind: 'initial' | 'incremental'
    sourceRecordId: string
  }): Promise<BackgroundJobRecord>
  findActiveJob(actorId: string, sourceRecordId: string): Promise<BackgroundJobRecord | null>
  getCourseStudentCounts(courseIds: string[]): Promise<Map<string, number>>
  getJob(actorId: string, jobId: string): Promise<BackgroundJobRecord | null>
  getJobItems(jobId: string): Promise<BackgroundJobItemRecord[]>
  listActiveJobs(actorId: string): Promise<BackgroundJobRecord[]>
  getPreferences(actorId: string): Promise<SyncPreferencesRecord | null>
  hasCourseScope(actorId: string, courseIds: string[], kind: 'initial' | 'incremental'): Promise<boolean>
  hasPermission(actorId: string, permission: string): Promise<boolean>
  resetOwnedJob(actorId: string, jobId: string): Promise<BackgroundJobRecord | null>
  savePreferences(actorId: string, preferences: SyncPreferencesRecord): Promise<SyncPreferencesRecord>
}

export function createMoodleSyncJobsRepository(
  supabase: AppSupabaseClient = createServiceClient(),
): MoodleSyncJobsRepository {
  return {
    hasPermission(actorId, permission) {
      return checkPermission(supabase, actorId, permission)
    },

    async hasCourseScope(actorId, courseIds, kind) {
      if (kind === 'incremental') {
        const accessible = new Set(await listAccessibleCourseIds(supabase, actorId))
        return courseIds.every((courseId) => accessible.has(courseId))
      }

      const { data, error } = await supabase
        .from('user_course_catalog_eligibility')
        .select('course_id')
        .eq('user_id', actorId)
        .in('course_id', courseIds)
      if (error) throw error
      const eligible = new Set((data ?? []).map((row) => row.course_id))
      return courseIds.every((courseId) => eligible.has(courseId))
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
      const jobId = crypto.randomUUID()
      const totalItems = input.itemDefinitions.length
      const job = await upsertBackgroundJob(supabase, {
        id: jobId,
        userId: input.actorId,
        courseId: input.courseIds.length === 1 ? input.courseIds[0] : null,
        jobType: 'moodle_sync',
        source: 'sync',
        sourceTable: 'moodle_sync_request',
        sourceRecordId: input.sourceRecordId,
        title: input.kind === 'initial'
          ? 'Sincronizacao inicial do Moodle'
          : 'Atualizacao de unidade curricular',
        description: `${input.courseIds.length} curso(s) em processamento pelo servidor.`,
        status: 'pending',
        totalItems,
        metadata: {
          course_ids: input.courseIds,
          entities: input.entities,
          schema_version: 1,
          sync_kind: input.kind,
        },
      })

      try {
        await createBackgroundJobItems(supabase, input.itemDefinitions.map((item) => ({
          id: crypto.randomUUID(),
          jobId: job.id,
          userId: input.actorId,
          itemKey: item.itemKey,
          label: item.label,
          status: 'pending',
          progressCurrent: 0,
          progressTotal: 1,
          metadata: item.metadata,
        })))
      } catch (error) {
        await supabase.from('background_jobs').delete().eq('id', job.id)
        throw error
      }
      return job
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
      return await updateBackgroundJobWhenStatus(supabase, jobId, ['pending', 'processing'], {
        completed_at: new Date().toISOString(),
        status: 'cancelled',
      })
    },

    async resetOwnedJob(actorId, jobId) {
      const job = await findOwnedBackgroundJobById(supabase, actorId, jobId)
      if (!job || job.job_type !== 'moodle_sync' || job.source !== 'sync') return null
      const reset = await updateBackgroundJobWhenStatus(
        supabase,
        jobId,
        ['failed', 'cancelled'] satisfies BackgroundJobStatus[],
        {
          completed_at: null,
          error_count: 0,
          error_message: null,
          processed_items: 0,
          started_at: null,
          status: 'pending',
          success_count: 0,
        },
      )
      if (!reset) return null
      const { error } = await supabase
        .from('background_job_items')
        .update({
          completed_at: null,
          error_message: null,
          metadata: {},
          progress_current: 0,
          started_at: null,
          status: 'pending',
        })
        .eq('job_id', jobId)
      if (error) throw error
      return reset
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

    async getPreferences(actorId) {
      const { data, error } = await supabase
        .from('user_sync_preferences')
        .select('selected_keys, include_empty_courses, include_finished')
        .eq('user_id', actorId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        includeEmptyCourses: data.include_empty_courses,
        includeFinished: data.include_finished,
        selectedKeys: data.selected_keys ?? [],
      }
    },

    async savePreferences(actorId, preferences) {
      const { data, error } = await supabase
        .from('user_sync_preferences')
        .upsert({
          user_id: actorId,
          selected_keys: preferences.selectedKeys,
          include_empty_courses: preferences.includeEmptyCourses,
          include_finished: preferences.includeFinished,
        }, { onConflict: 'user_id' })
        .select('selected_keys, include_empty_courses, include_finished')
        .single()
      if (error || !data) throw error ?? new Error('Failed to persist sync preferences')
      return {
        includeEmptyCourses: data.include_empty_courses,
        includeFinished: data.include_finished,
        selectedKeys: data.selected_keys ?? [],
      }
    },
  }
}
