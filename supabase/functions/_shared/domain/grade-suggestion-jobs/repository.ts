import type {
  AppSupabaseClient,
  Enums,
  Json,
  Tables,
  TablesUpdate,
} from '../../db/mod.ts'
import {
  appendBackgroundJobEvent,
  createBackgroundJobItems,
  updateBackgroundJob,
  updateBackgroundJobItem,
  upsertBackgroundJob,
} from '../background-jobs/repository.ts'

export type GradeSuggestionJob = Tables<'ai_grade_suggestion_jobs'>
export type GradeSuggestionJobItem = Tables<'ai_grade_suggestion_job_items'>
export type GradeSuggestionJobStatus = Enums<'ai_grade_suggestion_job_status'> | 'cancelled'
export type GradeSuggestionJobItemStatus = Enums<'ai_grade_suggestion_job_item_status'> | 'cancelled'

async function syncBackgroundJob(task: () => Promise<void>) {
  try {
    await task()
  } catch (error) {
    console.error('[grade-suggestion-jobs][background-jobs] sync failed:', error)
  }
}

async function mirrorGradeSuggestionJobCreate(
  supabase: AppSupabaseClient,
  input: {
    job: GradeSuggestionJob
    items: GradeSuggestionJobItem[]
  },
) {
  await upsertBackgroundJob(supabase, {
    id: input.job.id,
    userId: input.job.user_id,
    courseId: input.job.course_id,
    jobType: 'ai_grade_suggestion',
    source: 'ai-grading',
    sourceTable: 'ai_grade_suggestion_jobs',
    sourceRecordId: input.job.id,
    title: 'Correcao por IA em lote',
    description: input.job.activity_name,
    status: input.job.status,
    totalItems: input.job.total_items,
    processedItems: input.job.processed_items,
    successCount: input.job.success_count,
    errorCount: input.job.error_count,
    startedAt: input.job.started_at,
    completedAt: input.job.completed_at,
    errorMessage: input.job.error_message,
    metadata: {
      activity_name: input.job.activity_name,
      max_grade: input.job.max_grade,
      moodle_activity_id: input.job.moodle_activity_id,
    },
  })

  await createBackgroundJobItems(supabase, input.items.map((item) => ({
    id: item.id,
    jobId: input.job.id,
    userId: item.user_id,
    sourceTable: 'ai_grade_suggestion_job_items',
    sourceRecordId: item.id,
    itemKey: item.student_activity_id,
    label: item.student_name,
    status: item.status,
    progressCurrent: item.status === 'completed' || item.status === 'failed' ? 1 : 0,
    progressTotal: 1,
    startedAt: item.started_at,
    completedAt: item.completed_at,
    errorMessage: item.error_message,
    metadata: {
      moodle_activity_id: item.moodle_activity_id,
      student_id: item.student_id,
      student_activity_id: item.student_activity_id,
      audit_id: item.audit_id,
    },
  })))

  await appendBackgroundJobEvent(supabase, {
    userId: input.job.user_id,
    jobId: input.job.id,
    eventType: 'job_created',
    message: `Job criado para ${input.items.length} entrega(s).`,
    metadata: {
      moodle_activity_id: input.job.moodle_activity_id,
    },
  })
}

export interface GradeSuggestionJobItemDraft {
  moodleActivityId: string
  studentActivityId: string
  studentId: string
  studentName: string
}

interface CreateGradeSuggestionJobInput {
  activityName: string
  courseId: string
  items: GradeSuggestionJobItemDraft[]
  maxGrade: number | null
  moodleActivityId: string
  userId: string
}

interface BackendRpcResult {
  data: unknown
  error: unknown | null
}

interface BackendRpcClient {
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<BackendRpcResult>
}

async function callBackendRpc(
  supabase: AppSupabaseClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await (supabase as unknown as BackendRpcClient).rpc(functionName, args)
  if (error) throw error
  return data
}

function parseRpcUuid(value: unknown, operation: string): string {
  if (
    typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error(`Invalid UUID returned by ${operation}`)
  }
  return value
}

export async function findActiveGradeSuggestionJobForActivity(
  supabase: AppSupabaseClient,
  input: { courseId: string; moodleActivityId: string; userId: string },
): Promise<GradeSuggestionJob | null> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_jobs')
    .select('*')
    .eq('user_id', input.userId)
    .eq('course_id', input.courseId)
    .eq('moodle_activity_id', input.moodleActivityId)
    .in('status', ['pending', 'processing', 'failed'])
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) throw error

  const jobs = data ?? []

  return jobs.find((job) => (
    job.status === 'pending' ||
    job.status === 'processing' ||
    (job.status === 'failed' && job.processed_items < job.total_items)
  )) ?? null
}

export async function createGradeSuggestionJobWithItems(
  supabase: AppSupabaseClient,
  input: CreateGradeSuggestionJobInput,
): Promise<GradeSuggestionJob> {
  const jobId = parseRpcUuid(await callBackendRpc(
    supabase,
    'backend_create_grade_suggestion_job_with_items',
    {
      p_activity_name: input.activityName,
      p_course_id: input.courseId,
      p_items: input.items.map((item) => ({
        moodle_activity_id: item.moodleActivityId,
        student_activity_id: item.studentActivityId,
        student_id: item.studentId,
        student_name: item.studentName,
      })) as Json,
      p_max_grade: input.maxGrade,
      p_moodle_activity_id: input.moodleActivityId,
      p_user_id: input.userId,
    },
  ), 'grade suggestion job creation')

  const [job, items] = await Promise.all([
    findGradeSuggestionJobForUser(supabase, jobId, input.userId),
    listGradeSuggestionJobItems(supabase, jobId),
  ])
  if (!job) throw new Error('Falha ao carregar job de correcao em lote criado')

  await syncBackgroundJob(async () => {
    await mirrorGradeSuggestionJobCreate(supabase, { job, items })
  })

  return job
}

export async function findGradeSuggestionJobForUser(
  supabase: AppSupabaseClient,
  jobId: string,
  userId: string,
): Promise<GradeSuggestionJob | null> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function listGradeSuggestionJobItems(
  supabase: AppSupabaseClient,
  jobId: string,
): Promise<GradeSuggestionJobItem[]> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_job_items')
    .select('*')
    .eq('job_id', jobId)
    .order('student_name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function listPendingGradeSuggestionJobItems(
  supabase: AppSupabaseClient,
  jobId: string,
  limit: number,
): Promise<Pick<GradeSuggestionJobItem, 'id'>[]> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_job_items')
    .select('id')
    .eq('job_id', jobId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function loadGradeSuggestionJobItem(
  supabase: AppSupabaseClient,
  itemId: string,
): Promise<GradeSuggestionJobItem | null> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_job_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function claimGradeSuggestionJobItem(
  supabase: AppSupabaseClient,
  itemId: string,
  startedAt: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_job_items')
    .update({
      started_at: startedAt,
      status: 'processing',
    })
    .eq('id', itemId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) throw error

  if (data) {
    await syncBackgroundJob(async () => {
      const item = await loadGradeSuggestionJobItem(supabase, itemId)
      if (!item) return

      await updateBackgroundJobItem(supabase, itemId, {
        started_at: startedAt,
        progress_current: 0,
        progress_total: 1,
        status: 'processing',
      })
      await appendBackgroundJobEvent(supabase, {
        userId: item.user_id,
        jobId: item.job_id,
        jobItemId: item.id,
        eventType: 'job_item_processing',
        message: `Entrega de ${item.student_name} entrou em processamento.`,
      })
    })
  }

  return Boolean(data)
}

export async function markGradeSuggestionJobProcessing(
  supabase: AppSupabaseClient,
  jobId: string,
  startedAt: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_jobs')
    .update({
      error_message: null,
      started_at: startedAt,
      status: 'processing',
    })
    .eq('id', jobId)
    .in('status', ['pending', 'processing', 'failed'])
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) return

  await syncBackgroundJob(async () => {
    const job = await findGradeSuggestionJobById(supabase, jobId)
    if (!job) return

    await updateBackgroundJob(supabase, jobId, {
      error_message: null,
      started_at: startedAt,
      status: 'processing',
    })
    await appendBackgroundJobEvent(supabase, {
      userId: job.user_id,
      jobId,
      eventType: 'job_processing',
      message: 'Job entrou em processamento.',
    })
  })
}

export async function markGradeSuggestionJobPending(
  supabase: AppSupabaseClient,
  jobId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_jobs')
    .update({
      status: 'pending',
    })
    .eq('id', jobId)
    .eq('status', 'processing')
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) return

  await syncBackgroundJob(async () => {
    const job = await findGradeSuggestionJobById(supabase, jobId)
    if (!job) return

    await updateBackgroundJob(supabase, jobId, {
      status: 'pending',
    })
    await appendBackgroundJobEvent(supabase, {
      userId: job.user_id,
      jobId,
      eventType: 'job_pending',
      message: 'Job voltou para a fila.',
    })
  })
}

export async function requeueStaleGradeSuggestionJobItems(
  supabase: AppSupabaseClient,
  jobId: string,
  staleBefore: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_job_items')
    .update({
      completed_at: null,
      error_message: null,
      started_at: null,
      status: 'pending' as TablesUpdate<'ai_grade_suggestion_job_items'>['status'],
    })
    .eq('job_id', jobId)
    .eq('status', 'processing')
    .lt('updated_at', staleBefore)
    .select('id')

  if (error) throw error

  const staleItems = data ?? []

  await syncBackgroundJob(async () => {
    for (const row of staleItems) {
      await updateBackgroundJobItem(supabase, row.id, {
        completed_at: null,
        error_message: null,
        started_at: null,
        status: 'pending',
      })
    }
  })

  return staleItems.length
}

export async function cancelGradeSuggestionJob(
  supabase: AppSupabaseClient,
  jobId: string,
  input: {
    errorMessage: string
    userId: string
  },
): Promise<boolean> {
  const cancelled = await callBackendRpc(
    supabase,
    'backend_cancel_grade_suggestion_job',
    {
      p_error_message: input.errorMessage,
      p_job_id: jobId,
      p_user_id: input.userId,
    },
  )
  if (typeof cancelled !== 'boolean') {
    throw new Error('Invalid result returned by grade suggestion job cancellation')
  }
  if (!cancelled) return false

  await syncBackgroundJob(async () => {
    const [job, items] = await Promise.all([
      findGradeSuggestionJobForUser(supabase, jobId, input.userId),
      listGradeSuggestionJobItems(supabase, jobId),
    ])
    if (!job) return

    await updateBackgroundJob(supabase, jobId, {
      completed_at: job.completed_at,
      error_message: job.error_message,
      processed_items: job.processed_items,
      success_count: job.success_count,
      error_count: job.error_count,
      total_items: job.total_items,
      status: 'cancelled',
    })
    for (const item of items.filter((candidate) => candidate.status === 'cancelled')) {
      await updateBackgroundJobItem(supabase, item.id, {
        completed_at: item.completed_at,
        error_message: item.error_message,
        progress_current: 1,
        progress_total: 1,
        status: 'cancelled',
      })
    }
    await appendBackgroundJobEvent(supabase, {
      userId: job.user_id,
      jobId,
      eventType: 'job_cancelled',
      level: 'warning',
      message: input.errorMessage,
    })
  })

  return true
}

export async function updateGradeSuggestionJobProgress(
  supabase: AppSupabaseClient,
  jobId: string,
): Promise<{
  errorCount: number
  pendingCount: number
  processedItems: number
  successCount: number
  totalItems: number
}> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_job_items')
    .select('status')
    .eq('job_id', jobId)

  if (error) throw error

  const rows = data ?? []
  const totalItems = rows.length
  const successCount = rows.filter((row) => row.status === 'completed').length
  const errorCount = rows.filter((row) => row.status === 'failed').length
  const cancelledCount = rows.filter((row) => row.status === ('cancelled' as GradeSuggestionJobItemStatus)).length
  const pendingCount = rows.filter((row) => row.status === 'pending').length
  const processedItems = successCount + errorCount + cancelledCount

  const { error: updateError } = await supabase
    .from('ai_grade_suggestion_jobs')
    .update({
      error_count: errorCount,
      processed_items: processedItems,
      success_count: successCount,
      total_items: totalItems,
    })
    .eq('id', jobId)

  if (updateError) throw updateError

  await syncBackgroundJob(async () => {
    const job = await findGradeSuggestionJobById(supabase, jobId)
    if (!job) return

    await updateBackgroundJob(supabase, jobId, {
      error_count: errorCount,
      processed_items: processedItems,
      success_count: successCount,
      total_items: totalItems,
    })
    await appendBackgroundJobEvent(supabase, {
      userId: job.user_id,
      jobId,
      eventType: 'job_progress',
      message: `Progresso atualizado: ${processedItems}/${totalItems} entrega(s).`,
      metadata: {
        error_count: errorCount,
        pending_count: pendingCount,
        processed_items: processedItems,
        success_count: successCount,
        total_items: totalItems,
      },
    })
  })

  return {
    errorCount,
    pendingCount,
    processedItems,
    successCount,
    totalItems,
  }
}

export async function completeGradeSuggestionJob(
  supabase: AppSupabaseClient,
  jobId: string,
  input: {
    completedAt: string
    errorCount: number
    processedItems: number
    status: GradeSuggestionJobStatus
    successCount: number
    totalItems: number
  },
): Promise<void> {
  const eligibleStatuses: GradeSuggestionJobStatus[] = input.status === 'cancelled'
    ? ['cancelled']
    : ['pending', 'processing']
  const { data, error } = await supabase
    .from('ai_grade_suggestion_jobs')
    .update({
      completed_at: input.completedAt,
      error_count: input.errorCount,
      processed_items: input.processedItems,
      status: input.status,
      success_count: input.successCount,
      total_items: input.totalItems,
    })
    .eq('id', jobId)
    .in('status', eligibleStatuses)
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) return

  await syncBackgroundJob(async () => {
    const job = await findGradeSuggestionJobById(supabase, jobId)
    if (!job) return

    await updateBackgroundJob(supabase, jobId, {
      completed_at: input.completedAt,
      error_count: input.errorCount,
      processed_items: input.processedItems,
      status: input.status as 'completed' | 'failed' | 'cancelled',
      success_count: input.successCount,
      total_items: input.totalItems,
    })
    await appendBackgroundJobEvent(supabase, {
      userId: job.user_id,
      jobId,
      eventType: 'job_completed',
      level: input.status === 'failed' ? 'error' : 'info',
      message: input.status === 'failed'
        ? `Job finalizado com falha. ${input.errorCount} erro(s).`
        : `Job concluido com ${input.successCount} sucesso(s) e ${input.errorCount} erro(s).`,
      metadata: {
        error_count: input.errorCount,
        processed_items: input.processedItems,
        status: input.status,
        success_count: input.successCount,
        total_items: input.totalItems,
      },
    })
  })
}

export async function failGradeSuggestionJob(
  supabase: AppSupabaseClient,
  jobId: string,
  errorMessage: string,
  completedAt: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_jobs')
    .update({
      completed_at: completedAt,
      error_message: errorMessage,
      status: 'failed',
    })
    .eq('id', jobId)
    .in('status', ['pending', 'processing', 'failed'])
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) return

  await syncBackgroundJob(async () => {
    const job = await findGradeSuggestionJobById(supabase, jobId)
    if (!job) return

    await updateBackgroundJob(supabase, jobId, {
      completed_at: completedAt,
      error_message: errorMessage,
      status: 'failed',
    })
    await appendBackgroundJobEvent(supabase, {
      userId: job.user_id,
      jobId,
      eventType: 'job_failed',
      level: 'error',
      message: errorMessage,
    })
  })
}

export async function completeGradeSuggestionJobItem(
  supabase: AppSupabaseClient,
  input: {
    auditId: string | null
    completedAt: string
    itemId: string
    resultPayload: Json
  },
): Promise<void> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_job_items')
    .update({
      audit_id: input.auditId,
      completed_at: input.completedAt,
      error_message: null,
      result_payload: input.resultPayload,
      status: 'completed',
    })
    .eq('id', input.itemId)
    .eq('status', 'processing')
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) return

  await syncBackgroundJob(async () => {
    const item = await loadGradeSuggestionJobItem(supabase, input.itemId)
    if (!item) return

    await updateBackgroundJobItem(supabase, input.itemId, {
      completed_at: input.completedAt,
      error_message: null,
      metadata: {
        audit_id: input.auditId,
        result_payload: input.resultPayload,
      },
      progress_current: 1,
      progress_total: 1,
      status: 'completed',
    })
    await appendBackgroundJobEvent(supabase, {
      userId: item.user_id,
      jobId: item.job_id,
      jobItemId: item.id,
      eventType: 'job_item_completed',
      message: `Sugestao concluida para ${item.student_name}.`,
      metadata: {
        audit_id: input.auditId,
      },
    })
  })
}

export async function failGradeSuggestionJobItem(
  supabase: AppSupabaseClient,
  input: {
    auditId?: string | null
    completedAt: string
    errorMessage: string
    itemId: string
    resultPayload: Json
  },
): Promise<void> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_job_items')
    .update({
      audit_id: input.auditId ?? null,
      completed_at: input.completedAt,
      error_message: input.errorMessage,
      result_payload: input.resultPayload,
      status: 'failed',
    })
    .eq('id', input.itemId)
    .eq('status', 'processing')
    .select('id')
    .maybeSingle()

  if (error) throw error
  if (!data) return

  await syncBackgroundJob(async () => {
    const item = await loadGradeSuggestionJobItem(supabase, input.itemId)
    if (!item) return

    await updateBackgroundJobItem(supabase, input.itemId, {
      completed_at: input.completedAt,
      error_message: input.errorMessage,
      metadata: {
        audit_id: input.auditId ?? null,
        result_payload: input.resultPayload,
      },
      progress_current: 1,
      progress_total: 1,
      status: 'failed',
    })
    await appendBackgroundJobEvent(supabase, {
      userId: item.user_id,
      jobId: item.job_id,
      jobItemId: item.id,
      eventType: 'job_item_failed',
      level: 'error',
      message: `Falha ao processar ${item.student_name}: ${input.errorMessage}`,
      metadata: {
        audit_id: input.auditId ?? null,
      },
    })
  })
}

async function findGradeSuggestionJobById(
  supabase: AppSupabaseClient,
  jobId: string,
): Promise<GradeSuggestionJob | null> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()

  if (error) throw error
  return data
}
