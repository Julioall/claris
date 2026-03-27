import { refreshDashboardCourseActivityAggregates } from '../_shared/domain/dashboard-activity-aggregates.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { executeAiEvaluation } from '../_shared/grade-suggestions/ai-evaluation.ts'
import { resolveGradeSuggestionRuntimeConfig } from '../_shared/grade-suggestions/config.ts'
import { buildActivityEvaluationContext } from '../_shared/grade-suggestions/context-builder.ts'
import { approveGradeSuggestion, generateGradeSuggestion } from '../_shared/grade-suggestions/orchestrator.ts'
import {
  findCourseForUser,
  findStudentActivityForSuggestion,
  findStudentForCourse,
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
    generatedCount: 0,
    errorCount: 0,
    results: [],
  }
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
      }, {
        maxGrade: context.maxGrade,
        activityContext: context,
        studentSubmission: submission,
      })
    },
  })
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

    const [course, student, activity, storedSettings] = await Promise.all([
      findCourseForUser(supabase, userId, payload.courseId),
      findStudentForCourse(supabase, payload.studentId, payload.courseId),
      findStudentActivityForSuggestion(supabase, payload.studentId, payload.courseId, payload.moodleActivityId),
      readStoredLlmSettings(),
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

    const getContext = createContextLoader({
      moodleUrl: payload.moodleUrl,
      token: payload.token,
      courseId: payload.courseId,
      moodleCourseId: Number(course.moodle_course_id),
      moodleActivityId: payload.moodleActivityId,
      fallbackMaxGrade: sampleActivity.gradeMax ?? null,
      config,
    })

    const results: Array<{
      studentId: string
      studentActivityId: string
      auditId?: string
      result: Awaited<ReturnType<typeof runSuggestionGeneration>>['result']
    }> = []

    for (const target of targets) {
      const studentMoodleUserId = Number(target.student?.moodle_user_id)

      const output = await runSuggestionGeneration({
        supabase,
        payload,
        userId,
        courseId: payload.courseId,
        studentId: target.studentId,
        studentActivityId: target.id,
        moodleActivityId: payload.moodleActivityId,
        fallbackMaxGrade: target.gradeMax ?? null,
        moodleCourseId: Number(course.moodle_course_id),
        studentMoodleUserId,
        config,
        getContext,
      })

      results.push({
        studentId: target.studentId,
        studentActivityId: target.id,
        auditId: output.auditId,
        result: output.result,
      })
    }

    const errorCount = results.filter((entry) => entry.result.status === 'error').length
    const generatedCount = results.length - errorCount
    const message = errorCount > 0
      ? `${generatedCount} sugestoes geradas e ${errorCount} com erro.`
      : `${generatedCount} sugestoes geradas com sucesso.`

    return jsonResponse({
      success: true,
      message,
      generatedCount,
      errorCount,
      results,
    })
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
