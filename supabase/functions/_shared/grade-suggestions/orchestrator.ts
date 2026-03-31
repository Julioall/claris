import type {
  ActivityEvaluationContext,
  GradeSuggestionAuditDraft,
  GradeSuggestionAuditFinalizeInput,
  GradeSuggestionResult,
  NormalizedSubmission,
  SuggestionConfidence,
} from './types.ts'
import type { AiEvaluationExecutionResult } from './ai-evaluation.ts'

export interface ContextBuildResult {
  context: ActivityEvaluationContext
  sourcesUsed: GradeSuggestionResult['sourcesUsed']
  contextSummary: Record<string, unknown>
  moodleAssignId: number
}

export interface SubmissionNormalizationResult {
  submission: NormalizedSubmission
  sourcesUsed: GradeSuggestionResult['sourcesUsed']
  submissionSummary: Record<string, unknown>
}

export interface GenerateSuggestionDependencies {
  createDraftAudit(input: GradeSuggestionAuditDraft): Promise<string>
  finalizeAudit(auditId: string, input: GradeSuggestionAuditFinalizeInput): Promise<void>
  buildContext(): Promise<ContextBuildResult>
  normalizeSubmission(): Promise<SubmissionNormalizationResult>
  evaluate(request: {
    context: ActivityEvaluationContext
    submission: NormalizedSubmission
  }): Promise<AiEvaluationExecutionResult>
  visionEnabled?: boolean
}

export interface GenerateSuggestionOutput {
  auditId: string
  result: GradeSuggestionResult
}

export interface ApprovalAuditRecord {
  id: string
  status: string
  maxGrade: number | null
  moodleAssignId: number | null
  studentId: string
  courseId: string
  studentActivityId: string | null
}

export interface ApproveSuggestionDependencies {
  loadAudit(): Promise<ApprovalAuditRecord | null>
  saveGradeToMoodle(input: {
    audit: ApprovalAuditRecord
    approvedGrade: number
    approvedFeedback: string
  }): Promise<Record<string, unknown> | null>
  markActivityApproved(input: {
    audit: ApprovalAuditRecord
    approvedGrade: number
    approvedFeedback: string
  }): Promise<void>
  finalizeAudit(auditId: string, input: GradeSuggestionAuditFinalizeInput): Promise<void>
}

export interface ApproveSuggestionOutput {
  success: boolean
  message?: string
  approvedGrade?: number
  approvedFeedback?: string
}

function mergeSources(
  ...groups: Array<GradeSuggestionResult['sourcesUsed']>
): GradeSuggestionResult['sourcesUsed'] {
  const unique = new Map<string, GradeSuggestionResult['sourcesUsed'][number]>()

  for (const group of groups) {
    for (const item of group) {
      unique.set(`${item.type}:${item.label}`, item)
    }
  }

  return Array.from(unique.values())
}

function resolveConfidence(
  submissionConfidence: SuggestionConfidence,
  aiConfidence?: SuggestionConfidence,
): SuggestionConfidence {
  if (!aiConfidence) {
    return submissionConfidence
  }

  if (submissionConfidence === 'low' || aiConfidence === 'low') {
    return 'low'
  }

  if (submissionConfidence === 'medium' || aiConfidence === 'medium') {
    return 'medium'
  }

  return 'high'
}

function buildNoContentResult(
  contextSources: GradeSuggestionResult['sourcesUsed'],
  submissionSources: GradeSuggestionResult['sourcesUsed'],
  submission: NormalizedSubmission,
): GradeSuggestionResult {
  return {
    status: 'invalid',
    suggestedGrade: 0,
    suggestedFeedback: 'Nenhum conteudo textual foi encontrado na submissao analisada.',
    confidence: 'low',
    sourcesUsed: mergeSources(contextSources, submissionSources),
    warnings: submission.warnings,
    evaluationStatus: 'sem_conteudo_textual',
    reason: 'submission_without_text',
  }
}

function buildNonSubmittedResult(
  contextSources: GradeSuggestionResult['sourcesUsed'],
  submissionSources: GradeSuggestionResult['sourcesUsed'],
  submission: NormalizedSubmission,
): GradeSuggestionResult {
  const message = submission.status === 'draft'
    ? 'A submissao encontrada ainda esta em rascunho no Moodle e precisa de revisao humana.'
    : 'Nenhuma submissao enviada foi localizada no Moodle para este aluno.'

  return {
    status: 'manual_review_required',
    suggestedGrade: null,
    suggestedFeedback: message,
    confidence: 'low',
    sourcesUsed: mergeSources(contextSources, submissionSources),
    warnings: [...submission.warnings, message],
    evaluationStatus: 'submissao_nao_disponivel_para_correcao',
    reason: submission.status === 'draft' ? 'draft_submission' : 'missing_submission',
  }
}

export async function generateGradeSuggestion(
  input: GradeSuggestionAuditDraft,
  deps: GenerateSuggestionDependencies,
): Promise<GenerateSuggestionOutput> {
  const auditId = await deps.createDraftAudit(input)

  try {
    const contextBuild = await deps.buildContext()
    const normalizedSubmission = await deps.normalizeSubmission()
    const combinedSources = mergeSources(contextBuild.sourcesUsed, normalizedSubmission.sourcesUsed)

    if (normalizedSubmission.submission.status !== 'submitted') {
      const result = buildNonSubmittedResult(
        contextBuild.sourcesUsed,
        normalizedSubmission.sourcesUsed,
        normalizedSubmission.submission,
      )

      await deps.finalizeAudit(auditId, {
        status: result.status,
        confidence: result.confidence,
        suggestedGrade: result.suggestedGrade,
        suggestedFeedback: result.suggestedFeedback,
        maxGrade: contextBuild.context.maxGrade,
        moodleAssignId: contextBuild.moodleAssignId,
        warnings: result.warnings,
        sourcesUsed: result.sourcesUsed,
        contextSummary: contextBuild.contextSummary,
        submissionSummary: normalizedSubmission.submissionSummary,
      })

      return { auditId, result }
    }

    const hasVisionImages = Boolean(deps.visionEnabled) &&
      normalizedSubmission.submission.extractedFiles.some(
        (file) => file.requiresVisualAnalysis && file.fileBytes,
      )

    if (normalizedSubmission.submission.requiresManualReview && !hasVisionImages) {
      const result: GradeSuggestionResult = {
        status: 'manual_review_required',
        suggestedGrade: null,
        suggestedFeedback: 'A resposta nao pode ser avaliada automaticamente pois depende de analise visual.',
        confidence: 'low',
        sourcesUsed: combinedSources,
        warnings: normalizedSubmission.submission.warnings,
        evaluationStatus: 'revisao_manual_necessaria',
        reason: 'visual_dependency',
      }

      await deps.finalizeAudit(auditId, {
        status: 'manual_review_required',
        confidence: result.confidence,
        suggestedGrade: result.suggestedGrade,
        suggestedFeedback: result.suggestedFeedback,
        maxGrade: contextBuild.context.maxGrade,
        moodleAssignId: contextBuild.moodleAssignId,
        warnings: result.warnings,
        sourcesUsed: result.sourcesUsed,
        contextSummary: contextBuild.contextSummary,
        submissionSummary: normalizedSubmission.submissionSummary,
      })

      return { auditId, result }
    }

    const submissionHasContent =
      normalizedSubmission.submission.typedText.trim().length > 0 ||
      normalizedSubmission.submission.extractedFiles.some((file) => file.textLength > 0) ||
      hasVisionImages

    if (!submissionHasContent) {
      const result = buildNoContentResult(
        contextBuild.sourcesUsed,
        normalizedSubmission.sourcesUsed,
        normalizedSubmission.submission,
      )

      await deps.finalizeAudit(auditId, {
        status: 'invalid',
        confidence: result.confidence,
        suggestedGrade: result.suggestedGrade,
        suggestedFeedback: result.suggestedFeedback,
        maxGrade: contextBuild.context.maxGrade,
        moodleAssignId: contextBuild.moodleAssignId,
        warnings: result.warnings,
        sourcesUsed: result.sourcesUsed,
        contextSummary: contextBuild.contextSummary,
        submissionSummary: normalizedSubmission.submissionSummary,
      })

      return { auditId, result }
    }

    const evaluation = await deps.evaluate({
      context: contextBuild.context,
      submission: normalizedSubmission.submission,
    })

    const result: GradeSuggestionResult = {
      status: evaluation.evaluation.notaRecomendada === null
        ? 'manual_review_required'
        : evaluation.evaluation.valida
          ? 'success'
          : 'invalid',
      suggestedGrade: evaluation.evaluation.notaRecomendada,
      suggestedFeedback: evaluation.evaluation.feedback,
      confidence: resolveConfidence(
        normalizedSubmission.submission.confidence,
        evaluation.evaluation.confidence,
      ),
      sourcesUsed: combinedSources,
      warnings: normalizedSubmission.submission.warnings,
      evaluationStatus: evaluation.evaluation.valida ? 'avaliacao_valida' : 'avaliacao_invalida',
      reason: evaluation.evaluation.reason,
    }

    await deps.finalizeAudit(auditId, {
      status: result.status,
      confidence: result.confidence,
      suggestedGrade: result.suggestedGrade,
      suggestedFeedback: result.suggestedFeedback,
      maxGrade: contextBuild.context.maxGrade,
      moodleAssignId: contextBuild.moodleAssignId,
      warnings: result.warnings,
      sourcesUsed: result.sourcesUsed,
      contextSummary: contextBuild.contextSummary,
      submissionSummary: normalizedSubmission.submissionSummary,
      promptPayload: evaluation.promptPayload,
      aiResponse: evaluation.rawResponse,
      provider: evaluation.provider,
      model: evaluation.model,
    })

    return { auditId, result }
  } catch (error) {
    const result: GradeSuggestionResult = {
      status: 'error',
      suggestedGrade: null,
      suggestedFeedback: null,
      confidence: 'low',
      sourcesUsed: [],
      warnings: [
        error instanceof Error
          ? error.message
          : 'Nao foi possivel gerar a sugestao automatica.',
      ],
      evaluationStatus: 'erro_controlado',
      reason: 'generation_failed',
    }

    await deps.finalizeAudit(auditId, {
      status: 'error',
      confidence: 'low',
      warnings: result.warnings,
      errorMessage: result.warnings[0],
    })

    return { auditId, result }
  }
}

export async function approveGradeSuggestion(
  input: {
    auditId: string
    approvedGrade: number
    approvedFeedback: string
    approvedAt: string
  },
  deps: ApproveSuggestionDependencies,
): Promise<ApproveSuggestionOutput> {
  const audit = await deps.loadAudit()

  if (!audit) {
    return { success: false, message: 'Sugestao nao encontrada para aprovacao.' }
  }

  if (!audit.moodleAssignId) {
    return { success: false, message: 'Sugestao sem referencia valida de atividade no Moodle.' }
  }

  if (!['success', 'invalid', 'manual_review_required'].includes(audit.status)) {
    return { success: false, message: 'Somente sugestoes revisadas podem ser aprovadas nesta etapa.' }
  }

  const maxGrade = audit.maxGrade ?? input.approvedGrade
  const approvedGrade = Number(Math.max(0, Math.min(maxGrade, input.approvedGrade)).toFixed(2))
  const approvedFeedback = input.approvedFeedback.trim()

  try {
    const approvalResponse = await deps.saveGradeToMoodle({
      audit,
      approvedGrade,
      approvedFeedback,
    })

    await deps.markActivityApproved({
      audit,
      approvedGrade,
      approvedFeedback,
    })

    await deps.finalizeAudit(audit.id, {
      status: 'approved',
      approvedGrade,
      approvedFeedback,
      approvedAt: input.approvedAt,
      approvalResponse,
    })

    return {
      success: true,
      approvedGrade,
      approvedFeedback,
    }
  } catch (error) {
    await deps.finalizeAudit(audit.id, {
      status: 'approval_error',
      approvedGrade,
      approvedFeedback,
      errorMessage: error instanceof Error ? error.message : 'Falha ao lancar nota no Moodle.',
    })

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Falha ao lancar nota no Moodle.',
    }
  }
}
