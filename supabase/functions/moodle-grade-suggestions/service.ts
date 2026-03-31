import { refreshDashboardCourseActivityAggregates } from '../_shared/domain/dashboard-activity-aggregates.ts'
import {
  claimGradeSuggestionJobItem,
  completeGradeSuggestionJob,
  completeGradeSuggestionJobItem,
  createGradeSuggestionJobWithItems,
  failGradeSuggestionJob,
  failGradeSuggestionJobItem,
  findActiveGradeSuggestionJobForActivity,
  findGradeSuggestionJobForUser,
  listGradeSuggestionJobItems,
  listPendingGradeSuggestionJobItems,
  loadGradeSuggestionJobItem,
  markGradeSuggestionJobProcessing,
  updateGradeSuggestionJobProgress,
} from '../_shared/domain/grade-suggestion-jobs/repository.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { executeAiEvaluation } from '../_shared/grade-suggestions/ai-evaluation.ts'
import { resolveGradeSuggestionRuntimeConfig } from '../_shared/grade-suggestions/config.ts'
import { buildActivityEvaluationContext } from '../_shared/grade-suggestions/context-builder.ts'
import { approveGradeSuggestion, generateGradeSuggestion } from '../_shared/grade-suggestions/orchestrator.ts'
import {
  findCourseForUser,
  findStudentActivityForSuggestion,
  findStudentForCourse,
  findUserFullName,
  insertGradeSuggestionAuditDraft,
  listStudentActivitiesForSuggestion,
  loadGradeSuggestionAuditForUser,
  markStudentActivityApproved,
  updateGradeSuggestionAudit,
} from '../_shared/grade-suggestions/repository.ts'
import { normalizeStudentSubmission } from '../_shared/grade-suggestions/submission-normalizer.ts'
import { jsonResponse } from '../_shared/http/mod.ts'
import { callMoodleApiPost } from '../_shared/moodle/mod.ts'
import type { MoodleGradeSuggestionPayload } from './payload.ts'

type SettingsJson = {
  provider?: string
  model?: string
  baseUrl?: string
  apiKey?: string
  configured?: boolean
  aiGradingSettings?: Record<string, unknown>
}

const BATCH_JOB_ITEMS_PER_RUN = 2
const BATCH_JOB_DELAY_MS = 250

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

async function readStoredLlmSettings(): Promise<SettingsJson> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('claris_llm_settings, ai_grading_settings')
    .eq('singleton_id', 'global')
    .maybeSingle()

  if (error || !data) return {}

  const rawSettings = asObject(data.claris_llm_settings)

  return {
    provider: asTrimmedString(rawSettings.provider),
    model: asTrimmedString(rawSettings.model),
    baseUrl: asTrimmedString(rawSettings.baseUrl),
    apiKey: asTrimmedString(rawSettings.apiKey),
    configured: Boolean(rawSettings.configured),
    aiGradingSettings: asObject(data.ai_grading_settings),
  }
}

function buildErrorResult(message: string) {
  return {
    success: false,
    result: {
      status: 'error',
      suggestedGrade: null,
      suggestedFeedback: null,
      confidence: 'low',
      sourcesUsed: [],
      warnings: [message],
      evaluationStatus: 'erro_controlado',
      reason: 'configuration_or_runtime_error',
    },
  }
}

function buildBatchErrorResult(message: string) {
  return {
    success: false,
    message,
    jobId: null,
    status: 'failed',
    totalItems: 0,
    processedItems: 0,
    successCount: 0,
    errorCount: 0,
    items: [],
  }
}

function buildControlledErrorSuggestionResult(message: string) {
  return {
    status: 'error' as const,
    suggestedGrade: null,
    suggestedFeedback: null,
    confidence: 'low' as const,
    sourcesUsed: [],
    warnings: [message],
    evaluationStatus: 'erro_controlado',
    reason: 'configuration_or_runtime_error',
  }
}

function queueBackgroundTask(task: Promise<unknown>) {
  const runtime = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void }
  }

  if (runtime.EdgeRuntime?.waitUntil) {
    runtime.EdgeRuntime.waitUntil(task)
    return
  }

  void task
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function scheduleActivitySuggestionJobRun(params: {
  jobId: string
  moodleUrl: string
  token: string
  userId: string
}) {
  queueBackgroundTask((async () => {
    await delay(BATCH_JOB_DELAY_MS)
    await processActivitySuggestionJob(params)
  })())
}

function isAssignActivityType(value: string | null | undefined) {
  return ['assign', 'assignment'].includes((value ?? '').toLowerCase())
}

function createContextLoader(params: {
  moodleUrl: string
  token: string
  courseId: string
  moodleCourseId: number
  moodleActivityId: string
  fallbackMaxGrade: number | null
  config: ReturnType<typeof resolveGradeSuggestionRuntimeConfig>
}) {
  let cachedContextPromise: Promise<Awaited<ReturnType<typeof buildActivityEvaluationContext>>> | null = null

  return () => {
    if (!cachedContextPromise) {
      cachedContextPromise = buildActivityEvaluationContext({
        moodleUrl: params.moodleUrl,
        token: params.token,
        courseId: params.courseId,
        moodleCourseId: params.moodleCourseId,
        moodleActivityId: params.moodleActivityId,
        fallbackMaxGrade: params.fallbackMaxGrade,
        config: params.config,
      })
    }

    return cachedContextPromise
  }
}

function createAuditFinalizer(
  supabase: ReturnType<typeof createServiceClient>,
  maxStoredTextLength: number,
) {
  return async (auditId: string, input: Parameters<typeof updateGradeSuggestionAudit>[2]) => {
    await updateGradeSuggestionAudit(supabase, auditId, {
      ...input,
      updated_at: new Date().toISOString(),
    }, maxStoredTextLength)
  }
}

async function runSuggestionGeneration(params: {
  supabase: ReturnType<typeof createServiceClient>
  payload: { moodleUrl: string; token: string }
  userId: string
  courseId: string
  studentId: string
  studentActivityId: string
  moodleActivityId: string
  fallbackMaxGrade: number | null
  moodleCourseId: number
  studentMoodleUserId: number
  config: ReturnType<typeof resolveGradeSuggestionRuntimeConfig>
  getContext: ReturnType<typeof createContextLoader>
  studentName?: string
  tutorName?: string
}) {
  const finalizeAudit = createAuditFinalizer(params.supabase, params.config.maxStoredTextLength)

  return await generateGradeSuggestion({
    userId: params.userId,
    studentId: params.studentId,
    courseId: params.courseId,
    studentActivityId: params.studentActivityId,
    moodleActivityId: params.moodleActivityId,
  }, {
    createDraftAudit: async (input) => {
      return await insertGradeSuggestionAuditDraft(params.supabase, {
        user_id: input.userId,
        student_id: input.studentId,
        course_id: input.courseId,
        student_activity_id: input.studentActivityId,
        moodle_activity_id: input.moodleActivityId,
        status: 'processing',
        warnings: [],
        sources_used: [],
      })
    },
    finalizeAudit: async (auditId, input) => {
      await finalizeAudit(auditId, {
        status: input.status,
        confidence: input.confidence ?? null,
        suggested_grade: input.suggestedGrade ?? null,
        suggested_feedback: input.suggestedFeedback ?? null,
        approved_grade: input.approvedGrade ?? null,
        approved_feedback: input.approvedFeedback ?? null,
        max_grade: input.maxGrade ?? null,
        moodle_assign_id: input.moodleAssignId ?? null,
        warnings: input.warnings ?? [],
        sources_used: input.sourcesUsed ?? [],
        context_summary: input.contextSummary ?? {},
        submission_summary: input.submissionSummary ?? {},
        prompt_payload: input.promptPayload ?? {},
        ai_response: input.aiResponse ?? {},
        provider: input.provider ?? null,
        model: input.model ?? null,
        error_message: input.errorMessage ?? null,
        approval_response: input.approvalResponse ?? {},
        approved_at: input.approvedAt ?? null,
      })
    },
    buildContext: async () => await params.getContext(),
    normalizeSubmission: async () => {
      const contextBuild = await params.getContext()
      return await normalizeStudentSubmission({
        moodleUrl: params.payload.moodleUrl,
        token: params.payload.token,
        assignmentId: contextBuild.moodleAssignId,
        studentMoodleUserId: params.studentMoodleUserId,
        studentId: params.studentId,
        config: params.config,
      })
    },
    evaluate: async ({ context, submission }) => {
      return await executeAiEvaluation({
        provider: params.config.provider,
        model: params.config.model,
        baseUrl: params.config.baseUrl,
        apiKey: params.config.apiKey,
        timeoutMs: params.config.timeoutMs,
        customInstructions: params.config.customInstructions,
        visionEnabled: params.config.visionEnabled,
      }, {
        maxGrade: context.maxGrade,
        activityContext: context,
        studentSubmission: submission,
        studentName: params.studentName,
        tutorName: params.tutorName,
      })
    },
    visionEnabled: params.config.visionEnabled,
  })
}

function normalizeJobItemResultPayload(value: unknown) {
  const raw = asObject(value)
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.map((warning) => String(warning).trim()).filter(Boolean)
    : []
  const sourcesUsed = Array.isArray(raw.sourcesUsed)
    ? raw.sourcesUsed.filter((entry) => entry && typeof entry === 'object')
    : []

  if (typeof raw.status !== 'string') {
    return undefined
  }

  return {
    status: raw.status,
    suggestedGrade:
      raw.suggestedGrade === null || raw.suggestedGrade === undefined || raw.suggestedGrade === ''
        ? null
        : Number.isFinite(Number(raw.suggestedGrade))
          ? Number(raw.suggestedGrade)
          : null,
    suggestedFeedback: typeof raw.suggestedFeedback === 'string' ? raw.suggestedFeedback : null,
    confidence: raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low'
      ? raw.confidence
      : 'low',
    sourcesUsed,
    warnings,
    evaluationStatus: typeof raw.evaluationStatus === 'string' ? raw.evaluationStatus : 'erro_controlado',
    reason: typeof raw.reason === 'string' ? raw.reason : undefined,
  }
}

function buildJobMessage(input: {
  errorCount: number
  processedItems: number
  status: string
  successCount: number
  totalItems: number
}) {
  if (input.status === 'completed') {
    return input.errorCount > 0
      ? `${input.successCount} sugestoes geradas e ${input.errorCount} com erro.`
      : `${input.successCount} sugestoes geradas com sucesso.`
  }

  if (input.status === 'failed') {
    return input.processedItems > 0
      ? `O job foi interrompido apos processar ${input.processedItems} de ${input.totalItems} entregas.`
      : 'Nao foi possivel iniciar o job de correcao em lote.'
  }

  return `Processadas ${input.processedItems} de ${input.totalItems} entregas.`
}

async function loadActivitySuggestionJobResponse(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  userId: string,
) {
  const job = await findGradeSuggestionJobForUser(supabase, jobId, userId)
  if (!job) {
    return null
  }

  const items = await listGradeSuggestionJobItems(supabase, jobId)

  return {
    success: job.status !== 'failed' || job.success_count > 0,
    jobId: job.id,
    status: job.status,
    activityName: job.activity_name,
    totalItems: job.total_items,
    processedItems: job.processed_items,
    successCount: job.success_count,
    errorCount: job.error_count,
    message: job.error_message || buildJobMessage({
      errorCount: job.error_count,
      processedItems: job.processed_items,
      status: job.status,
      successCount: job.success_count,
      totalItems: job.total_items,
    }),
    items: items.map((item) => ({
      id: item.id,
      studentId: item.student_id,
      studentActivityId: item.student_activity_id,
      studentName: item.student_name,
      status: item.status,
      auditId: item.audit_id ?? undefined,
      errorMessage: item.error_message ?? undefined,
      result: normalizeJobItemResultPayload(item.result_payload),
    })),
  }
}

async function processActivitySuggestionJob(params: {
  jobId: string
  moodleUrl: string
  token: string
  userId: string
}) {
  const supabase = createServiceClient()
  const startedAt = new Date().toISOString()

  await markGradeSuggestionJobProcessing(supabase, params.jobId, startedAt)

  try {
    const [job, storedSettings, tutorName] = await Promise.all([
      findGradeSuggestionJobForUser(supabase, params.jobId, params.userId),
      readStoredLlmSettings(),
      findUserFullName(supabase, params.userId),
    ])

    if (!job) {
      return
    }

    const course = await findCourseForUser(supabase, params.userId, job.course_id)
    if (!course) {
      await failGradeSuggestionJob(
        supabase,
        job.id,
        'Curso nao encontrado ou sem acesso para este usuario.',
        new Date().toISOString(),
      )
      return
    }

    const config = resolveGradeSuggestionRuntimeConfig(storedSettings, storedSettings.aiGradingSettings)
    if (!config.enabled) {
      await failGradeSuggestionJob(
        supabase,
        job.id,
        'A analise automatica de notas esta desabilitada no ambiente.',
        new Date().toISOString(),
      )
      return
    }

    if (!config.llmConfigured) {
      await failGradeSuggestionJob(
        supabase,
        job.id,
        'Configure a Claris IA global em Administracao > Configuracoes antes de usar a sugestao de notas.',
        new Date().toISOString(),
      )
      return
    }

    const pendingItems = await listPendingGradeSuggestionJobItems(supabase, job.id, BATCH_JOB_ITEMS_PER_RUN)

    if (pendingItems.length === 0) {
      const progress = await updateGradeSuggestionJobProgress(supabase, job.id)
      const finalStatus = progress.errorCount > 0 && progress.successCount === 0 ? 'failed' : 'completed'
      await completeGradeSuggestionJob(supabase, job.id, {
        completedAt: new Date().toISOString(),
        errorCount: progress.errorCount,
        processedItems: progress.processedItems,
        status: finalStatus,
        successCount: progress.successCount,
        totalItems: progress.totalItems,
      })
      return
    }

    const getContext = createContextLoader({
      moodleUrl: params.moodleUrl,
      token: params.token,
      courseId: job.course_id,
      moodleCourseId: Number(course.moodle_course_id),
      moodleActivityId: job.moodle_activity_id,
      fallbackMaxGrade: job.max_grade ?? null,
      config,
    })

    for (const pendingItem of pendingItems) {
      const claimed = await claimGradeSuggestionJobItem(supabase, pendingItem.id, new Date().toISOString())
      if (!claimed) {
        continue
      }

      const item = await loadGradeSuggestionJobItem(supabase, pendingItem.id)
      if (!item) {
        continue
      }

      const student = await findStudentForCourse(supabase, item.student_id, job.course_id)
      const studentMoodleUserId = Number(student?.moodle_user_id)
      const completedAt = new Date().toISOString()

      if (!student || !Number.isFinite(studentMoodleUserId)) {
        const errorResult = buildControlledErrorSuggestionResult(
          'O aluno nao possui um identificador Moodle valido para esta operacao.',
        )

        await failGradeSuggestionJobItem(supabase, {
          completedAt,
          errorMessage: errorResult.warnings[0],
          itemId: item.id,
          resultPayload: errorResult,
        })
        continue
      }

      try {
        const output = await runSuggestionGeneration({
          supabase,
          payload: { moodleUrl: params.moodleUrl, token: params.token },
          userId: params.userId,
          courseId: job.course_id,
          studentId: item.student_id,
          studentActivityId: item.student_activity_id,
          moodleActivityId: job.moodle_activity_id,
          fallbackMaxGrade: job.max_grade ?? null,
          moodleCourseId: Number(course.moodle_course_id),
          studentMoodleUserId,
          config,
          getContext,
          studentName: student.full_name ?? undefined,
          tutorName: tutorName ?? undefined,
        })

        if (output.result.status === 'error') {
          await failGradeSuggestionJobItem(supabase, {
            auditId: output.auditId,
            completedAt,
            errorMessage: output.result.warnings[0] ?? 'Falha ao gerar sugestao com IA.',
            itemId: item.id,
            resultPayload: output.result,
          })
          continue
        }

        await completeGradeSuggestionJobItem(supabase, {
          auditId: output.auditId,
          completedAt,
          itemId: item.id,
          resultPayload: output.result,
        })
      } catch (error) {
        const errorResult = buildControlledErrorSuggestionResult(
          error instanceof Error ? error.message : 'Falha inesperada ao gerar sugestao com IA.',
        )

        await failGradeSuggestionJobItem(supabase, {
          completedAt,
          errorMessage: errorResult.warnings[0],
          itemId: item.id,
          resultPayload: errorResult,
        })
      }
    }

    const progress = await updateGradeSuggestionJobProgress(supabase, job.id)

    if (progress.pendingCount === 0) {
      const finalStatus = progress.errorCount > 0 && progress.successCount === 0 ? 'failed' : 'completed'
      await completeGradeSuggestionJob(supabase, job.id, {
        completedAt: new Date().toISOString(),
        errorCount: progress.errorCount,
        processedItems: progress.processedItems,
        status: finalStatus,
        successCount: progress.successCount,
        totalItems: progress.totalItems,
      })
      return
    }

    scheduleActivitySuggestionJobRun(params)
  } catch (error) {
    await failGradeSuggestionJob(
      supabase,
      params.jobId,
      error instanceof Error ? error.message : 'Falha inesperada ao processar job de correcao em lote.',
      new Date().toISOString(),
    )
  }
}

export async function handleGradeSuggestionRequest(
  payload: MoodleGradeSuggestionPayload,
  userId: string,
): Promise<Response> {
  const supabase = createServiceClient()

  if (payload.action === 'generate_suggestion') {
    console.log('[moodle-grade-suggestions] Generating suggestion', {
      userId,
      courseId: payload.courseId,
      studentId: payload.studentId,
      moodleActivityId: payload.moodleActivityId,
    })

    const [course, student, activity, storedSettings, tutorName] = await Promise.all([
      findCourseForUser(supabase, userId, payload.courseId),
      findStudentForCourse(supabase, payload.studentId, payload.courseId),
      findStudentActivityForSuggestion(supabase, payload.studentId, payload.courseId, payload.moodleActivityId),
      readStoredLlmSettings(),
      findUserFullName(supabase, userId),
    ])

    if (!course) {
      return jsonResponse({ success: false, message: 'Curso nao encontrado ou sem acesso para este usuario.' }, 404)
    }

    if (!student) {
      return jsonResponse({ success: false, message: 'Aluno nao encontrado neste curso.' }, 404)
    }

    if (!activity || !isAssignActivityType(activity.activity_type)) {
      return jsonResponse({ success: false, message: 'A atividade selecionada nao e um assign compativel com a correcao por IA.' }, 400)
    }

    const config = resolveGradeSuggestionRuntimeConfig(storedSettings, storedSettings.aiGradingSettings)
    if (!config.enabled) {
      return jsonResponse(buildErrorResult('A analise automatica de notas esta desabilitada no ambiente.'), 200)
    }

    if (!config.llmConfigured) {
      return jsonResponse(buildErrorResult('Configure a Claris IA global em Administracao > Configuracoes antes de usar a sugestao de notas.'), 200)
    }

    const studentMoodleUserId = Number(student.moodle_user_id)
    if (!Number.isFinite(studentMoodleUserId)) {
      return jsonResponse(buildErrorResult('O aluno nao possui um identificador Moodle valido para esta operacao.'), 200)
    }

    const getContext = createContextLoader({
      moodleUrl: payload.moodleUrl,
      token: payload.token,
      courseId: payload.courseId,
      moodleCourseId: Number(course.moodle_course_id),
      moodleActivityId: payload.moodleActivityId,
      fallbackMaxGrade: activity.grade_max ?? null,
      config,
    })

    const output = await runSuggestionGeneration({
      supabase,
      payload,
      userId,
      courseId: payload.courseId,
      studentId: payload.studentId,
      studentActivityId: activity.id,
      moodleActivityId: payload.moodleActivityId,
      fallbackMaxGrade: activity.grade_max ?? null,
      moodleCourseId: Number(course.moodle_course_id),
      studentMoodleUserId,
      config,
      getContext,
      studentName: student.full_name ?? undefined,
      tutorName: tutorName ?? undefined,
    })

    console.log('[moodle-grade-suggestions] Suggestion finished', {
      auditId: output.auditId,
      status: output.result.status,
      confidence: output.result.confidence,
    })

    return jsonResponse({
      success: output.result.status !== 'error',
      auditId: output.auditId,
      result: output.result,
    })
  }

  if (payload.action === 'generate_activity_suggestions') {
    console.log('[moodle-grade-suggestions] Generating activity suggestions', {
      userId,
      courseId: payload.courseId,
      moodleActivityId: payload.moodleActivityId,
    })

    const [course, targets, storedSettings] = await Promise.all([
      findCourseForUser(supabase, userId, payload.courseId),
      listStudentActivitiesForSuggestion(supabase, payload.courseId, payload.moodleActivityId),
      readStoredLlmSettings(),
    ])

    if (!course) {
      return jsonResponse({ success: false, message: 'Curso nao encontrado ou sem acesso para este usuario.' }, 404)
    }

    if (targets.length === 0) {
      return jsonResponse(buildBatchErrorResult('Nenhuma entrega pendente de correcao foi encontrada para esta atividade.'), 200)
    }

    const sampleActivity = targets[0]
    if (!isAssignActivityType(sampleActivity.activityType)) {
      return jsonResponse({ success: false, message: 'A atividade selecionada nao e um assign compativel com a correcao por IA.' }, 400)
    }

    const config = resolveGradeSuggestionRuntimeConfig(storedSettings, storedSettings.aiGradingSettings)
    if (!config.enabled) {
      return jsonResponse(buildBatchErrorResult('A analise automatica de notas esta desabilitada no ambiente.'), 200)
    }

    if (!config.llmConfigured) {
      return jsonResponse(buildBatchErrorResult('Configure a Claris IA global em Administracao > Configuracoes antes de usar a sugestao de notas.'), 200)
    }

    const existingJob = await findActiveGradeSuggestionJobForActivity(supabase, {
      courseId: payload.courseId,
      moodleActivityId: payload.moodleActivityId,
      userId,
    })

    if (existingJob) {
      const shouldResumeExistingJob =
        existingJob.status === 'pending' ||
        (existingJob.status === 'failed' && existingJob.processed_items < existingJob.total_items)

      if (shouldResumeExistingJob) {
        await markGradeSuggestionJobProcessing(supabase, existingJob.id, new Date().toISOString())
        scheduleActivitySuggestionJobRun({
          jobId: existingJob.id,
          moodleUrl: payload.moodleUrl,
          token: payload.token,
          userId,
        })
      }

      const response = await loadActivitySuggestionJobResponse(supabase, existingJob.id, userId)
      return jsonResponse(response ?? buildBatchErrorResult('Job de correcao em lote nao encontrado.'), 200)
    }

    const job = await createGradeSuggestionJobWithItems(supabase, {
      activityName: sampleActivity.activityName,
      courseId: payload.courseId,
      items: targets.map((target) => ({
        moodleActivityId: payload.moodleActivityId,
        studentActivityId: target.id,
        studentId: target.studentId,
        studentName: target.student?.full_name ?? 'Aluno nao identificado',
      })),
      maxGrade: sampleActivity.gradeMax ?? null,
      moodleActivityId: payload.moodleActivityId,
      userId,
    })

    await markGradeSuggestionJobProcessing(supabase, job.id, new Date().toISOString())

    scheduleActivitySuggestionJobRun({
      jobId: job.id,
      moodleUrl: payload.moodleUrl,
      token: payload.token,
      userId,
    })

    const response = await loadActivitySuggestionJobResponse(supabase, job.id, userId)

    return jsonResponse({
      ...(response ?? {
        success: true,
        jobId: job.id,
        status: 'processing',
        totalItems: job.total_items,
        processedItems: 0,
        successCount: 0,
        errorCount: 0,
        items: [],
      }),
      message: `Job iniciado para ${job.total_items} entregas.`,
    }, 202)
  }

  if (payload.action === 'get_activity_suggestion_job') {
    const response = await loadActivitySuggestionJobResponse(supabase, payload.jobId, userId)

    if (!response) {
      return jsonResponse({ success: false, message: 'Job de correcao em lote nao encontrado.' }, 404)
    }

    return jsonResponse(response, 200)
  }

  if (payload.action === 'resume_activity_suggestion_job') {
    const job = await findGradeSuggestionJobForUser(supabase, payload.jobId, userId)

    if (!job) {
      return jsonResponse({ success: false, message: 'Job de correcao em lote nao encontrado.' }, 404)
    }

    if (job.status === 'completed') {
      const response = await loadActivitySuggestionJobResponse(supabase, job.id, userId)
      return jsonResponse(response ?? { success: true, jobId: job.id, status: job.status }, 200)
    }

    if (job.status === 'processing') {
      const response = await loadActivitySuggestionJobResponse(supabase, job.id, userId)
      return jsonResponse(response ?? { success: true, jobId: job.id, status: job.status }, 200)
    }

    if (job.processed_items >= job.total_items) {
      const response = await loadActivitySuggestionJobResponse(supabase, job.id, userId)
      return jsonResponse(response ?? { success: true, jobId: job.id, status: job.status }, 200)
    }

    await markGradeSuggestionJobProcessing(supabase, job.id, new Date().toISOString())

    scheduleActivitySuggestionJobRun({
      jobId: job.id,
      moodleUrl: payload.moodleUrl,
      token: payload.token,
      userId,
    })

    const response = await loadActivitySuggestionJobResponse(supabase, job.id, userId)
    return jsonResponse(response ?? { success: true, jobId: job.id, status: 'processing' }, 202)
  }

  const storedAudit = await loadGradeSuggestionAuditForUser(supabase, payload.auditId, userId)
  if (!storedAudit) {
    return jsonResponse({ success: false, message: 'Sugestao nao encontrada para aprovacao.' }, 404)
  }

  console.log('[moodle-grade-suggestions] Approving suggestion', {
    userId,
    auditId: payload.auditId,
    courseId: storedAudit.course_id,
    studentId: storedAudit.student_id,
  })

  const [course, student, storedSettings] = await Promise.all([
    findCourseForUser(supabase, userId, storedAudit.course_id),
    findStudentForCourse(supabase, storedAudit.student_id, storedAudit.course_id),
    readStoredLlmSettings(),
  ])

  if (!course || !student) {
    return jsonResponse({ success: false, message: 'Nao foi possivel validar curso/aluno desta sugestao.' }, 400)
  }

  const studentMoodleUserId = Number(student.moodle_user_id)
  if (!Number.isFinite(studentMoodleUserId)) {
    return jsonResponse({ success: false, message: 'O aluno nao possui identificador Moodle valido.' }, 400)
  }

  const approvalConfig = resolveGradeSuggestionRuntimeConfig(storedSettings, storedSettings.aiGradingSettings)

  const approval = await approveGradeSuggestion({
    auditId: payload.auditId,
    approvedGrade: payload.approvedGrade,
    approvedFeedback: payload.approvedFeedback,
    approvedAt: new Date().toISOString(),
  }, {
    loadAudit: async () => ({
      id: storedAudit.id,
      status: storedAudit.status,
      maxGrade: storedAudit.max_grade,
      moodleAssignId: storedAudit.moodle_assign_id,
      studentId: storedAudit.student_id,
      courseId: storedAudit.course_id,
      studentActivityId: storedAudit.student_activity_id,
    }),
    saveGradeToMoodle: async ({ audit, approvedGrade, approvedFeedback }) => {
      if (!audit.moodleAssignId) {
        throw new Error('Sugestao sem referencia valida de assign no Moodle.')
      }

      const response = await callMoodleApiPost(payload.moodleUrl, payload.token, 'mod_assign_save_grade', {
        assignmentid: audit.moodleAssignId,
        userid: studentMoodleUserId,
        grade: approvedGrade,
        attemptnumber: -1,
        addattempt: 0,
        workflowstate: 'released',
        applytoall: 0,
        'plugindata[assignfeedbackcomments_editor][text]': approvedFeedback,
        'plugindata[assignfeedbackcomments_editor][format]': 1,
      })

      return response && typeof response === 'object'
        ? response as Record<string, unknown>
        : null
    },
    markActivityApproved: async ({ audit, approvedGrade }) => {
      if (!audit.studentActivityId) {
        return
      }

      const approvedAt = new Date().toISOString()
      await markStudentActivityApproved(supabase, {
        studentActivityId: audit.studentActivityId,
        approvedGrade,
        maxGrade: audit.maxGrade,
        approvedAt,
      })
      await refreshDashboardCourseActivityAggregates(supabase, [audit.courseId]).catch(() => undefined)
    },
    finalizeAudit: async (auditId, input) => {
      await updateGradeSuggestionAudit(supabase, auditId, {
        status: input.status,
        approved_grade: input.approvedGrade ?? null,
        approved_feedback: input.approvedFeedback ?? null,
        approved_at: input.approvedAt ?? null,
        approval_response: input.approvalResponse ?? {},
        error_message: input.errorMessage ?? null,
        updated_at: new Date().toISOString(),
      }, approvalConfig.maxStoredTextLength)
    },
  })

  console.log('[moodle-grade-suggestions] Approval finished', {
    auditId: payload.auditId,
    success: approval.success,
  })

  return jsonResponse(approval, 200)
}
