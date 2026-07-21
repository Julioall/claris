import { createServiceClient, type AppSupabaseClient, type Json } from '../../db/mod.ts'
import {
  appendBackgroundJobEvent,
  findBackgroundJobById,
  listBackgroundJobItems,
  updateBackgroundJobItem,
  updateBackgroundJobWhenStatus,
  type BackgroundJobItemRecord,
  type BackgroundJobRecord,
} from '../background-jobs/repository.ts'
import {
  findMoodleReauthCredentialByUserId,
  markMoodleReauthFailure,
  markMoodleReauthSuccess,
} from '../moodle-reauth/repository.ts'
import { findUserById, touchUserLastSync } from '../users/repository.ts'
import { recalculateRiskForCourses } from '../risk/recalculation.ts'
import { decryptMoodleReauthPayload } from '../../security/moodle-reauth-crypto.ts'
import { getMoodleToken } from '../../moodle/mod.ts'
import { syncCourses, linkSelectedCourses } from '../../../moodle-sync-courses/service.ts'
import { syncStudents } from '../../../moodle-sync-students/service.ts'
import { syncActivities } from '../../../moodle-sync-activities/service.ts'
import { syncGrades } from '../../../moodle-sync-grades/service.ts'

export const MOODLE_SYNC_JOB_TYPE = 'moodle_sync'
export type MoodleSyncEntity = 'students' | 'activities' | 'grades'
export type MoodleSyncKind = 'initial' | 'incremental'

export interface MoodleSyncJobMetadata {
  course_ids: string[]
  entities: MoodleSyncEntity[]
  schema_version: 1
  sync_kind: MoodleSyncKind
}

interface MoodleAccess {
  moodleUrl: string
  token: string
}

interface CourseRecord {
  id: string
  moodle_course_id: string
  name: string
}

interface EntityResult {
  errorCount: number
  totalCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readMetadata(value: Json): MoodleSyncJobMetadata {
  if (!isRecord(value)) throw new Error('Invalid Moodle sync job metadata')
  const courseIds = value.course_ids
  const entities = value.entities
  const syncKind = value.sync_kind

  if (
    !Array.isArray(courseIds)
    || !courseIds.every((item): item is string => typeof item === 'string')
    || !Array.isArray(entities)
    || !entities.every((item): item is MoodleSyncEntity => (
      item === 'students' || item === 'activities' || item === 'grades'
    ))
    || (syncKind !== 'initial' && syncKind !== 'incremental')
  ) {
    throw new Error('Invalid Moodle sync job metadata')
  }

  return {
    course_ids: courseIds,
    entities,
    schema_version: 1,
    sync_kind: syncKind,
  }
}

async function parseServiceResponse(response: Response): Promise<Record<string, unknown>> {
  let payload: Record<string, unknown> = {}
  try {
    const parsed = await response.json()
    if (isRecord(parsed)) payload = parsed
  } catch {
    payload = {}
  }

  if (!response.ok || typeof payload.error === 'string') {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : `Moodle sync service failed with status ${response.status}`,
    )
  }

  return payload
}

export async function resolveMoodleAccess(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<MoodleAccess> {
  const credential = await findMoodleReauthCredentialByUserId(supabase, userId)
  if (!credential?.reauth_enabled || !credential.credential_ciphertext) {
    throw new Error(
      'A reautorizacao automatica do Moodle precisa estar ativa. Faca login novamente para registrar a credencial no servidor.',
    )
  }

  try {
    const { password } = await decryptMoodleReauthPayload(credential.credential_ciphertext)
    const tokenResponse = await getMoodleToken(
      credential.moodle_url,
      credential.moodle_username,
      password,
      credential.moodle_service,
    )

    if (!tokenResponse.token || tokenResponse.error) {
      throw new Error(tokenResponse.error || 'Nao foi possivel reautorizar a sessao do Moodle')
    }

    await markMoodleReauthSuccess(supabase, userId, new Date().toISOString())
    return { moodleUrl: credential.moodle_url, token: tokenResponse.token }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao reautorizar a sessao do Moodle'
    await markMoodleReauthFailure(supabase, userId, message).catch(() => undefined)
    throw new Error(message)
  }
}

async function listCourses(
  supabase: AppSupabaseClient,
  courseIds: string[],
): Promise<CourseRecord[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('id, moodle_course_id, name')
    .in('id', courseIds)

  if (error) throw error
  const rows = (data ?? []) as CourseRecord[]
  const byId = new Map(rows.map((course) => [course.id, course]))
  return courseIds.map((courseId) => byId.get(courseId)).filter((course): course is CourseRecord => Boolean(course))
}

function itemByKey(items: BackgroundJobItemRecord[], key: string): BackgroundJobItemRecord {
  const item = items.find((candidate) => candidate.item_key === key)
  if (!item) throw new Error(`Moodle sync job item not found: ${key}`)
  return item
}

async function isCancelled(supabase: AppSupabaseClient, jobId: string): Promise<boolean> {
  return (await findBackgroundJobById(supabase, jobId))?.status === 'cancelled'
}

async function markItemProcessing(
  supabase: AppSupabaseClient,
  item: BackgroundJobItemRecord,
): Promise<void> {
  await updateBackgroundJobItem(supabase, item.id, {
    completed_at: null,
    error_message: null,
    progress_current: 0,
    started_at: new Date().toISOString(),
    status: 'processing',
  })
}

async function markItemCompleted(
  supabase: AppSupabaseClient,
  item: BackgroundJobItemRecord,
  result: EntityResult,
): Promise<void> {
  await updateBackgroundJobItem(supabase, item.id, {
    completed_at: new Date().toISOString(),
    error_message: result.errorCount > 0 ? `${result.errorCount} lote(s) com erro.` : null,
    metadata: {
      ...(isRecord(item.metadata) ? item.metadata : {}),
      error_count: result.errorCount,
      total_count: result.totalCount,
    },
    progress_current: item.progress_total,
    status: result.errorCount > 0 ? 'failed' : 'completed',
  })
}

async function markItemFailed(
  supabase: AppSupabaseClient,
  item: BackgroundJobItemRecord,
  error: unknown,
): Promise<void> {
  await updateBackgroundJobItem(supabase, item.id, {
    completed_at: new Date().toISOString(),
    error_message: error instanceof Error ? error.message : 'Falha inesperada na etapa de sincronizacao.',
    progress_current: item.progress_total,
    status: 'failed',
  })
}

async function syncPagedEntity(
  entity: Extract<MoodleSyncEntity, 'activities' | 'grades'>,
  access: MoodleAccess,
  moodleCourseId: number,
): Promise<EntityResult> {
  let page = 1
  let totalCount = 0
  let guard = 0

  while (guard < 200) {
    guard += 1
    const response = entity === 'activities'
      ? await syncActivities(access.moodleUrl, access.token, moodleCourseId, {
        studentBatchPage: page,
        studentBatchSize: 12,
      })
      : await syncGrades(access.moodleUrl, access.token, moodleCourseId, {
        studentBatchPage: page,
        studentBatchSize: 10,
      })
    const payload = await parseServiceResponse(response)
    totalCount += Number(payload[entity === 'activities' ? 'activitiesCount' : 'gradesCount'] ?? 0)

    if (payload.hasMore !== true) return { errorCount: 0, totalCount }
    const nextPage = Number(payload.nextStudentBatchPage)
    page = Number.isSafeInteger(nextPage) && nextPage > page ? nextPage : page + 1
  }

  throw new Error('Limite de lotes excedido durante a sincronizacao do curso')
}

async function syncCourseEntity(
  entity: MoodleSyncEntity,
  access: MoodleAccess,
  course: CourseRecord,
): Promise<EntityResult> {
  const moodleCourseId = Number.parseInt(course.moodle_course_id, 10)
  if (!Number.isSafeInteger(moodleCourseId) || moodleCourseId <= 0) {
    throw new Error(`Curso ${course.name} nao possui um identificador Moodle valido.`)
  }

  if (entity === 'students') {
    const payload = await parseServiceResponse(
      await syncStudents(access.moodleUrl, access.token, moodleCourseId),
    )
    return {
      errorCount: 0,
      totalCount: Array.isArray(payload.students) ? payload.students.length : 0,
    }
  }

  return await syncPagedEntity(entity, access, moodleCourseId)
}

async function appendActivityFeed(
  supabase: AppSupabaseClient,
  job: BackgroundJobRecord,
  status: 'completed' | 'failed',
  metadata: MoodleSyncJobMetadata,
): Promise<void> {
  const { error } = await supabase.from('activity_feed').insert({
    user_id: job.user_id,
    event_type: status === 'completed' ? 'sync_finish' : 'sync_error',
    title: status === 'completed' ? 'Sincronizacao concluida' : 'Falha na sincronizacao',
    description: status === 'completed'
      ? `${metadata.course_ids.length} curso(s) foram atualizados pelo servidor.`
      : 'O job de sincronizacao foi finalizado com erros. Consulte os detalhes para tentar novamente.',
    metadata: {
      job_id: job.id,
      severity: status === 'completed' ? 'info' : 'warning',
      sync_kind: metadata.sync_kind,
    },
  })
  if (error) throw error
}

async function finishJob(
  supabase: AppSupabaseClient,
  job: BackgroundJobRecord,
  metadata: MoodleSyncJobMetadata,
  counts: { error: number; processed: number; success: number },
): Promise<void> {
  if (await isCancelled(supabase, job.id)) return
  const status = counts.error > 0 ? 'failed' : 'completed'
  const completedAt = new Date().toISOString()
  const completedJob = await updateBackgroundJobWhenStatus(supabase, job.id, ['processing'], {
    completed_at: completedAt,
    error_count: counts.error,
    error_message: counts.error > 0 ? `${counts.error} etapa(s) falharam.` : null,
    processed_items: counts.processed,
    status,
    success_count: counts.success,
  })
  if (!completedJob) return
  await appendBackgroundJobEvent(supabase, {
    userId: job.user_id,
    jobId: job.id,
    eventType: status === 'completed' ? 'job_completed' : 'job_failed',
    level: status === 'completed' ? 'info' : 'error',
    message: status === 'completed'
      ? 'Sincronizacao Moodle concluida pelo servidor.'
      : 'Sincronizacao Moodle concluida com erros.',
    metadata: { error_count: counts.error, success_count: counts.success },
  })
  await appendActivityFeed(supabase, job, status, metadata).catch((error) => {
    console.error('[moodle-sync-job] Failed to append activity feed:', error)
  })
  await touchUserLastSync(supabase, job.user_id, completedAt)
}

export async function runMoodleSyncJob(
  jobId: string,
  supabase: AppSupabaseClient = createServiceClient(),
): Promise<void> {
  const job = await findBackgroundJobById(supabase, jobId)
  if (!job || job.job_type !== MOODLE_SYNC_JOB_TYPE || job.source !== 'sync') return

  const claimed = await updateBackgroundJobWhenStatus(supabase, job.id, ['pending'], {
    completed_at: null,
    error_count: 0,
    error_message: null,
    processed_items: 0,
    started_at: new Date().toISOString(),
    status: 'processing',
    success_count: 0,
  })
  if (!claimed) return

  let metadata: MoodleSyncJobMetadata | null = null
  const counts = { error: 0, processed: 0, success: 0 }

  try {
    metadata = readMetadata(job.metadata)
    const items = await listBackgroundJobItems(supabase, job.id)
    await appendBackgroundJobEvent(supabase, {
      userId: job.user_id,
      jobId: job.id,
      eventType: 'job_processing',
      message: 'Sincronizacao Moodle assumida pelo worker.',
      metadata: { sync_kind: metadata.sync_kind },
    })

    const access = await resolveMoodleAccess(supabase, job.user_id)
    const user = await findUserById(supabase, job.user_id)
    if (!user?.moodle_user_id) throw new Error('Usuario autenticado nao possui perfil Moodle.')

    if (metadata.sync_kind === 'initial') {
      const item = itemByKey(items, 'courses')
      await markItemProcessing(supabase, item)
      try {
        await parseServiceResponse(
          await syncCourses(access.moodleUrl, access.token, String(user.moodle_user_id), {
            autoLinkTutorCourses: false,
          }),
        )
        await parseServiceResponse(await linkSelectedCourses(job.user_id, metadata.course_ids))
        await markItemCompleted(supabase, item, {
          errorCount: 0,
          totalCount: metadata.course_ids.length,
        })
        counts.success += 1
      } catch (error) {
        await markItemFailed(supabase, item, error)
        counts.error += 1
        throw error
      } finally {
        counts.processed += 1
      }
    }

    const courses = await listCourses(supabase, metadata.course_ids)
    if (courses.length !== metadata.course_ids.length) {
      throw new Error('Um ou mais cursos do job nao estao mais disponiveis.')
    }

    for (const entity of metadata.entities) {
      for (const course of courses) {
        if (await isCancelled(supabase, job.id)) return
        const item = itemByKey(items, `${entity}:${course.id}`)
        await markItemProcessing(supabase, item)
        try {
          const result = await syncCourseEntity(entity, access, course)
          await markItemCompleted(supabase, item, result)
          if (result.errorCount > 0) counts.error += 1
          else counts.success += 1
        } catch (error) {
          await markItemFailed(supabase, item, error)
          counts.error += 1
        } finally {
          counts.processed += 1
          await updateBackgroundJobWhenStatus(supabase, job.id, ['processing'], {
            error_count: counts.error,
            processed_items: counts.processed,
            success_count: counts.success,
          })
        }
      }
    }

    if (metadata.entities.includes('students') && !await isCancelled(supabase, job.id)) {
      const item = itemByKey(items, 'risk')
      await markItemProcessing(supabase, item)
      try {
        const result = await recalculateRiskForCourses(supabase, metadata.course_ids)
        await markItemCompleted(supabase, item, {
          errorCount: result.failedCount,
          totalCount: result.updatedCount,
        })
        if (result.failedCount > 0 || result.missingRpc) counts.error += 1
        else counts.success += 1
      } catch (error) {
        await markItemFailed(supabase, item, error)
        counts.error += 1
      } finally {
        counts.processed += 1
      }
    }

    await finishJob(supabase, job, metadata, counts)
  } catch (error) {
    if (await isCancelled(supabase, job.id)) return
    const message = error instanceof Error ? error.message : 'Falha inesperada na sincronizacao Moodle.'
    const failedJob = await updateBackgroundJobWhenStatus(supabase, job.id, ['processing'], {
      completed_at: new Date().toISOString(),
      error_count: Math.max(1, counts.error),
      error_message: message,
      processed_items: counts.processed,
      status: 'failed',
      success_count: counts.success,
    })
    if (!failedJob) return
    await appendBackgroundJobEvent(supabase, {
      userId: job.user_id,
      jobId: job.id,
      eventType: 'job_failed',
      level: 'error',
      message,
    })
    if (metadata) {
      await appendActivityFeed(supabase, job, 'failed', metadata).catch(() => undefined)
    }
  }
}

export function scheduleMoodleSyncJob(jobId: string): void {
  const task = runMoodleSyncJob(jobId).catch((error) => {
    console.error('[moodle-sync-job] Unhandled worker error:', error)
  })
  const runtime = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void }
  }
  if (runtime.EdgeRuntime?.waitUntil) runtime.EdgeRuntime.waitUntil(task)
}
