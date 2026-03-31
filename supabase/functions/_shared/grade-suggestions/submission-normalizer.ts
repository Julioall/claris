import { callMoodleApi } from '../moodle/mod.ts'
import { withTemporaryMoodleFile } from './file-support.ts'
import { collapseWhitespace, stripHtmlToText } from './text.ts'
import type { GradeSuggestionRuntimeConfig } from './config.ts'
import type { SubmissionNormalizationResult } from './orchestrator.ts'
import type { ExtractedFile, MoodleFileReference, NormalizedSubmission, SuggestionConfidence } from './types.ts'

interface NormalizeSubmissionParams {
  moodleUrl: string
  token: string
  assignmentId: number
  studentMoodleUserId: number
  studentId: string
  config: GradeSuggestionRuntimeConfig
}

interface SubmissionReviewState {
  confidence: SuggestionConfidence
}

function extractSubmissionTexts(submission: Record<string, unknown>): string[] {
  const parts: string[] = []
  const plugins = Array.isArray(submission.plugins) ? submission.plugins : []

  for (const plugin of plugins) {
    if (!plugin || typeof plugin !== 'object') continue

    const editorFields = Array.isArray((plugin as { editorfields?: unknown[] }).editorfields)
      ? (plugin as { editorfields: Array<{ text?: unknown }> }).editorfields
      : []
    const textFields = Array.isArray((plugin as { textfields?: unknown[] }).textfields)
      ? (plugin as { textfields: Array<{ text?: unknown; value?: unknown }> }).textfields
      : []

    for (const field of editorFields) {
      if (typeof field.text === 'string' && field.text.trim()) {
        parts.push(stripHtmlToText(field.text))
      }
    }

    for (const field of textFields) {
      const value = typeof field.text === 'string'
        ? field.text
        : typeof field.value === 'string'
          ? field.value
          : ''

      if (value.trim()) {
        parts.push(stripHtmlToText(value))
      }
    }
  }

  return parts.filter(Boolean)
}

function extractSubmissionFiles(submission: Record<string, unknown>): MoodleFileReference[] {
  const files: MoodleFileReference[] = []
  const plugins = Array.isArray(submission.plugins) ? submission.plugins : []

  for (const plugin of plugins) {
    if (!plugin || typeof plugin !== 'object') continue

    const fileAreas = Array.isArray((plugin as { fileareas?: unknown[] }).fileareas)
      ? (plugin as { fileareas: Array<{ files?: unknown[] }> }).fileareas
      : []

    for (const fileArea of fileAreas) {
      for (const file of Array.isArray(fileArea.files) ? fileArea.files : []) {
        if (file && typeof file === 'object') {
          files.push(file as MoodleFileReference)
        }
      }
    }
  }

  return files
}

export function deriveSubmissionReviewState(params: {
  typedText: string
  extractedFiles: ExtractedFile[]
}): SubmissionReviewState {
  const typedTextLength = params.typedText.trim().length
  const totalFileTextLength = params.extractedFiles.reduce((sum, file) => sum + file.textLength, 0)
  const totalExtractedTextLength = typedTextLength + totalFileTextLength

  let confidence: SuggestionConfidence = 'low'
  if (
    typedTextLength >= 800 ||
    params.extractedFiles.some((file) => file.extractionQuality === 'high') ||
    totalExtractedTextLength >= 1500
  ) {
    confidence = 'high'
  } else if (
    typedTextLength >= 150 ||
    params.extractedFiles.some((file) => file.extractionQuality === 'medium') ||
    totalExtractedTextLength >= 250
  ) {
    confidence = 'medium'
  }

  return {
    confidence,
  }
}

async function extractSubmissionFile(params: {
  token: string
  file: MoodleFileReference
  config: GradeSuggestionRuntimeConfig
}): Promise<ExtractedFile> {
  const fileName = params.file.filename?.trim() || 'arquivo'
  const mimeType = params.file.mimetype?.trim() || 'application/octet-stream'

  return await withTemporaryMoodleFile({
    file: params.file,
    token: params.token,
    maxFileBytes: params.config.maxFileBytes,
    onDownloaded: async ({ bytes, mimeType: downloadedMimeType }) => {
      return {
        name: fileName,
        mimeType: downloadedMimeType,
        extractedText: '',
        extractionQuality: 'none',
        requiresVisualAnalysis: true,
        textLength: 0,
        sourceUrl: params.file.fileurl ?? null,
        warning: null,
        fileBytes: bytes,
      }
    },
  })
}

export async function normalizeStudentSubmission(
  params: NormalizeSubmissionParams,
): Promise<SubmissionNormalizationResult> {
  const rawSubmissionData = await callMoodleApi(params.moodleUrl, params.token, 'mod_assign_get_submissions', {
    'assignmentids[0]': params.assignmentId,
  })

  const assignments = Array.isArray(rawSubmissionData?.assignments)
    ? rawSubmissionData.assignments as Array<{ submissions?: unknown[] }>
    : []
  const submissions = Array.isArray(assignments[0]?.submissions)
    ? assignments[0].submissions as Record<string, unknown>[]
    : []

  const submission = submissions.find((candidate) => Number(candidate.userid) === params.studentMoodleUserId)

  if (!submission) {
    const missingSubmission: NormalizedSubmission = {
      submissionId: null,
      studentId: params.studentId,
      typedText: '',
      extractedFiles: [],
      confidence: 'low',
      warnings: ['Nenhuma submissão foi localizada no Moodle para este aluno.'],
      status: 'missing',
      attemptNumber: null,
    }

    return {
      submission: missingSubmission,
      sourcesUsed: [],
      submissionSummary: {
        submission_found: false,
      },
    }
  }

  const typedText = collapseWhitespace(extractSubmissionTexts(submission).join('\n\n'))
  const extractedFiles: ExtractedFile[] = []
  const warnings: string[] = []

  for (const file of extractSubmissionFiles(submission)) {
    try {
      const extracted = await extractSubmissionFile({
        token: params.token,
        file,
        config: params.config,
      })

      extractedFiles.push(extracted)

      if (extracted.warning) {
        warnings.push(extracted.warning)
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Falha ao processar arquivo da submissão.')
    }
  }

  const reviewState = deriveSubmissionReviewState({
    typedText,
    extractedFiles,
  })

  const submissionResult: NormalizedSubmission = {
    submissionId: typeof submission.id === 'number' || typeof submission.id === 'string'
      ? String(submission.id)
      : null,
    studentId: params.studentId,
    typedText,
    extractedFiles,
    confidence: reviewState.confidence,
    warnings,
    status: submission.status === 'draft' ? 'draft' : 'submitted',
    attemptNumber: typeof submission.attemptnumber === 'number' ? submission.attemptnumber : null,
  }

  const sourcesUsed: SubmissionNormalizationResult['sourcesUsed'] = []
  if (typedText) {
    sourcesUsed.push({
      label: 'Texto digitado no Moodle',
      type: 'submission_text',
      extractionQuality: 'high',
      requiresVisualAnalysis: false,
    })
  }

  for (const file of extractedFiles) {
    sourcesUsed.push({
      label: file.name,
      type: 'submission_file',
      extractionQuality: file.extractionQuality,
      requiresVisualAnalysis: file.requiresVisualAnalysis,
    })
  }

  return {
    submission: submissionResult,
    sourcesUsed,
    submissionSummary: {
      submission_found: true,
      submission_status: submissionResult.status,
      typed_text_length: typedText.length,
      file_count: extractedFiles.length,
      confidence: submissionResult.confidence,
    },
  }
}
