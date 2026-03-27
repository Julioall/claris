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

    if (!activity || !['assign', 'assignment'].includes((activity.activity_type ?? '').toLowerCase())) {
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

    let cachedContextPromise: Promise<Awaited<ReturnType<typeof buildActivityEvaluationContext>>> | null = null
    const getContext = () => {
      if (!cachedContextPromise) {
        cachedContextPromise = buildActivityEvaluationContext({
          moodleUrl: payload.moodleUrl,
          token: payload.token,
          courseId: payload.courseId,
          moodleCourseId: Number(course.moodle_course_id),
          moodleActivityId: payload.moodleActivityId,
          fallbackMaxGrade: activity.grade_max ?? null,
          config,
        })
      }

      return cachedContextPromise
    }

    const output = await generateGradeSuggestion({
      userId,
      studentId: payload.studentId,
      courseId: payload.courseId,
      studentActivityId: activity.id,
      moodleActivityId: payload.moodleActivityId,
    }, {
      createDraftAudit: async (input) => {
        return await insertGradeSuggestionAuditDraft(supabase, {
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
        await updateGradeSuggestionAudit(supabase, auditId, {
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
          updated_at: new Date().toISOString(),
        }, config.maxStoredTextLength)
      },
      buildContext: async () => await getContext(),
      normalizeSubmission: async () => {
        const contextBuild = await getContext()
        return await normalizeStudentSubmission({
          moodleUrl: payload.moodleUrl,
          token: payload.token,
          assignmentId: contextBuild.moodleAssignId,
          studentMoodleUserId,
          studentId: payload.studentId,
          config,
        })
      },
      evaluate: async ({ context, submission }) => {
        return await executeAiEvaluation({
          provider: config.provider,
          model: config.model,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          timeoutMs: config.timeoutMs,
        }, {
          maxGrade: context.maxGrade,
          activityContext: context,
          studentSubmission: submission,
        })
      },
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
